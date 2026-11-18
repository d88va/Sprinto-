import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { cleanDomain } from "@/lib/scrape";

export const runtime = "nodejs";

const MAX_DOMAINS = 25;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw: string[] = Array.isArray(body.domains) ? body.domains : [];
  if (!raw.length) return NextResponse.json({ error: "domains[] required" }, { status: 400 });
  if (raw.length > MAX_DOMAINS) return NextResponse.json({ error: `max ${MAX_DOMAINS} domains per run` }, { status: 400 });

  const runId = new Date().toISOString();
  const ids: number[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    let domain: string;
    try {
      domain = cleanDomain(r);
    } catch (e) {
      const row = await q(
        `insert into prospects(run_id, domain, status, outcome, why) values ($1,$2,'error','ERROR',$3) returning id`,
        [runId, String(r).slice(0, 100), (e as Error).message],
      );
      ids.push(row[0].id);
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    const row = await q(`insert into prospects(run_id, domain) values ($1,$2) returning id`, [runId, domain]);
    ids.push(row[0].id);
  }
  return NextResponse.json({ runId, ids });
}
