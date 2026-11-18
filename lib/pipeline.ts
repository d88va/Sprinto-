/** Steps 2,3,5,6 + claim check. Design rule: the LLM extracts and writes; CODE decides. */
import { completeJson } from "./llm";
import { fetchPages } from "./scrape";
import type { Rules } from "./rules";
import type { Company, Contact, Corpus, Email, Pain, Signal, Verdict } from "./types";

export const SIGNAL_TYPES = [
  "preparing_audit", "enterprise_customers", "hiring_security_compliance", "requests_security_docs",
  "trust_or_security_page", "has_gdpr_page", "has_soc2", "has_iso27001",
];
export const STAGES = ["seed", "A", "B", "C", "D+", "public", "bootstrapped", "unknown"];

// ---------- grounding (the Cut: nothing unsupported survives) ----------
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function inCorpus(quote: string | null | undefined, corpus: Corpus, minLen = 12): boolean {
  const q = norm(quote ?? "");
  return q.length >= minLen && Object.values(corpus).some((t) => norm(t).includes(q));
}

export const renderCorpus = (corpus: Corpus) =>
  Object.entries(corpus).map(([u, t]) => `### PAGE ${u}\n${t}`).join("\n\n");

// ---------- step 2: extract ----------
const EXTRACT_SYS = `You extract structured facts about a company from its website text. Never guess.
If the text does not say it, use null / "unknown". Every claim needs a VERBATIM quote (<=200 chars) copied from the pages.

JSON schema:
{
 "company_name": str,
 "one_liner": str,
 "is_saas": true|false|null,
 "stage": one of ${JSON.stringify(STAGES)},   // funding stage if stated on the pages
 "stage_evidence": verbatim quote or null,
 "headcount_estimate": int|null,
 "headcount_evidence": verbatim quote or null,
 "signals": [{"signal": one of ${JSON.stringify(SIGNAL_TYPES)}, "evidence": verbatim quote, "source_url": str}]
}
Signal meanings: preparing_audit = says they are working toward/preparing for SOC 2/ISO/GDPR audit;
enterprise_customers = names or targets enterprise/large customers; hiring_security_compliance = job post for security/compliance/GRC;
requests_security_docs = asks buyers to request security docs / questionnaires; trust_or_security_page = has a security/trust page;
has_gdpr_page / has_soc2 / has_iso27001 = states they already hold it.

Be strict. A signal needs explicit evidence, with a quote of at least a full sentence or phrase (a heading or a team name is not enough):
- hiring_security_compliance: an actual open job posting for a security, compliance or GRC role.
- enterprise_customers: names enterprise customers, or an explicit enterprise plan or enterprise sales offering.
- preparing_audit: explicitly says they are working toward a certification or audit.
- has_soc2 / has_iso27001 / has_gdpr_page: an explicit statement that they hold it.
When unsure, leave the signal out.`;

export function groundExtraction(raw: any, corpus: Corpus): Company {
  let stage = STAGES.includes(raw?.stage) ? raw.stage : "unknown";
  if (stage !== "unknown" && !inCorpus(raw.stage_evidence, corpus)) stage = "unknown";
  let hc: number | null = Number.isInteger(raw?.headcount_estimate) ? raw.headcount_estimate : null;
  if (hc !== null && !inCorpus(raw.headcount_evidence, corpus)) hc = null;
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const s of raw?.signals ?? []) {
    if (SIGNAL_TYPES.includes(s?.signal) && !seen.has(s.signal) && inCorpus(s.evidence, corpus, 20)) {
      seen.add(s.signal);
      signals.push({ signal: s.signal, evidence: s.evidence, source_url: s.source_url ?? "" });
    }
  }
  return {
    company_name: raw?.company_name ?? "", one_liner: raw?.one_liner ?? "",
    is_saas: typeof raw?.is_saas === "boolean" ? raw.is_saas : null,
    stage, headcount_estimate: hc, signals,
  };
}

export async function extract(corpus: Corpus, domain: string): Promise<Company> {
  const raw = await completeJson(EXTRACT_SYS, `Domain: ${domain}\n\n${renderCorpus(corpus)}`);
  return groundExtraction(raw, corpus);
}

// ---------- step 3: qualify (CODE verdict) ----------
export function qualifyVerdict(d: Company, rules: Rules) {
  const reasons: string[] = [];
  const missing: string[] = [];
  if (d.is_saas === false) return { verdict: "NOT_FIT" as Verdict, score: 0, reasons: ["not a SaaS company"], missing };
  if (d.is_saas === null) missing.push("is_saas");
  if (rules.excluded_stages.includes(d.stage))
    return { verdict: "NOT_FIT" as Verdict, score: 0, reasons: [`stage '${d.stage}' excluded by ICP`], missing: [] };
  if (d.stage === "unknown" && d.headcount_estimate === null) missing.push("stage_or_headcount");
  const types = new Set(d.signals.map((s) => s.signal));
  if (!types.size) missing.push("compliance_signals");

  let score = rules.stage_points[d.stage] ?? 0;
  if (score) reasons.push(`stage ${d.stage}: +${score}`);
  const [lo, hi] = rules.headcount_range;
  if (d.headcount_estimate !== null && d.headcount_estimate >= lo && d.headcount_estimate <= hi) {
    score += rules.headcount_points;
    reasons.push(`headcount ~${d.headcount_estimate} in ${lo}-${hi}: +${rules.headcount_points}`);
  }
  for (const t of [...types].sort()) {
    const p = rules.signal_points[t] ?? 0;
    if (p) { score += p; reasons.push(`${t}: +${p}`); }
  }
  if (rules.fully_certified_requires.every((r) => types.has(r))) {
    score += rules.fully_certified_penalty;
    reasons.push(`already holds ${rules.fully_certified_requires.join("+")}: ${rules.fully_certified_penalty}`);
  }
  let verdict: Verdict;
  if (missing.includes("is_saas")) verdict = "INSUFFICIENT";
  else if (score >= rules.fit_threshold) verdict = "FIT";
  else verdict = missing.length ? "INSUFFICIENT" : "NOT_FIT";
  return { verdict, score, reasons, missing };
}

