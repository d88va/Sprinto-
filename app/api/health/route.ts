import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which integrations are configured. Booleans only; never returns a secret. */
export async function GET() {
  let db = false;
  try {
    await q("select 1");
    db = true;
  } catch {}
  const to = process.env.SEND_TO ?? "";
  const [name, domain] = to.split("@");
  return NextResponse.json({
    db,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    hunter: !!process.env.HUNTER_API_KEY,
    gmail: !!process.env.GMAIL_ADDRESS && !!process.env.GMAIL_APP_PASSWORD,
    send_to: to ? `${name.slice(0, 1)}***@${domain}` : null,
    dry_run: process.env.DRY_RUN === "1",
    protected: !!process.env.DASHBOARD_PASSWORD,
  });
}
