"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Stepper } from "@/components/bits";
import { useStore } from "@/components/Store";
import { ago, IN_PROGRESS, SIGNAL_LABEL, shortUrl, STATUS, STEP_LABEL, type Prospect } from "@/lib/ui";

type Detail = Prospect & {
  pains: { pain: string; why_this_person: string; evidence_quote: string | null }[] | null;
  events: { ts: string; step: string; decision: string; reason: string }[];
  hook_source: string | null;
  signal_sources: Record<string, string | null>;
  pain_sources: (string | null)[];
  pages_read: string[];
};

const BAD = ["failed", "stop", "none", "rejected", "NOT_FIT"];
const GOOD = ["ok", "found", "done", "pass", "FIT", "fetched", "manual"];

function Source({ url, label = "Found on" }: { url: string | null; label?: string }) {
  if (!url) return <div className="unverified">Not tied to a specific page</div>;
  return (
    <div className="verified">
      <span aria-hidden>✓</span> Verified on their site · {label}{" "}
      <a className="ext" href={url} target="_blank" rel="noreferrer">{shortUrl(url)} ↗</a>
    </div>
  );
}

export default function Company() {
  const { id } = useParams<{ id: string }>();
  const { health, refresh } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [contact, setContact] = useState({ first_name: "", last_name: "", position: "", email: "" });

  const load = useCallback(async () => {
    const r = await fetch(`/api/prospects/${id}`, { cache: "no-store" });
    if (r.status === 404) return setMissing(true);
    if (r.ok) setD(await r.json());
  }, [id]);

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  useEffect(() => { fetch("/api/rules").then((r) => r.json()).then((j) => setThreshold(j.rules.fit_threshold)).catch(() => {}); }, []);
  useEffect(() => {
    if (d?.email && !touched.current) { setSubject(d.email.subject); setBody(d.email.body); }
  }, [d?.email?.subject, d?.email?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(path: string, payload?: unknown, success?: string) {
    setBusy(true); setErr(""); setDone("");
    try {
      const r = await fetch(`/api/prospects/${id}/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "Something went wrong");
      else if (success) setDone(success);
      await load(); await refresh();
    } catch {
      setErr("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (missing) return (<><Link href="/" className="back">← All companies</Link><div className="empty" style={{ marginTop: 24 }}><b>Company not found</b>It may have been removed.</div></>);
  if (!d) return (<><Link href="/" className="back">← All companies</Link><p className="muted" style={{ marginTop: 24 }}>Loading…</p></>);

  const name = d.company?.company_name || d.domain;
  const s = d.status;
  const c = d.company;
  const score = c?.score;
  const pct = score !== undefined && threshold ? Math.min(100, Math.max(0, (score / threshold) * 100)) : 0;
  const pocEvent = [...d.events].reverse().find((e) => e.step === "find_poc");
  const inProgress = IN_PROGRESS.includes(s);
  const to = health?.send_to;
  const preview = health?.dry_run;

  return (
    <>
      <Link href="/" className="back">← All companies</Link>
      <h1 style={{ marginTop: 12 }}>{name}</h1>
      <p className="lede" style={{ fontSize: 16, marginTop: 8 }}>
        <a className="ext" href={`https://${d.domain}`} target="_blank" rel="noreferrer">{d.domain} ↗</a>
        {c?.one_liner ? ` · ${c.one_liner}` : ""} &nbsp;<Badge status={s} />
      </p>
      <Stepper status={s} />

      {inProgress && (
        <div className="card" style={{ marginTop: 28 }}>
          <b>{STATUS[s]?.doing}…</b>
          <p className="muted small" style={{ margin: "6px 0 0" }}>This takes about a minute. You can leave this page; it keeps going in the background.</p>
        </div>
      )}

      {/* ---------- Decision ---------- */}
      {s === "awaiting_approval" && d.email && (
        <section className="section" aria-labelledby="review" style={{ paddingTop: 32 }}>
          <div className="card gate">
            <div className="section-head" style={{ marginBottom: 6 }}>
              <h2 id="review">Review the email</h2>
              <span className="badge gate">Your approval is required</span>
            </div>
            {d.contact && (
              <p className="small muted" style={{ margin: "0 0 14px" }}>
                Written for <b style={{ color: "var(--ink)" }}>{d.contact.first_name} {d.contact.last_name}</b>, {d.contact.position}
              </p>
            )}
            <label className="field">
              <span>Subject</span>
              <input type="text" className="subject-input" value={subject} onChange={(e) => { touched.current = true; setSubject(e.target.value); }} />
            </label>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>Message</span>
              <textarea rows={9} value={body} onChange={(e) => { touched.current = true; setBody(e.target.value); }} />
            </label>
            <div className="quote hook"><b>The hook</b> · “{d.email.hook_quote}”</div>
            <Source url={d.hook_source} />
            <div className="mail-note">
              {preview
                ? <><b>Preview mode.</b> Approving records this email as approved but does not send anything.</>
                : <><b>Test delivery.</b> This goes to {to ?? "your own inbox"}, not to {d.contact?.first_name ?? "the prospect"}.</>}{" "}
              If you edit the text, every claim is re-checked against their website first.
            </div>
            <div className="actions">
              <button className="btn btn-go" disabled={busy} onClick={() => post("approve", { subject, body }, preview ? "Approved. Nothing was sent (preview mode)." : `Sent to ${to ?? "your inbox"}.`)}>
                {busy ? "Working…" : preview ? "Approve" : "Approve and send"}
              </button>
              <button className="btn btn-quiet" disabled={busy} onClick={() => { if (confirm("Decline this draft? It will not be sent.")) post("reject", {}, "Declined."); }}>Decline</button>
            </div>
            {err && <p className="msg err" role="alert">{err}</p>}
          </div>
        </section>
      )}

      {(s === "sent" || s === "drafted") && d.email && (
        <section className="section" style={{ paddingTop: 32 }}>
          <div className="card good">
            <b>{s === "sent" ? "Sent" : "Approved (preview mode, not sent)"}</b>
            <p className="small muted" style={{ margin: "4px 0 0" }}>{d.email.edited ? "You edited this email before approving." : "Approved without edits."} {d.why}</p>
            <div className="ask-subject" style={{ marginTop: 14 }}>{d.email.subject}</div>
            <div className="email-view">{d.email.body}</div>
            <Source url={d.hook_source} label="Hook found on" />
          </div>
        </section>
      )}
      {done && <p className="msg okk" role="status">{done}</p>}

      {s === "rejected" && <div className="card" style={{ marginTop: 28 }}><b>You declined this draft.</b><p className="small muted" style={{ margin: "4px 0 0" }}>Nothing was sent.</p></div>}

      {s === "not_fit" && (
        <div className="card" style={{ marginTop: 28 }}>
          <b>Not a fit for Sprinto</b>
          <p className="small muted" style={{ margin: "4px 0 0" }}>{d.why} Think this is wrong? <Link href="/icp" className="ext">Adjust who we target</Link>, then add the domain again.</p>
        </div>
      )}

      {s === "no_contact" && (
        <div className="card warn" style={{ marginTop: 28 }}>
          <b>This company fits, but we couldn&apos;t find the right person</b>
          <p className="small" style={{ margin: "4px 0 14px" }}>
            {pocEvent?.reason} You can look them up yourself (for example on Apollo) and add them here. We&apos;ll continue from there.
          </p>
          <div className="cols2">
            <label className="field"><span>First name</span><input type="text" value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} /></label>
            <label className="field"><span>Last name</span><input type="text" value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} /></label>
            <label className="field"><span>Role</span><input type="text" value={contact.position} placeholder="e.g. Head of Security" onChange={(e) => setContact({ ...contact, position: e.target.value })} /></label>
            <label className="field"><span>Work email</span><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" disabled={busy || !contact.first_name || !contact.last_name || !contact.position || !contact.email} onClick={() => post("contact", contact)}>Add contact and continue</button>
          </div>
          {err && <p className="msg err" role="alert">{err}</p>}
        </div>
      )}

      {["error", "held", "skipped"].includes(s) && (
        <div className="card warn" style={{ marginTop: 28 }}>
          <b>{STATUS[s].label}</b>
          <p className="small" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>{d.why}</p>
          {s === "held" && <p className="small muted">No email was written because none could be backed by their website. Nothing was sent.</p>}
          <div className="actions"><button className="btn btn-primary" disabled={busy} onClick={() => post("retry")}>Try again</button></div>
          {err && <p className="msg err" role="alert">{err}</p>}
        </div>
      )}

      {/* ---------- Evidence ---------- */}
      {c && c.score !== undefined && (
        <section className="section" aria-labelledby="co">
          <div className="section-head"><h2 id="co">Why this company</h2><span className="count">Decided by code, not by the AI</span></div>
          <div className="card">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <b>Fit score {c.score}{threshold ? <span className="muted" style={{ fontWeight: 400 }}> · needs {threshold}</span> : null}</b>
              <span className={`badge ${threshold && c.score >= threshold ? "ok" : "neutral"}`}>{threshold && c.score >= threshold ? "Meets the bar" : "Below the bar"}</span>
            </div>
            <div className={`meter ${threshold && c.score < threshold ? "low" : ""}`} aria-hidden><span style={{ width: `${pct}%` }} /></div>
            {(c.reasons ?? []).map((r, i) => {
              const m = r.match(/^(.*?):\s*([+-]\d+)$/);
              let label = m ? (SIGNAL_LABEL[m[1]] ?? m[1]) : r;
              const stage = label.match(/^stage (\S+)$/);
              if (stage) label = `Funding stage: ${stage[1] === "D+" ? "Series D or later" : /^[ABC]$/.test(stage[1]) ? `Series ${stage[1]}` : stage[1]}`;
              const hc = label.match(/^headcount ~(\d+) in (\d+)-(\d+)$/);
              if (hc) label = `Team of about ${hc[1]} (we target ${hc[2]} to ${hc[3]})`;
              if (label.startsWith("already holds")) label = "Already holds both SOC 2 and ISO 27001";
              const pts = m ? Number(m[2]) : null;
              return <div className="pts" key={i}><span>{label}</span>{pts !== null && <b className={pts >= 0 ? "pos" : "neg"}>{pts > 0 ? "+" : ""}{pts}</b>}</div>;
            })}
            {(c.reasons ?? []).length === 0 && <p className="muted small">No scoring signals were found on their site.</p>}
          </div>

          {(c.signals ?? []).length > 0 && (
            <div className="card">
              <h3>What we found on their site</h3>
              {c.signals!.map((sg) => (
                <div className="pain" key={sg.signal}>
                  <div className="pain-t">{SIGNAL_LABEL[sg.signal] ?? sg.signal}</div>
                  <div className="quote">“{sg.evidence}”</div>
                  <Source url={d.signal_sources?.[sg.signal] ?? null} />
                </div>
              ))}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Read {d.pages_read.length} {d.pages_read.length === 1 ? "page" : "pages"}. A fact only counts if the exact words appear on one of them.
          </p>
        </section>
      )}

      {d.contact && (
        <section className="section" aria-labelledby="who">
          <div className="section-head"><h2 id="who">Why this person</h2><span className="count">Name and email come from {pocEvent?.decision === "manual" ? "you" : "Hunter.io"}, never the AI</span></div>
          <div className="card">
            <dl className="kv">
              <dt>Name</dt><dd><b>{d.contact.first_name} {d.contact.last_name}</b></dd>
              <dt>Role</dt><dd>{d.contact.position}</dd>
              <dt>Email</dt><dd>{d.contact.value}{pocEvent?.decision === "found" && <span className="muted tiny"> · {d.contact.confidence}% confidence</span>}</dd>
              <dt>Why them</dt><dd>{pocEvent?.reason}</dd>
            </dl>
          </div>
        </section>
      )}

      {d.pains && d.pains.length > 0 && (
        <section className="section" aria-labelledby="pain">
          <div className="section-head"><h2 id="pain">Their two likely pain points</h2></div>
          <div className="card">
            {d.pains.map((p, i) => (
              <div className="pain" key={i}>
                <div className="pain-t">{i + 1}. {p.pain}</div>
                <div className="small muted">{p.why_this_person}</div>
                {p.evidence_quote ? (<><div className="quote">“{p.evidence_quote}”</div><Source url={d.pain_sources?.[i] ?? null} /></>) : <div className="unverified">Inferred from their role, not from a quote on the site</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="log">
        <details className="log">
          <summary id="log">Every decision, in order ({d.events.length})</summary>
          <ul className="tl">
            {d.events.map((e, i) => (
              <li key={i} className={BAD.includes(e.decision) ? "bad" : GOOD.includes(e.decision) ? "ok" : e.step === "approval" ? "gate" : ""}>
                <b>{STEP_LABEL[e.step] ?? e.step}</b><span className="when">{ago(e.ts)}</span>
                <div className="muted" style={{ overflowWrap: "anywhere" }}>
                  {e.step === "claim_check" ? (e.decision === "pass" ? "Passed: " : "Dropped this draft: ") : ""}{e.reason}
                </div>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
