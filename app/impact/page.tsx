"use client";
import { useEffect, useState } from "react";
import { STATUS } from "@/lib/ui";

type Stats = {
  total: number; researched: number; fit: number; drafted: number; approved: number; unedited: number; rejected: number;
  emails_this_week: number; minutes_saved: number; manual_minutes_each: number; hunter_used: number; hunter_cap: number;
  by_status: Record<string, number>;
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default function Impact() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/stats", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  if (!s) return <p className="muted" style={{ marginTop: 48 }}>Loading…</p>;
  const hours = s.minutes_saved / 60;
  const order = Object.keys(s.by_status).sort((a, b) => s.by_status[b] - s.by_status[a]);
  const max = Math.max(1, ...Object.values(s.by_status));

  return (
    <>
      <p className="kicker">Is it worth it?</p>
      <h1>Impact</h1>
      <p className="lede">Doing this by hand takes 15 to 20 minutes per company, and quality drops late in the list. These numbers show what the system has taken off your plate.</p>

      {s.total === 0 ? (
        <div className="empty" style={{ marginTop: 32 }}><b>No data yet</b>Run a few companies from the Outreach page and the numbers appear here.</div>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><div className="n">{hours < 10 ? hours.toFixed(1) : Math.round(hours)} h</div><div className="l">Research time saved</div><div className="h">Estimate: {s.researched} companies × {s.manual_minutes_each} min by hand</div></div>
            <div className="stat"><div className="n">{s.researched}</div><div className="l">Companies researched</div><div className="h">{s.total} added in total</div></div>
            <div className="stat"><div className="n">{pct(s.fit, s.researched)}</div><div className="l">Were a fit</div><div className="h">{s.fit} of {s.researched} met your bar</div></div>
            <div className="stat"><div className="n">{s.emails_this_week}</div><div className="l">Emails approved this week</div><div className="h">{s.approved} in total</div></div>
            <div className="stat"><div className="n">{pct(s.unedited, s.approved)}</div><div className="l">Approved without edits</div><div className="h">A rising number means the drafts are good</div></div>
            <div className="stat"><div className="n">{s.hunter_used}<span className="muted" style={{ fontSize: 20 }}> / {s.hunter_cap}</span></div><div className="l">Contact lookups used this month</div><div className="h">Hunter.io free plan limit</div></div>
          </div>

          <section className="section">
            <h2>Where companies ended up</h2>
            <div className="bars" style={{ marginTop: 14 }}>
              {order.map((k) => (
                <div className="b" key={k}>
                  <span>{STATUS[k]?.label ?? k}</span>
                  <div className="track"><i style={{ width: `${(s.by_status[k] / max) * 100}%` }} /></div>
                  <b>{s.by_status[k]}</b>
                </div>
              ))}
            </div>
          </section>
          <p className="tiny muted" style={{ marginTop: 28 }}>
            Time saved is an estimate using the midpoint of the 15 to 20 minutes a manual pass takes. It counts every company the system researched, including the ones that turned out not to fit.
          </p>
        </>
      )}
    </>
  );
}
