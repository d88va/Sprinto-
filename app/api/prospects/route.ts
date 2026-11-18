import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const prospects = await q(
    `select id, run_id, domain, status, outcome, why, company, contact, pains, email, created_at, updated_at
       from prospects order by id desc limit 100`,
  );
  const ids = prospects.map((p) => p.id);
  const events = ids.length
    ? await q(`select prospect_id, ts, step, decision, reason from events where prospect_id = any($1::int[]) order by id`, [ids])
    : [];
  const byP = new Map<number, any[]>();
  for (const e of events) byP.set(e.prospect_id, [...(byP.get(e.prospect_id) ?? []), e]);
  return NextResponse.json(prospects.map((p) => ({ ...p, events: byP.get(p.id) ?? [] })));
}
