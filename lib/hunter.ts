import { q } from "./db";
import { rules as defaultRules, type Rules } from "./rules";
import type { Contact } from "./types";

const MONTHLY_CAP = 25; // Hunter free tier

type HunterEmail = {
  value?: string; first_name?: string; last_name?: string; position?: string; confidence?: number;
};

export function scoreContact(c: HunterEmail, rules: Rules, headcount: number | null): number {
  const pos = (c.position ?? "").toLowerCase();
  let best = 0;
  for (const r of rules.persona_priority) if (new RegExp(r.pattern).test(pos)) best = Math.max(best, r.score);
  const small = headcount !== null && headcount < rules.small_company_headcount;
  if (small && /ceo|chief executive|founder/.test(pos)) best = Math.max(best, rules.small_company_founder_score);
  return best;
}

/** Pure: choose the best decision-maker from Hunter results. */
export function pickContact(
  emails: HunterEmail[], rules: Rules, headcount: number | null,
): { contact: Contact | null; reason: string } {
  const ok = emails.filter(
    (e) => e.first_name && e.last_name && e.value && (e.confidence ?? 0) >= rules.min_hunter_confidence,
  );
  const scored = ok
    .map((e) => ({ s: scoreContact(e, rules, headcount), conf: e.confidence ?? 0, e }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.conf - a.conf);
  if (!scored.length)
    return { contact: null, reason: `no named contact with a target role and confidence >= ${rules.min_hunter_confidence} (${emails.length} returned)` };
  const { s, conf, e } = scored[0];
  return {
    contact: { first_name: e.first_name!, last_name: e.last_name!, position: e.position ?? "", value: e.value!, confidence: conf },
    reason: `picked '${e.position}' (role score ${s}, Hunter confidence ${conf})`,
  };
}

async function bumpUsage() {
  const month = new Date().toISOString().slice(0, 7);
  // Atomic: only increments while under the cap.
  const rows = await q(
    `insert into hunter_usage(month, count) values ($1, 1)
     on conflict (month) do update set count = hunter_usage.count + 1 where hunter_usage.count < $2
     returning count`,
    [month, MONTHLY_CAP],
  );
  if (!rows.length) throw new Error(`Hunter free tier cap (${MONTHLY_CAP}/month) reached`);
}

export async function findPoc(domain: string, headcount: number | null, rules: Rules = defaultRules) {
  // Option B: manual Apollo lookup stored in poc_overrides
  const o = await q(`select * from poc_overrides where domain=$1`, [domain]);
  if (o.length)
    return {
      contact: { first_name: o[0].first_name, last_name: o[0].last_name, position: o[0].position, value: o[0].email, confidence: 100 } as Contact,
      reason: "manual override (Option B: Apollo lookup)",
    };
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error("HUNTER_API_KEY not set and no poc_overrides entry");
  await bumpUsage();
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.search = new URLSearchParams({ domain, api_key: key, limit: "20", type: "personal" }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Hunter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const json = (await r.json()) as { data?: { emails?: HunterEmail[] } };
  return pickContact(json.data?.emails ?? [], rules, headcount);
}
