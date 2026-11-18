"use client";
import { useEffect, useMemo, useState } from "react";
import { SIGNAL_LABEL } from "@/lib/ui";
import type { Rules } from "@/lib/rules";

const STAGE_LABEL: Record<string, string> = {
  seed: "Seed", A: "Series A", B: "Series B", C: "Series C", "D+": "Series D or later", bootstrapped: "Bootstrapped / no funding stated",
};

function Num({ value, onChange, label, hint, width }: { value: number; onChange: (n: number) => void; label: string; hint?: string; width?: number }) {
  return (
    <>
      <label>{label}{hint && <small>{hint}</small>}</label>
      <input type="number" value={Number.isFinite(value) ? value : 0} style={width ? { maxWidth: width } : undefined}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} aria-label={label} />
    </>
  );
}

export default function Icp() {
  const [saved, setSaved] = useState<Rules | null>(null);
  const [r, setR] = useState<Rules | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/rules").then((x) => x.json()).then((j) => { setSaved(j.rules); setR(j.rules); }); }, []);
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(r), [saved, r]);

  if (!r) return <p className="muted" style={{ marginTop: 48 }}>Loading…</p>;
  const set = (patch: Partial<Rules>) => { setR({ ...r, ...patch }); setMsg(null); };

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
    const j = await res.json();
    if (res.ok) { setSaved(j.rules); setR(j.rules); setMsg({ ok: true, text: "Saved. New companies will be scored with these rules." }); }
    else setMsg({ ok: false, text: j.error ?? "Could not save" });
    setBusy(false);
  }
  async function reset() {
    if (!confirm("Go back to the default rules? Your changes will be lost.")) return;
    const res = await fetch("/api/rules", { method: "DELETE" });
    const j = await res.json();
    setSaved(j.rules); setR(j.rules); setMsg({ ok: true, text: "Back to the defaults." });
  }

  return (
    <>
      <p className="kicker">Owned by the Growth Lead</p>
      <h1>Who we target</h1>
      <p className="lede">
        This is Sprinto&apos;s ideal customer profile as points. After the AI reads a company&apos;s site, <b>code</b> adds up these points and
        decides if it fits. The AI never decides. Change a number and the next company is scored differently.
      </p>

      <section className="section">
        <h2>How strict to be</h2>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="formgrid">
            <Num label="Points needed to count as a fit" hint="Higher means fewer, better-matched companies." value={r.fit_threshold} onChange={(n) => set({ fit_threshold: n })} />
            <Num label="Extra pages the AI may read when unsure" hint="0 to 5. It only reads more if key facts are missing." value={r.max_research_loops} onChange={(n) => set({ max_research_loops: Math.round(n) })} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Company size and stage</h2>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="formgrid">
            <Num label="Smallest team that fits" value={r.headcount_range[0]} onChange={(n) => set({ headcount_range: [n, r.headcount_range[1]] })} />
            <Num label="Largest team that fits" value={r.headcount_range[1]} onChange={(n) => set({ headcount_range: [r.headcount_range[0], n] })} />
            <Num label="Points when team size is in range" value={r.headcount_points} onChange={(n) => set({ headcount_points: n })} />
          </div>
          <h3 style={{ marginTop: 22 }}>Points by funding stage</h3>
          <div className="formgrid">
            {Object.keys(STAGE_LABEL).map((k) => (
              <Num key={k} label={STAGE_LABEL[k]} value={r.stage_points[k] ?? 0} onChange={(n) => set({ stage_points: { ...r.stage_points, [k]: n } })} />
            ))}
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, fontSize: 15 }}>
            <input type="checkbox" checked={r.excluded_stages.includes("public")}
              onChange={(e) => set({ excluded_stages: e.target.checked ? [...new Set([...r.excluded_stages, "public"])] : r.excluded_stages.filter((x) => x !== "public") })} />
            Always skip public companies
          </label>
        </div>
      </section>

      <section className="section">
        <h2>Signs they need compliance help</h2>
        <p className="muted small" style={{ margin: "6px 0 0" }}>A sign only counts if the AI can quote it from their own website.</p>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="formgrid">
            {Object.keys(SIGNAL_LABEL).map((k) => (
              <Num key={k} label={SIGNAL_LABEL[k]} value={r.signal_points[k] ?? 0} onChange={(n) => set({ signal_points: { ...r.signal_points, [k]: n } })} />
            ))}
            <Num label="Penalty if they already hold both SOC 2 and ISO 27001" hint="Use a negative number. They've done the hard part already." value={r.fully_certified_penalty} onChange={(n) => set({ fully_certified_penalty: n })} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Who to email</h2>
        <p className="muted small" style={{ margin: "6px 0 0" }}>The highest-scoring job title found at the company gets the email. Separate alternative words with a | sign.</p>
        <div className="card" style={{ marginTop: 14 }}>
          {r.persona_priority.map((p, i) => (
            <div className="role-row" key={i}>
              <input type="text" value={p.pattern} aria-label={`Job titles, group ${i + 1}`}
                onChange={(e) => set({ persona_priority: r.persona_priority.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)) })} />
              <input type="number" value={p.score} aria-label={`Score, group ${i + 1}`}
                onChange={(e) => set({ persona_priority: r.persona_priority.map((x, j) => (j === i ? { ...x, score: Number(e.target.value) } : x)) })} />
              <button className="btn btn-quiet btn-sm" aria-label={`Remove group ${i + 1}`} onClick={() => set({ persona_priority: r.persona_priority.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => set({ persona_priority: [...r.persona_priority, { pattern: "", score: 50 }] })}>Add a job-title group</button>
          <div className="formgrid" style={{ marginTop: 22 }}>
            <Num label="Treat a company as small below this team size" value={r.small_company_headcount} onChange={(n) => set({ small_company_headcount: n })} />
            <Num label="Founder / CEO score at small companies" hint="They often own security themselves." value={r.small_company_founder_score} onChange={(n) => set({ small_company_founder_score: n })} />
            <Num label="Lowest email confidence we accept (0 to 100)" hint="From Hunter.io. Lower risks bounces." value={r.min_hunter_confidence} onChange={(n) => set({ min_hunter_confidence: n })} />
          </div>
        </div>
      </section>

      <div className="sticky">
        <button className="btn btn-primary" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button className="btn btn-quiet" onClick={reset} disabled={busy}>Reset to defaults</button>
        {dirty && !msg && <span className="muted small">You have unsaved changes</span>}
        {msg && <span className={`msg ${msg.ok ? "okk" : "err"}`} style={{ margin: 0 }} role="status">{msg.text}</span>}
      </div>
    </>
  );
}
