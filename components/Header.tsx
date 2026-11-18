"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "./Store";

const LINKS = [
  { href: "/", label: "Outreach" },
  { href: "/icp", label: "Who we target" },
  { href: "/impact", label: "Impact" },
  { href: "/about", label: "How it works" },
];

export function Header() {
  const path = usePathname();
  const { health, list } = useStore();
  const waiting = list.filter((p) => p.status === "awaiting_approval").length;
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/p/") : path.startsWith(href));

  const missing = health && (!health.ai || !health.db);
  let mode: { dot: string; text: string } | null = null;
  if (health) {
    if (missing) mode = { dot: "warn", text: "Setup needed: see the notice on the Outreach page" };
    else if (health.dry_run) mode = { dot: "ok", text: "Preview mode: approving records the email but does not send it" };
    else mode = { dot: "ok", text: `Live: approved emails are delivered to ${health.send_to ?? "your inbox"}, never to the prospect` };
  }

  return (
    <header>
      <div className="masthead">
        <Link href="/" className="brand"><span className="brand-mark" aria-hidden>S</span>Sprinto Outreach</Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
              {l.label}{l.href === "/" && waiting > 0 ? ` (${waiting})` : ""}
            </Link>
          ))}
        </nav>
      </div>
      {mode && <div className="mode"><span className={`dot ${mode.dot}`} />{mode.text}</div>}
    </header>
  );
}