const CHOOSE_SYS = `You are researching whether a company fits Sprinto's ICP (SaaS, Series A-C, preparing for or pressured to get SOC 2/ISO 27001/GDPR).
Some facts are missing. From the candidate links pick at most 2 pages most likely to fill the gaps.
JSON: {"urls": [str, ...]} - only URLs from the list.`;

export async function choosePages(missing: string[], links: Record<string, string>, fetched: Set<string>) {
  const cands = Object.entries(links).filter(([u]) => !fetched.has(u)).slice(0, 80);
  if (!cands.length) return [];
  const listing = cands.map(([u, a]) => `${u}  |  ${a}`).join("\n");
  const out = await completeJson(CHOOSE_SYS, `Missing: ${JSON.stringify(missing)}\n\nLinks:\n${listing}`);
  const allowed = new Set(cands.map(([u]) => u));
  return ((out.urls ?? []) as string[]).filter((u) => allowed.has(u)).slice(0, 2);
}

export { fetchPages };

// ---------- step 5: two pain points ----------
const PAIN_SYS = `You identify the TWO most likely compliance pain points for a specific person at a prospect company.
Use their role and the company evidence provided. For each pain give a company-specific evidence quote copied
VERBATIM from the evidence list, or set evidence_quote to null if the pain is inferred only from the role.
JSON: {"pain_points":[{"pain": str, "why_this_person": str, "evidence_quote": str|null}, {...}]}  (exactly 2)`;

export async function painPoints(company: Company, contact: Contact, corpus: Corpus): Promise<Pain[]> {
  const out = await completeJson(
    PAIN_SYS,
    JSON.stringify({ company: company.company_name, one_liner: company.one_liner, person_role: contact.position, evidence: company.signals }),
  );
  return ((out.pain_points ?? []) as any[]).slice(0, 2).map((p) => ({
    pain: p.pain ?? "", why_this_person: p.why_this_person ?? "",
    evidence_quote: inCorpus(p.evidence_quote, corpus) ? p.evidence_quote : null,
  }));
}

// ---------- step 6: draft ----------
export function draftSystem(rules: Rules, sender: string) {
  const facts = rules.sprinto_facts.map((f) => `- ${f}`).join("\n");
  return `You write a first cold email from ${sender} at Sprinto to one named person.
Hard rules:
- Open with "Hi <first name>,".
- Exactly ONE hook: a specific fact about THEIR company, taken from the provided evidence. Put the verbatim evidence quote in hook_quote.
- Make the email speak to one of the two pain points. Never state facts about the company that are not in the evidence.
- No statistics, customer names, or numbers other than these Sprinto facts:
${facts}
- Under 110 words, plain text, one soft ask (a 15-minute chat), no hype, no attachments.
- End with "Best," on one line and the sender name (${sender}) on the next.
JSON: {"subject": str, "body": str, "hook_quote": str, "pain_addressed": str}`;
}

export async function draftEmail(
  company: Company, contact: Contact, pains: Pain[], rules: Rules, sender: string, banned: string[],
): Promise<Email> {
  const usable = company.signals.filter((s) => !banned.includes(s.evidence));
  return completeJson(
    draftSystem(rules, sender),
    JSON.stringify({
      recipient_first_name: contact.first_name, recipient_role: contact.position, company: company.company_name,
      one_liner: company.one_liner, evidence: usable, pain_points: pains,
    }),
  );
}

// ---------- claim check (CODE) ----------
const ALLOWED = /soc\s*2|iso\s*27001|gdpr|15[- ]?min(ute)?s?/gi;

export function claimCheck(email: Email, contact: Contact, corpus: Corpus): { ok: boolean; reason: string } {
  const body = email.body ?? "";
  if (!inCorpus(email.hook_quote, corpus)) return { ok: false, reason: "hook_quote not found verbatim in scraped pages" };
  if (!body.split("\n")[0].toLowerCase().includes(contact.first_name.toLowerCase()))
    return { ok: false, reason: "greeting does not use the Hunter first name" };
  for (const addr of body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])
    if (addr.toLowerCase() !== contact.value.toLowerCase()) return { ok: false, reason: `unexpected email address in body: ${addr}` };
  const corp = Object.values(corpus).join(" ");
  for (const n of body.replace(ALLOWED, "").match(/\d[\d,.]*%?/g) ?? []) {
    const t = n.replace(/^[.,]+|[.,]+$/g, "");
    if (t && !corp.includes(t)) return { ok: false, reason: `number '${n}' in body not supported by scraped pages` };
  }
  if (body.split(/\s+/).length > 140) return { ok: false, reason: "email too long" };
  return { ok: true, reason: "hook quote, name, and numbers verified against sources" };
}

/** Which real signals did a failed hook use? Fabricated hooks match nothing, so real signals stay available. */
export function signalsUsedBy(hook: string, signals: Signal[]): string[] {
  const h = norm(hook ?? "");
  if (!h) return [];
  return signals.filter((s) => h.includes(norm(s.evidence)) || norm(s.evidence).includes(h)).map((s) => s.evidence);
}
