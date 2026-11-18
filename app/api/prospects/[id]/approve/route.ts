import { NextResponse } from "next/server";
import { approve } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edits = await req.json().catch(() => ({}));
  try {
    await approve(Number(id), { subject: edits.subject, body: edits.body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
