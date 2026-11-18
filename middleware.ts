import { NextRequest, NextResponse } from "next/server";

// Open by default. Set DASHBOARD_PASSWORD (Vercel env var) to put the whole app behind HTTP basic auth.
export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.next();
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

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|docs/).*)"] };
