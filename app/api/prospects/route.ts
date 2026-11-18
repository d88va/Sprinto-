import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await list();
  } catch {
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}

async function list() {
  const rows = await q(
    `select id, run_id, domain, status, outcome, why, company, contact, email, created_at, updated_at
       from prospects order by id desc limit 200`,
  );
  return NextResponse.json(rows);
}
