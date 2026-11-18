import { NextResponse } from "next/server";
import { defaultRules, getRules, resetRules, saveRules, validateRules } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rules: await getRules(), defaults: defaultRules });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const merged = { ...(await getRules()), ...body };
  const err = validateRules(merged);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  await saveRules(merged);
  return NextResponse.json({ rules: merged });
}

export async function DELETE() {
  await resetRules();
  return NextResponse.json({ rules: defaultRules });
}
