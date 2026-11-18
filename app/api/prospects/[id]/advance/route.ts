import { NextResponse } from "next/server";
import { advance } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ status: await advance(Number(id)) });
  } catch {
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}
