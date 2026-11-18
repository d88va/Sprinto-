import { IN_PROGRESS, STATUS, STEPS, STEP_OF, STOPPED_AT } from "@/lib/ui";

export function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className={`badge ${s.tone}`}>
      {IN_PROGRESS.includes(status) && <span className="spin" aria-hidden />}
      {s.label}
    </span>
  );
}

/** Thin 6-segment bar for list rows. */
export function MiniProgress({ status }: { status: string }) {
  const at = STEP_OF[status] ?? 0;
  return (
    <div className="mini" role="img" aria-label={`Step ${Math.min(at + 1, 6)} of 6`}>
      {STEPS.map((_, i) => <i key={i} className={i < at ? "done" : i === at ? "now" : ""} />)}
    </div>
  );
}

/** Full labelled stepper for the detail page. */
export function Stepper({ status }: { status: string }) {
  const stoppedAt = STOPPED_AT[status];
  const at = STEP_OF[status];
  return (
    <ol className="steps" style={{ listStyle: "none", padding: 0 }} aria-label="Progress">
      {STEPS.map((label, i) => {
        let cls = "step";
        if (stoppedAt !== undefined) cls += i < stoppedAt ? " done" : i === stoppedAt ? " stop" : "";
        else if (status === "awaiting_approval") cls += i < 5 ? " done" : " gate";
        else if (at >= 6) cls += " done";
        else cls += i < at ? " done" : i === at ? " now" : "";
        return <li key={label} className={cls}>{label}</li>;
      })}
    </ol>
  );
}

const HUES = ["#5b3fc7", "#0f766e", "#b45309", "#be185d", "#1d4ed8", "#15803d", "#7c3aed", "#c2410c"];

/** Coloured letter tile standing in for a company logo (no external requests). */
export function Mono({ name }: { name: string }) {
  const clean = name.replace(/^https?:\/\//, "").replace(/^www\./, "");
  let h = 0;
  for (const c of clean) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className="mono" aria-hidden style={{ background: `linear-gradient(135deg, ${HUES[h % HUES.length]}, ${HUES[(h + 3) % HUES.length]})` }}>
      {(clean[0] ?? "?").toUpperCase()}
    </span>
  );
}
