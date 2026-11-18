import rulesJson from "../icp_rules.json";

export type Rules = {
  fit_threshold: number;
  max_research_loops: number;
  excluded_stages: string[];
  stage_points: Record<string, number>;
  headcount_range: [number, number];
  headcount_points: number;
  signal_points: Record<string, number>;
  fully_certified_penalty: number;
  fully_certified_requires: string[];
  persona_priority: { pattern: string; score: number }[];
  small_company_headcount: number;
  small_company_founder_score: number;
  min_hunter_confidence: number;
  sprinto_facts: string[];
};

export const rules = rulesJson as unknown as Rules;
