import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { norm } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await q(`select * from prospects where id=$1`, [Number(id)]);
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { corpus, links, locked_at, ...p } = rows[0];
  const events = await q(`select ts, step, decision, reason, data from events where prospect_id=$1 order by id`, [p.id]);

  // Where on their site was each quote found? Powers the "verified on their site" links.
  const sourceOf = (quote?: string | null): string | null => {
    const n = norm(quote ?? "");
    if (n.length < 12 || !corpus) return null;
    for (const [url, text] of Object.entries(corpus as Record<string, string>)) if (norm(text).includes(n)) return url;
    return null;
  };
  const hook_source = sourceOf(p.email?.hook_quote);
  const signal_sources: Record<string, string | null> = {};
  for (const s of p.company?.signals ?? []) signal_sources[s.signal] = sourceOf(s.evidence);
  const pain_sources = (p.pains ?? []).map((x: any) => sourceOf(x.evidence_quote));

  return NextResponse.json({
    ...p, events, hook_source, signal_sources, pain_sources, pages_read: Object.keys(corpus ?? {}),
  });
}
