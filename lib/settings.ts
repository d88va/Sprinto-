import { q } from "./db";
import { rules as defaults, type Rules } from "./rules";

/** ICP rules: the Growth Lead edits these on the ICP page; falls back to icp_rules.json. */
export async function getRules(): Promise<Rules> {
  const r = await q(`select value from settings where key='rules'`);
  return r.length ? ({ ...defaults, ...r[0].value } as Rules) : defaults;
}

export async function saveRules(next: Rules) {
  await q(
    `insert into settings(key, value) values ('rules', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(next)],
  );
}

export async function resetRules() {
  await q(`delete from settings where key='rules'`);
}

export const defaultRules = defaults;

/** Light validation so a bad form can't brick the pipeline. Returns an error string or null. */
export function validateRules(r: any): string | null {
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!num(r?.fit_threshold) || r.fit_threshold < 0 || r.fit_threshold > 30) return "Fit threshold must be a number from 0 to 30";
  if (!Number.isInteger(r?.max_research_loops) || r.max_research_loops < 0 || r.max_research_loops > 5) return "Research loops must be 0 to 5";
  if (!Array.isArray(r?.headcount_range) || r.headcount_range.length !== 2 || !r.headcount_range.every(num) || r.headcount_range[0] > r.headcount_range[1])
    return "Headcount range needs two numbers, low then high";
  if (!num(r?.min_hunter_confidence) || r.min_hunter_confidence < 0 || r.min_hunter_confidence > 100) return "Hunter confidence must be 0 to 100";
  for (const k of ["stage_points", "signal_points"])
    if (!r?.[k] || !Object.values(r[k]).every(num)) return `${k.replace("_", " ")} must be numbers`;
  if (!Array.isArray(r?.persona_priority) || !r.persona_priority.every((p: any) => typeof p?.pattern === "string" && num(p?.score)))
    return "Contact priority needs a pattern and a score for each role";
  for (const p of r.persona_priority) {
    try { new RegExp(p.pattern); } catch { return `Invalid role pattern: ${p.pattern}`; }
  }
  return null;
}
