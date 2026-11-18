export type Signal = { signal: string; evidence: string; source_url: string };

export type Company = {
  company_name: string;
  one_liner: string;
  is_saas: boolean | null;
  stage: string;
  headcount_estimate: number | null;
  signals: Signal[];
  score?: number; // set by the code verdict
  reasons?: string[];
};

export type Contact = {
  first_name: string;
  last_name: string;
  position: string;
  value: string; // email
  confidence: number;
};

export type Pain = { pain: string; why_this_person: string; evidence_quote: string | null };

export type Email = {
  subject: string;
  body: string;
  hook_quote: string;
  pain_addressed?: string;
  edited?: boolean;
};

export type Verdict = "FIT" | "NOT_FIT" | "INSUFFICIENT";

export type Corpus = Record<string, string>;

export const TERMINAL = ["sent", "drafted", "rejected", "not_fit", "no_contact", "held", "skipped", "error"];
