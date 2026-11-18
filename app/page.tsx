"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Ev = { ts: string; step: string; decision: string; reason: string };
type Prospect = {
  id: number; domain: string; status: string; outcome: string | null; why: string | null;
  contact: { first_name: string; last_name: string; position: string; value: string } | null;
  email: { subject: string; body: string; hook_quote: string; edited?: boolean } | null;
  events: Ev[];
};

const IN_PROGRESS = ["queued", "qualifying", "finding_poc", "pains", "drafting"];

export default function Home() {
  const [list, setList] = useState<Prospect[]>([]);
  const [domains, setDomains] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(new Set<number>());

  const refresh = useCallback(async () => {
    const r = await fetch("/api/prospects");
    if (r.ok) setList(await r.json());
    else setError(`Could not load prospects (${r.status}). Is DATABASE_URL set?`);
  }, []);

  // Drive each in-progress prospect forward, one short stage per request (keeps each function under the time limit).
  const drive = useCallback(async (id: number) => {
    if (working.current.has(id)) return;
    working.current.add(id);
    try {
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`/api/prospects/${id}/advance`, { method: "POST" });
        const { status } = await r.json();
        await refresh();
        if (!IN_PROGRESS.includes(status)) break;
        if (status === "busy") await new Promise((res) => setTimeout(res, 3000));
      }
    } finally {
      working.current.delete(id);
    }
  }, [refresh]);

  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  // Resume anything left mid-flight (e.g. after closing the tab).
  useEffect(() => {
    const ids = list.filter((p) => IN_PROGRESS.includes(p.status)).map((p) => p.id);
    ids.slice(0, 2).forEach(drive);
  }, [list, drive]);

  async function start() {
    setBusy(true); setError("");
    const lines = domains.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domains: lines }) });
    const j = await r.json();
    if (!r.ok) setError(j.error ?? "failed");
    else setDomains("");
    await refresh();
    setBusy(false);
  }

  return (
    <main>
      <h1>Sprinto outreach</h1>
      <p className="sub">Paste domains. The system researches, qualifies, finds the contact and drafts. You approve every send.</p>
      <div className="card">
        <textarea value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={"acme.io\nexample.com"} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" disabled={busy || !domains.trim()} onClick={start}>Run pipeline</button>
          {error && <span className="err">{error}</span>}
        </div>
      </div>
      {list.map((p) => <Card key={p.id} p={p} onChange={refresh} />)}
      {!list.length && <p className="sub">No prospects yet.</p>}
    </main>
  );
}

function Card({ p, onChange }: { p: Prospect; onChange: () => void }) {
  const [open, setOpen] = useState(p.status === "awaiting_approval");
  const [subject, setSubject] = useState(p.email?.subject ?? "");
  const [body, setBody] = useState(p.email?.body ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (p.email) { setSubject(p.email.subject); setBody(p.email.body); } }, [p.email?.subject, p.email?.body]);
  useEffect(() => { if (p.status === "awaiting_approval") setOpen(true); }, [p.status]);

  async function act(kind: "approve" | "reject") {
    setBusy(true); setErr("");
    const r = await fetch(`/api/prospects/${p.id}/${kind}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "approve" ? { subject, body } : {}),
    });
    if (!r.ok) setErr((await r.json()).error ?? "failed");
    await onChange();
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="domain">{p.domain}</span>{" "}
          <span className={`badge s-${p.status}`}>{p.status.replace("_", " ")}</span>
          {p.why && <div className="why">{p.why}</div>}
        </div>
        <button onClick={() => setOpen(!open)}>{open ? "Hide" : "Why?"}</button>
      </div>

      {open && (
        <>
          <ul className="log">
            {p.events.map((e, i) => (
              <li key={i}><b>{e.step}</b> {e.decision} - {e.reason}</li>
            ))}
          </ul>
          {p.contact && (
            <p className="why">To (would-be recipient): {p.contact.first_name} {p.contact.last_name}, {p.contact.position} &lt;{p.contact.value}&gt;. Actual delivery goes to your own address.</p>
          )}
        </>
      )}

      {p.status === "awaiting_approval" && p.email && (
        <div style={{ marginTop: 12 }}>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea style={{ marginTop: 8, minHeight: 170 }} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="why">Hook (verified on their site): “{p.email.hook_quote}”. Edits are re-checked against their site before sending.</p>
          <div className="row">
            <button className="go" disabled={busy} onClick={() => act("approve")}>Approve and send</button>
            <button disabled={busy} onClick={() => act("reject")}>Reject</button>
            {err && <span className="err">{err}</span>}
          </div>
        </div>
      )}

      {(p.status === "sent" || p.status === "drafted") && p.email && <div className="email" style={{ marginTop: 12 }}>{p.email.subject + "\n\n" + p.email.body}</div>}
    </div>
  );
}
