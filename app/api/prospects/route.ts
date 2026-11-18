import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await q(
    `select id, run_id, domain, status, outcome, why, company, contact, email, created_at, updated_at
       from prospects order by id desc limit 200`,
  );
  return NextResponse.json(rows);
}
