import Link from "next/link";

export const metadata = { title: "How it works · Sprinto Outreach" };

const FLOW: { t: string; d: string; tag: "code" | "llm" | "cut" | "human"; who: string }[] = [
  { t: "Read their website", d: "Fetches the home page and the pages that matter: about, pricing, security, trust, customers, careers.", tag: "code", who: "Code" },
  { t: "Pull out the facts", d: "The AI lists what the site says (is it SaaS, what stage, how big, any compliance signals), each with a word-for-word quote. Code throws away any fact whose quote isn't really on the page.", tag: "cut", who: "AI + the Cut" },
  { t: "Decide if they fit", d: "Code adds up the points from Who we target. If key facts are missing, the AI may pick up to three more pages to read, then code scores again.", tag: "code", who: "Code decides" },
  { t: "Find the right person", d: "Hunter.io finds named contacts. Code picks the best job title. The name, role and email always come from Hunter, never from the AI.", tag: "code", who: "Hunter.io + code" },
  { t: "Work out two pain points", d: "The AI suggests the two things this person most likely worries about, tied to a quote from the site where it can.", tag: "llm", who: "AI" },
  { t: "Write the email and check it", d: "The AI drafts to them by name with one specific hook. Code then checks the hook quote, the name and every number against the site. If something is unsupported, that draft is dropped and rewritten.", tag: "cut", who: "AI + the Cut" },
  { t: "You approve, then it sends", d: "Nothing goes out until you approve. If you edit, the same checks run again. It is delivered through Gmail to your own address.", tag: "human", who: "You decide" },
];
const TAG = { code: "tag code", llm: "tag llm", cut: "tag cut", human: "tag human" };

const CHECKS: [string, string, string, string][] = [
  ["Problem real", "15–20 minutes per company, 8–15 companies a week. Quality drops late in the list.", "Pass", ""],
  ["Workflow repeated", "Outbound runs every week on a new list.", "Pass", ""],
  ["Input available", "Domains in, public website pages. Hunter caps contact lookups at 25 a month.", "Pass", ""],
  ["Output valuable", "An email to a named person with one specific hook.", "Pass", ""],
  ["Impact measurable", "Minutes per company, emails per week, share of drafts sent unedited. See Impact.", "Pass", ""],
  ["Failure risk OK", "A false fact about a prospect kills the email. The claim check drops unsupported hooks. Name, role and email come from Hunter only.", "The Cut", "cut"],
  ["Judgment protected", "Code sets the verdict. You approve before any send.", "Gate", "gate"],
  ["ROI worth it", "2–5 hours a week of manual work (8–15 companies × 15–20 min). Free tiers.", "Pass", ""],
  ["Owner clear", "The Growth Lead owns the run, the targeting rules and the approval.", "Pass", ""],
];

export default function About() {
  return (
    <>
      <p className="kicker">For the Growth Lead</p>
      <h1>How it works</h1>
      <p className="lede">
        Sprinto sells compliance automation (SOC 2, ISO 27001, GDPR) to SaaS companies. Finding the right companies, the right person and a
        message worth reading takes 15 to 20 minutes by hand. This does the research and the first draft. <b>You keep the judgement.</b>
      </p>

      <section className="section">
        <h2>Two rules the whole design rests on</h2>
        <div className="cols2" style={{ marginTop: 14 }}>
          <div className="card">
            <span className="tag cut">The Cut</span>
            <h3 style={{ marginTop: 12, color: "var(--ink)", fontSize: 16 }}>Facts never come from the AI alone</h3>
            <p className="small muted" style={{ margin: 0 }}>A wrong fact about a prospect ruins the email. So every fact must be a word-for-word quote from their own site, checked by code. Contact details come only from Hunter.io. If a claim can&apos;t be backed, it&apos;s dropped.</p>
          </div>
          <div className="card">
            <span className="tag human">The human gate</span>
            <h3 style={{ marginTop: 12, color: "var(--ink)", fontSize: 16 }}>You decide, the system proposes</h3>
            <p className="small muted" style={{ margin: 0 }}>Code, not the AI, sets whether a company fits. You approve every email before it goes. Every decision is saved with its reason, so you can defend why this company, why this person, why this email.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>The seven steps</h2>
        <ol className="flow">
          {FLOW.map((f) => (
            <li key={f.t}>
              <div><b>{f.t}</b><span>{f.d}</span></div>
              <span className={TAG[f.tag]}>{f.who}</span>
            </li>
          ))}
        </ol>
        <p className="tiny muted" style={{ marginTop: 14 }}>
          Colours match the component map: green = code or API, blue = AI call, orange = the Cut, purple = human gate.
        </p>
      </section>

      <section className="section">
        <h2>Component map</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mapimg" src="/docs/component-map.jpg" alt="Component map: Growth Lead, website, LLM, config, pipeline code, Hunter.io, Gmail and run log across trigger, input, context, processing and output" />
      </section>

      <section className="section">
        <h2>The nine checks</h2>
        <p className="muted small" style={{ margin: "6px 0 0" }}>Verdict: <b style={{ color: "var(--ok)" }}>build it</b>, with the Cut on prospect facts and the human gate on sending.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="checks">
            <thead><tr><th>#</th><th>Check</th><th>Answer</th><th>Verdict</th></tr></thead>
            <tbody>
              {CHECKS.map(([c, a, v, cls], i) => (
                <tr key={c} className={cls}>
                  <td>{String(i + 1).padStart(2, "0")}</td><td>{c}</td><td>{a}</td>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: v === "The Cut" ? "var(--accent)" : v === "Gate" ? "var(--gate)" : "var(--ok)" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ marginTop: 40 }}><Link href="/" className="btn btn-primary">Start researching companies</Link></p>
    </>
  );
}
