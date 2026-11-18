"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, MiniProgress, Mono } from "@/components/bits";
import { useStore } from "@/components/Store";
import { ago, displayName, FINISHED, IN_PROGRESS, STATUS, type Prospect } from "@/lib/ui";

const MAX = 25;

function parse(text: string): string[] {
  const seen = new Set<string>();
  for (const t of text.split(/[\s,;]+/)) {
    const d = t.trim().replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "").toLowerCase();
    if (d) seen.add(d);
  }
  return [...seen];
}

export default function Home() {
  const { list, loaded, health, start } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "sent" | "nofit" | "attention">("all");

  const domains = useMemo(() => parse(text), [text]);
  const waiting = list.filter((p) => p.status === "awaiting_approval");
  const working = list.filter((p) => IN_PROGRESS.includes(p.status));
  const finished = list.filter((p) => FINISHED.includes(p.status));
  const shown = finished.filter((p) =>
    filter === "all" ? true
    : filter === "sent" ? ["sent", "drafted"].includes(p.status)
    : filter === "nofit" ? ["not_fit", "rejected"].includes(p.status)
    : ["no_contact", "held", "skipped", "error"].includes(p.status));

  async function run() {
    setBusy(true); setError("");
    const r = await start(domains);
    if (r.ok) setText(""); else setError(r.error ?? "Something went wrong");
    setBusy(false);
  }

  const todo: string[] = [];
  if (health) {
    if (!health.db) todo.push("Connect the database: add DATABASE_URL (your Neon connection string)");
    if (!health.ai) todo.push("Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) so the AI can read sites and write drafts");
    if (!health.dry_run && !health.gmail) todo.push("Add GMAIL_ADDRESS and GMAIL_APP_PASSWORD to send, or set DRY_RUN=1 to preview only");
    if (!health.send_to) todo.push("Add SEND_TO, the inbox that receives the emails (yours)");
  }

  return (
    <>
      <section className="hero">
        <span className="eyebrow"><i />Growth Lead workspace</span>
        <h1>Cold outreach, <em>researched</em> and drafted for you.</h1>
        <p className="lede">
          Add company domains. We read each site, decide if they fit Sprinto, find the right person, and write one specific email.
          You approve every send.
        </p>
        <div className="flowline">
          <span><b>1</b>You paste domains</span>
          <span><b>2</b>We research and draft, about a minute each</span>
          <span><b>3</b>You review and approve</span>
        </div>
      </section>

      <div className="card composer">
        <label className="field" htmlFor="domains" style={{ marginBottom: 0 }}>
          <span id="add">Company domains</span>
          <textarea
            id="domains" value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={"acme.io\nexample.com\nhttps://www.another-saas.com"}
          />
          <small>One per line or separated by commas. Pasting full web addresses is fine.</small>
        </label>
        {domains.length > 0 && <div className="domain-pills">{domains.slice(0, 12).map((d) => <span key={d}>{d}</span>)}{domains.length > 12 && <span>+{domains.length - 12} more</span>}</div>}
        {text === "" && (
          <div className="try">Not sure where to start?
            <button type="button" onClick={() => setText("vanta.com\ndrata.com\nsecureframe.com")}>Try three examples</button>
          </div>
        )}
        <div className="actions">
          <button className="btn btn-primary" onClick={run} disabled={busy || domains.length === 0 || domains.length > MAX}>
            {busy ? "Starting…" : domains.length ? `Research ${domains.length} ${domains.length === 1 ? "company" : "companies"} →` : "Research companies"}
          </button>
          {domains.length > MAX && <span className="msg err" style={{ margin: 0 }}>Please add {MAX} or fewer at a time.</span>}
          {error && <span className="msg err" style={{ margin: 0 }}>{error}</span>}
        </div>
      </div>

      {loaded && list.length > 0 && (
        <div className="tiles">
          <div className={`tile ${waiting.length ? "hot" : ""}`}><div className="n">{waiting.length}</div><div className="l">Waiting for your approval</div></div>
          <div className="tile"><div className="n">{working.length}</div><div className="l">Being researched now</div></div>
          <div className="tile"><div className="n">{list.filter((p) => ["sent", "drafted"].includes(p.status)).length}</div><div className="l">Emails approved</div></div>
          <div className="tile"><div className="n">{list.length}</div><div className="l">Companies in total</div></div>
        </div>
      )}

      {todo.length > 0 && (
        <div className="banner" role="status">
          <b>A few things to finish setting up</b>
          Add these in your Vercel project under Settings → Environment Variables, then redeploy:
          <ul>{todo.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {health && todo.length === 0 && !health.hunter && (
        <p className="tiny muted" style={{ marginTop: 16 }}>
          Contacts are added by hand for now. Add a Hunter.io key to find them automatically.
        </p>
      )}

      {waiting.length > 0 && (
        <section className="section" aria-labelledby="needs">
          <div className="section-head">
            <h2 id="needs">Needs your approval</h2>
            <span className="count">{waiting.length} {waiting.length === 1 ? "email" : "emails"} ready</span>
          </div>
          {waiting.map((p) => <AskCard key={p.id} p={p} />)}
        </section>
      )}

      {working.length > 0 && (
        <section className="section" aria-labelledby="working">
          <div className="section-head">
            <h2 id="working">In progress</h2>
            <span className="count">{working.length} running · you can leave this page, it keeps going</span>
          </div>
          <div className="rows">
            {working.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="row">
                <div className="row-main">
                  <Mono name={p.domain} />
                  <div>
                    <div className="row-title">{displayName(p)} <Badge status={p.status} /></div>
                    <div className="row-sub">{STATUS[p.status]?.doing}</div>
                    <MiniProgress status={p.status} />
                  </div>
                </div>
                <span className="chev" aria-hidden>›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="done">
        <div className="section-head">
          <h2 id="done">Finished</h2>
          {finished.length > 0 && (
            <div className="chips" role="group" aria-label="Filter finished companies">
              {([["all", "All"], ["sent", "Approved"], ["nofit", "Not a fit"], ["attention", "Needs attention"]] as const).map(([k, l]) => (
                <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          )}
        </div>
        {!loaded ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <div className="empty"><b>Nothing here yet</b>Paste a few company domains above to get started.</div>
        ) : shown.length === 0 ? (
          <p className="muted">Nothing in this view.</p>
        ) : (
          <div className="rows">
            {shown.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="row">
                <div className="row-main">
                  <Mono name={p.domain} />
                  <div>
                    <div className="row-title">{displayName(p)} <Badge status={p.status} /></div>
                    <div className="row-sub">{p.why ?? ""}</div>
                  </div>
                </div>
                <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>{ago(p.updated_at)}</span>
                <span className="chev" aria-hidden>›</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function AskCard({ p }: { p: Prospect }) {
  return (
    <Link href={`/p/${p.id}`} className="ask">
      <Mono name={p.domain} />
      <div className="ask-body">
      <div className="ask-top">
        <div>
          <div className="ask-co">{displayName(p)}</div>
          {p.contact && <div className="ask-sub">To {p.contact.first_name} {p.contact.last_name}, {p.contact.position}</div>}
        </div>
        <span className="ask-go">Review and decide →</span>
      </div>
      {p.email && (
        <>
          <div className="ask-subject">{p.email.subject}</div>
          <div className="ask-hook">Opens with: “{p.email.hook_quote}”</div>
        </>
      )}
      </div>
    </Link>
  );
}
