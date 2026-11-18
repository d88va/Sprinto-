import { NextRequest, NextResponse } from "next/server";

// The API sends email and spends LLM/Hunter credits, so everything is behind basic auth.
// Fails closed: no DASHBOARD_PASSWORD configured = nobody gets in, unless you deliberately set
// PROTECTED_BY_VERCEL=1 to say Vercel Authentication (Deployment Protection) already guards the site.
export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) {
    if (process.env.PROTECTED_BY_VERCEL === "1") return NextResponse.next();
    return new NextResponse("Set DASHBOARD_PASSWORD, or PROTECTED_BY_VERCEL=1 with Vercel Authentication enabled", { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sprinto outreach"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
