import { NextResponse } from "next/server";
import { approve, friendlyError } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edits = await req.json().catch(() => ({}));
  try {
    await approve(Number(id), { subject: edits.subject, body: edits.body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    // Our own validation messages are already readable; translate provider/SMTP failures only.
    const ours = /^(Your edit failed|cannot approve|not found)/.test(msg);
    return NextResponse.json({ error: ours ? msg : friendlyError(e) }, { status: 400 });
  }
}
