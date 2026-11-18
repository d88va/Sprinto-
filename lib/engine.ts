/** Staged state machine. Each advance() runs ONE short stage so every Vercel function stays within its time limit. */
import { logEvent, patch, q } from "./db";
import { findPoc } from "./hunter";
import * as P from "./pipeline";
import { getRules } from "./settings";
import { cleanDomain, scrapeSite } from "./scrape";
import { sendEmail } from "./send";
import type { Company, Contact, Corpus, Email, Pain } from "./types";
import { TERMINAL } from "./types";

const MAX_DRAFT_ATTEMPTS = 3;

/** Turn provider/network errors into something the Growth Lead can act on. */
export function friendlyError(e: unknown): string {
  const m = `${(e as Error)?.name ?? ""}: ${(e as Error)?.message ?? e}`;
  if (/NO_AI_KEY/.test(m)) return "No AI key is set. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) in your settings, then try again.";
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|API key expired/i.test(m)) return "Google rejected the Gemini API key. Check GEMINI_API_KEY is correct and active.";
  if (/AI_BUSY/.test(m)) return "Google's Gemini service is overloaded right now. This usually clears within a few minutes. Press Try again shortly.";
  if (/AI_QUOTA|RESOURCE_EXHAUSTED|quota/i.test(m) && !/credit/i.test(m)) return "The Gemini free quota is used up for now. Wait a few minutes and press Try again, or use a paid key.";
  if (/authentication method|x-api-key|invalid api key|AuthenticationError|401/i.test(m) && /anthropic|apiKey|x-api-key|authentication/i.test(m))
    return "The Anthropic API key is missing or not accepted. Add a valid ANTHROPIC_API_KEY in your settings, then try again.";
  if (/credit balance|billing/i.test(m)) return "The Anthropic account is out of credit. Top it up, then try again.";
  if (/rate.?limit|429|overloaded|529/i.test(m)) return "The AI service is busy right now. Wait a minute and try again.";
  if (/HUNTER_API_KEY not set/i.test(m)) return "No Hunter.io key is set. Add HUNTER_API_KEY, or add this contact by hand.";
  if (/Hunter free tier cap/i.test(m)) return "The Hunter.io free plan limit (25 lookups a month) has been reached. You can add this contact by hand instead.";
  if (/Hunter HTTP 401|Hunter HTTP 403/i.test(m)) return "Hunter.io rejected the API key. Check HUNTER_API_KEY.";
  if (/Invalid login|EAUTH|Username and Password not accepted/i.test(m)) return "Gmail rejected the login. Use a Google App Password for GMAIL_APP_PASSWORD, not your normal password.";
  if (/GMAIL_ADDRESS|SEND_TO is not set/i.test(m)) return "Email isn't set up yet. Add GMAIL_ADDRESS, GMAIL_APP_PASSWORD and SEND_TO (or set DRY_RUN=1 to preview only).";
  if (/not a valid domain/i.test(m)) return "That doesn't look like a company website address.";
  if (/model refused/i.test(m)) return "The AI declined to process this site. Try again, or skip this company.";
  if (/bad JSON|no JSON object/i.test(m)) return "The AI gave an answer we couldn't read. Trying again usually fixes this.";
  return (e as Error)?.message ? `Something unexpected happened: ${(e as Error).message}` : "Something unexpected happened.";
}

async function finish(id: number, status: string, why: string) {
  await patch(id, { status, outcome: status.toUpperCase(), why });
}

