/** Plain-language labels so the Growth Lead never sees jargon. Shared by every page. */

export type Tone = "gate" | "ok" | "info" | "warn" | "bad" | "neutral";

export type Prospect = {
  id: number;
  run_id: string;
  domain: string;
  status: string;
  outcome: string | null;
  why: string | null;
  company: { company_name?: string; one_liner?: string; score?: number; headcount_estimate?: number | null; stage?: string; is_saas?: boolean | null; signals?: { signal: string; evidence: string; source_url: string }[]; reasons?: string[] } | null;
  contact: { first_name: string; last_name: string; position: string; value: string; confidence: number } | null;
  email: { subject: string; body: string; hook_quote: string; edited?: boolean } | null;
  created_at: string;
  updated_at: string;
};

export const IN_PROGRESS = ["queued", "qualifying", "finding_poc", "pains", "drafting"];
export const FINISHED = ["sent", "drafted", "rejected", "not_fit", "no_contact", "held", "skipped", "error"];

export const STATUS: Record<string, { label: string; tone: Tone; doing?: string }> = {
  queued: { label: "Starting", tone: "info", doing: "Reading their website" },
  qualifying: { label: "Researching", tone: "info", doing: "Deciding whether they fit Sprinto" },
  finding_poc: { label: "Researching", tone: "info", doing: "Finding the right person to email" },
  pains: { label: "Researching", tone: "info", doing: "Working out their likely pain points" },
  drafting: { label: "Writing", tone: "info", doing: "Writing the email and checking every claim" },
  awaiting_approval: { label: "Needs your approval", tone: "gate" },
  sent: { label: "Sent", tone: "ok" },
  drafted: { label: "Approved (preview)", tone: "ok" },
  rejected: { label: "Declined", tone: "neutral" },
  not_fit: { label: "Not a fit", tone: "neutral" },
  no_contact: { label: "Needs a contact", tone: "warn" },
  held: { label: "Held back", tone: "warn" },
  skipped: { label: "Couldn't read site", tone: "warn" },
  error: { label: "Something went wrong", tone: "bad" },
};

/** The six visible steps. Index = how far a company has got. */
export const STEPS = ["Read site", "Qualify", "Find person", "Pain points", "Write & check", "Your approval"];

export const STEP_OF: Record<string, number> = {
  queued: 0, qualifying: 1, finding_poc: 2, pains: 3, drafting: 4, awaiting_approval: 5, sent: 6, drafted: 6, rejected: 6,
};

/** Where a stopped company stopped (for the red marker on the stepper). */
export const STOPPED_AT: Record<string, number> = { not_fit: 1, no_contact: 2, held: 4, skipped: 0, error: -1 };

export const SIGNAL_LABEL: Record<string, string> = {
  preparing_audit: "Says they're preparing for a SOC 2, ISO or GDPR audit",
  enterprise_customers: "Sells to, or names, enterprise customers",
  hiring_security_compliance: "Hiring for security or compliance roles",
  requests_security_docs: "Asks buyers to request security documents",
  trust_or_security_page: "Has a security or trust page",
  has_gdpr_page: "Already shows a GDPR page",
  has_soc2: "Already holds SOC 2",
  has_iso27001: "Already holds ISO 27001",
};

export const STEP_LABEL: Record<string, string> = {
  scrape: "Read their website", qualify: "Decided on fit", research_loop: "Looked for more evidence", find_poc: "Found the person",
  pain_points: "Worked out pain points", claim_check: "Checked the email's claims", approval: "Your decision", send: "Delivery",
  error: "Problem", retry: "Restarted",
};

export const displayName = (p: Prospect) => p.company?.company_name || p.domain;

export function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function shortUrl(u: string | null): string {
  if (!u) return "";
  try {
    const x = new URL(u);
    return x.host.replace(/^www\./, "") + (x.pathname === "/" ? "" : x.pathname);
  } catch {
    return u;
  }
}
