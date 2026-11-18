import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getRules } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANUAL_MINUTES = 17.5; // midpoint of the 15-20 minutes per company in the brief

export async function GET() {
  const rules = await getRules();
  const rows = await q(
    `select status, (company is not null) as researched, (company->>'score')::float as score,
            (email->>'edited') as edited, updated_at
       from prospects`,
  );
  const month = new Date().toISOString().slice(0, 7);
  const usage = await q(`select count from hunter_usage where month=$1`, [month]);
  const weekAgo = Date.now() - 7 * 864e5;

  const count = (f: (r: any) => boolean) => rows.filter(f).length;
  const researched = count((r) => r.researched);
  const fit = count((r) => r.researched && !["not_fit"].includes(r.status));
  const approved = count((r) => ["sent", "drafted"].includes(r.status));
  const unedited = count((r) => ["sent", "drafted"].includes(r.status) && r.edited !== "true");
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  return NextResponse.json({
    total: rows.length,
    researched,
    fit,
    drafted: count((r) => ["awaiting_approval", "sent", "drafted", "rejected"].includes(r.status) && r.researched),
    approved,
    unedited,
    rejected: byStatus["rejected"] ?? 0,
    emails_this_week: count((r) => ["sent", "drafted"].includes(r.status) && new Date(r.updated_at).getTime() > weekAgo),
    minutes_saved: Math.round(researched * MANUAL_MINUTES),
    manual_minutes_each: MANUAL_MINUTES,
    hunter_used: usage[0]?.count ?? 0,
    hunter_cap: 25,
    fit_threshold: rules.fit_threshold,
    by_status: byStatus,
  });
}
