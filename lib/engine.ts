/** Staged state machine. Each advance() runs ONE short stage so every Vercel function stays within its time limit. */
import { logEvent, patch, q } from "./db";
import { findPoc } from "./hunter";
import * as P from "./pipeline";
import { rules } from "./rules";
import { cleanDomain, scrapeSite } from "./scrape";
import { sendEmail } from "./send";
import type { Company, Contact, Corpus, Email, Pain } from "./types";
import { TERMINAL } from "./types";

const MAX_DRAFT_ATTEMPTS = 3;

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
    const msg = `${(e as Error).name}: ${(e as Error).message}`;
    await logEvent(id, "error", "failed", msg);
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

  if (p.status === "queued") {
    const d = cleanDomain(domain);
    const { corpus, links } = await scrapeSite(d);
    if (!Object.keys(corpus).length) {
      await logEvent(id, "scrape", "stop", "no pages could be fetched");
      return finish(id, "skipped", "site unreachable");
    }
    await logEvent(id, "scrape", "ok", `${Object.keys(corpus).length} pages`);
    return patch(id, { corpus, links, state: { loop: 0 }, status: "qualifying" });
  }

  if (p.status === "qualifying") {
    const corpus: Corpus = p.corpus;
    const loop: number = state.loop ?? 0;
    const company = await P.extract(corpus, domain);
    const { verdict, score, reasons, missing } = P.qualifyVerdict(company, rules);
    await logEvent(id, "qualify", verdict, reasons.join("; ") || "no scoring signals", { score, missing, loop });

    if (verdict === "FIT") return patch(id, { company, status: "finding_poc" });
    if (verdict === "NOT_FIT") return finish(id, "not_fit", reasons.join("; "));

    // INSUFFICIENT: agent loop (max N) - fetch more pages, then re-extract next stage
    const insufficient = (why: string) => finish(id, "not_fit", `${reasons.join("; ")}; insufficient evidence ${why} (missing: ${missing})`);
    if (loop >= rules.max_research_loops) return insufficient("after research loop");
    const urls = await P.choosePages(missing, p.links ?? {}, new Set(Object.keys(corpus)));
    if (!urls.length) {
      await logEvent(id, "research_loop", "stop", "no useful pages left to fetch", { loop });
      return insufficient("and nothing left to fetch");
    }
    const fresh = await P.fetchPages(urls);
    await logEvent(id, "research_loop", "fetched", `${Object.keys(fresh).length}/${urls.length} pages for ${missing}`, { urls });
    if (!Object.keys(fresh).length) return insufficient("and fetches failed");
    return patch(id, { corpus: { ...corpus, ...fresh }, state: { loop: loop + 1 } });
  }

  if (p.status === "finding_poc") {
    const company: Company = p.company;
    const { contact, reason } = await findPoc(domain, company.headcount_estimate);
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
    if (ok) return patch(id, { email, status: "awaiting_approval" });
    const nextBanned = [...banned, ...P.signalsUsedBy(email.hook_quote, company.signals)];
    const exhausted = company.signals.every((s) => nextBanned.includes(s.evidence));
    if (attempt + 1 >= MAX_DRAFT_ATTEMPTS || exhausted) return finish(id, "held", "no draft passed the claim check");
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
    if (!check.ok) throw new Error(`edit failed claim check: ${check.reason}`);
    email = edited;
  }
  await logEvent(id, "approval", "approved", email.edited ? "Growth Lead approved with edits" : "Growth Lead approved unedited");
  const result = await sendEmail(email, p.contact, p.company?.company_name || p.domain);
  await logEvent(id, "send", "done", result, { subject: email.subject, hook: email.hook_quote });
  const dry = result.startsWith("dry-run");
  await patch(id, { email, status: dry ? "drafted" : "sent", outcome: dry ? "DRAFTED" : "SENT", why: `qualified; ${p.contact.position}; ${result}` });
}

export async function reject(id: number) {
  const rows = await q(`select status from prospects where id=$1`, [id]);
  if (!rows[0]) throw new Error("not found");
  if (rows[0].status !== "awaiting_approval") throw new Error(`cannot reject in status '${rows[0].status}'`);
  await logEvent(id, "approval", "rejected", "Growth Lead declined");
  await finish(id, "rejected", "Growth Lead declined");
}
