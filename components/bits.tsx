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
