import { NextResponse } from "next/server";
import { advance } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await advance(Number(id));
  return NextResponse.json({ status });
}