async function lock(id: number) {
  const rows = await q(
    `update prospects set locked_at=now() where id=$1
       and (locked_at is null or locked_at < now() - interval '5 minutes') returning *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Run the next stage. Returns the new status. */
export async function advance(id: number): Promise<string> {
  const p = await lock(id);
  if (!p) return "busy";
  try {
    if (TERMINAL.includes(p.status) || p.status === "awaiting_approval") return p.status;
    await runStage(p);
  } catch (e) {
    const msg = friendlyError(e);
    await logEvent(id, "error", "failed", msg, { raw: `${(e as Error).name}: ${(e as Error).message}`.slice(0, 500) });
    await finish(id, "error", msg);
  } finally {
    await q(`update prospects set locked_at=null where id=$1`, [id]);
  }
  return (await q(`select status from prospects where id=$1`, [id]))[0].status;
}

async function runStage(p: any) {
  const id: number = p.id;
  const domain: string = p.domain;
  const state = p.state ?? {};
  const rules = await getRules();

  if (p.status === "queued") {
    const d = cleanDomain(domain);
    const { corpus, links } = await scrapeSite(d);
    if (!Object.keys(corpus).length) {
      await logEvent(id, "scrape", "stop", "no pages could be fetched");
      return finish(id, "skipped", "Site unreachable, so there was nothing to read");
    }
    await logEvent(id, "scrape", "ok", `${Object.keys(corpus).length} pages read`);
    return patch(id, { corpus, links, state: { loop: 0 }, status: "qualifying" });
  }

  if (p.status === "qualifying") {
    const corpus: Corpus = p.corpus;
    const loop: number = state.loop ?? 0;
    const company = await P.extract(corpus, domain);
    const { verdict, score, reasons, missing } = P.qualifyVerdict(company, rules);
    const enriched: Company = { ...company, score, reasons };
    await logEvent(id, "qualify", verdict, reasons.join("; ") || "no scoring signals", { score, missing, loop });

    if (verdict === "FIT") return patch(id, { company: enriched, status: "finding_poc" });
    if (verdict === "NOT_FIT") {
      await patch(id, { company: enriched });
      return finish(id, "not_fit", reasons.join("; "));
    }

    // INSUFFICIENT: agent loop (max N) - fetch more pages, then re-extract next stage
    const insufficient = async (why: string) => {
      await patch(id, { company: enriched });
      return finish(id, "not_fit", `Not enough evidence ${why} (missing: ${missing.join(", ")})`);
    };
    if (loop >= rules.max_research_loops) return insufficient("after extra research");
    const urls = await P.choosePages(missing, p.links ?? {}, new Set(Object.keys(corpus)));
    if (!urls.length) {
      await logEvent(id, "research_loop", "stop", "no useful pages left to fetch", { loop });
      return insufficient("and no useful pages were left to read");
    }
    const fresh = await P.fetchPages(urls);
    await logEvent(id, "research_loop", "fetched", `${Object.keys(fresh).length}/${urls.length} extra pages for ${missing.join(", ")}`, { urls });
    if (!Object.keys(fresh).length) return insufficient("and the extra pages failed to load");
    return patch(id, { corpus: { ...corpus, ...fresh }, state: { loop: loop + 1 } });
  }

  if (p.status === "finding_poc") {
    const company: Company = p.company;
    const { contact, reason } = await findPoc(domain, company.headcount_estimate, rules);
    await logEvent(id, "find_poc", contact ? "found" : "none", reason);
    if (!contact) return finish(id, "no_contact", reason);
    return patch(id, { contact, status: "pains" });
  }

  if (p.status === "pains") {
    const pains = await P.painPoints(p.company, p.contact, p.corpus);
    await logEvent(id, "pain_points", "ok", pains.map((x) => x.pain).join("; "), pains);
    return patch(id, { pains, status: "drafting", state: { attempt: 0, banned: [] } });
  }

  if (p.status === "drafting") {
    const company: Company = p.company;
    const contact: Contact = p.contact;
    const attempt: number = state.attempt ?? 0;
    const banned: string[] = state.banned ?? [];
    const sender = process.env.SENDER_NAME ?? "The Sprinto growth team";
    const email: Email = await P.draftEmail(company, contact, p.pains as Pain[], rules, sender, banned);
    const { ok, reason } = P.claimCheck(email, contact, p.corpus);
    await logEvent(id, "claim_check", ok ? "pass" : "drop_hook", reason, { attempt, hook: email.hook_quote });
    if (ok) return patch(id, { email, status: "awaiting_approval", outcome: "READY", why: "Draft ready for your approval" });
    const nextBanned = [...banned, ...P.signalsUsedBy(email.hook_quote, company.signals)];
    const exhausted = company.signals.every((s) => nextBanned.includes(s.evidence));
    if (attempt + 1 >= MAX_DRAFT_ATTEMPTS || exhausted) return finish(id, "held", "No draft passed the claim check, so nothing was written");
    return patch(id, { state: { attempt: attempt + 1, banned: nextBanned } });
  }
}

/** Growth Lead approval gate (step 7). Optional edits are re-checked by the same claim check. */
export async function approve(id: number, edits?: { subject?: string; body?: string }) {
  const rows = await q(`select * from prospects where id=$1`, [id]);
  const p = rows[0];
  if (!p) throw new Error("not found");
  if (p.status !== "awaiting_approval") throw new Error(`cannot approve a prospect in status '${p.status}'`);
  let email: Email = p.email;
  if (edits && ((edits.body && edits.body !== email.body) || (edits.subject && edits.subject !== email.subject))) {
    const edited: Email = { ...email, subject: edits.subject ?? email.subject, body: edits.body ?? email.body, edited: true };
    const check = P.claimCheck(edited, p.contact, p.corpus);
    if (!check.ok) throw new Error(`Your edit failed the claim check: ${check.reason}`);
    email = edited;
  }
  await logEvent(id, "approval", "approved", email.edited ? "Growth Lead approved with edits" : "Growth Lead approved unedited");
  const result = await sendEmail(email, p.contact, p.company?.company_name || p.domain);
  await logEvent(id, "send", "done", result, { subject: email.subject, hook: email.hook_quote });
  const dry = result.startsWith("dry-run");
  await patch(id, { email, status: dry ? "drafted" : "sent", outcome: dry ? "DRAFTED" : "SENT", why: result });
}

export async function reject(id: number) {
  const rows = await q(`select status from prospects where id=$1`, [id]);
  if (!rows[0]) throw new Error("not found");
  if (rows[0].status !== "awaiting_approval") throw new Error(`cannot reject in status '${rows[0].status}'`);
  await logEvent(id, "approval", "rejected", "Growth Lead declined");
  await finish(id, "rejected", "You declined this draft");
}

/** Option B from the brief: the Growth Lead supplies the contact (e.g. from an Apollo lookup). */
export async function setContact(id: number, c: { first_name: string; last_name: string; position: string; email: string }) {
  const rows = await q(`select status from prospects where id=$1`, [id]);
  if (!rows[0]) throw new Error("not found");
  if (rows[0].status !== "no_contact") throw new Error("a contact can only be added to a company that has none");
  const clean = (s: unknown) => String(s ?? "").trim();
  const contact: Contact = {
    first_name: clean(c.first_name), last_name: clean(c.last_name), position: clean(c.position), value: clean(c.email), confidence: 100,
  };
  if (!contact.first_name || !contact.last_name || !contact.position) throw new Error("Name and role are required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.value)) throw new Error("That email address does not look valid");
  await logEvent(id, "find_poc", "manual", `Added by Growth Lead: ${contact.position}`);
  await patch(id, { contact, status: "pains", outcome: null, why: null });
}

/** Start an errored or held prospect again from the beginning. */
export async function retry(id: number) {
  const rows = await q(`select status from prospects where id=$1`, [id]);
  if (!rows[0]) throw new Error("not found");
  if (!["error", "held", "skipped"].includes(rows[0].status)) throw new Error("only errored, held or skipped companies can be retried");
  await logEvent(id, "retry", "restart", "Growth Lead restarted this company");
  await patch(id, { status: "queued", outcome: null, why: null, state: {} });
}
