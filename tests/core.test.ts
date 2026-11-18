import { describe, expect, it } from "vitest";
import { pickContact } from "../lib/hunter";
import { claimCheck, groundExtraction, qualifyVerdict, signalsUsedBy } from "../lib/pipeline";
import { rules } from "../lib/rules";
import { cleanDomain } from "../lib/scrape";
import type { Company } from "../lib/types";

const CORPUS = {
  "https://acme.io/security":
    "Acme is a B2B SaaS platform. We are preparing for our SOC 2 Type II audit this quarter. Backed by a $20M Series B led by Foo Capital. Our team of 120 people.",
};
const HOOK = "preparing for our SOC 2 Type II audit";

const company = (o: Partial<Company> = {}): Company => ({
  company_name: "Acme", one_liner: "", is_saas: true, stage: "B", headcount_estimate: 120,
  signals: [{ signal: "preparing_audit", evidence: HOOK, source_url: "u" }], ...o,
});

describe("qualifyVerdict", () => {
  it("FIT with expected score", () => {
    const r = qualifyVerdict(company(), rules);
    expect(r.verdict).toBe("FIT");
    expect(r.score).toBe(2 + 1 + 3);
  });
  it("not SaaS / public excluded", () => {
    expect(qualifyVerdict(company({ is_saas: false }), rules).verdict).toBe("NOT_FIT");
    expect(qualifyVerdict(company({ stage: "public" }), rules).verdict).toBe("NOT_FIT");
  });
  it("unknown SaaS is INSUFFICIENT", () => {
    expect(qualifyVerdict(company({ is_saas: null }), rules).verdict).toBe("INSUFFICIENT");
  });
  it("no signals + low score is INSUFFICIENT with missing list", () => {
    const r = qualifyVerdict(company({ signals: [], stage: "unknown", headcount_estimate: null }), rules);
    expect(r.verdict).toBe("INSUFFICIENT");
    expect(r.missing).toContain("compliance_signals");
  });
  it("fully certified is penalised", () => {
    const sigs = ["has_soc2", "has_iso27001", "enterprise_customers"].map((signal) => ({ signal, evidence: "x", source_url: "" }));
    const r = qualifyVerdict(company({ signals: sigs }), rules);
    expect(r.score).toBe(2 + 1 + 2 - 3);
    expect(r.verdict).toBe("NOT_FIT");
  });
});

describe("groundExtraction", () => {
  it("drops facts not on the pages", () => {
    const d = groundExtraction(
      {
        is_saas: true, stage: "C", stage_evidence: "Series C led by Bar Ventures",
        headcount_estimate: 500, headcount_evidence: "500 employees",
        signals: [
          { signal: "preparing_audit", evidence: HOOK, source_url: "u" },
          { signal: "enterprise_customers", evidence: "trusted by Fortune 500 banks", source_url: "u" },
        ],
      },
      CORPUS,
    );
    expect(d.stage).toBe("unknown");
    expect(d.headcount_estimate).toBeNull();
    expect(d.signals.map((s) => s.signal)).toEqual(["preparing_audit"]);
  });
});

describe("claimCheck", () => {
  const contact = { first_name: "Priya", last_name: "Rao", position: "CTO", value: "priya@acme.io", confidence: 95 };
  const email = (o = {}) => ({
    subject: "s", hook_quote: HOOK,
    body: "Hi Priya,\nSaw Acme is preparing for SOC 2. Open to a 15-minute chat?\nSam", ...o,
  });
  it("passes a supported email", () => expect(claimCheck(email(), contact, CORPUS).ok).toBe(true));
  it("rejects a fake hook", () => expect(claimCheck(email({ hook_quote: "just closed a $50M Series C round" }), contact, CORPUS).ok).toBe(false));
  it("rejects wrong name", () => expect(claimCheck(email({ body: "Hi Rahul,\nhello" }), contact, CORPUS).ok).toBe(false));
  it("rejects invented numbers", () => expect(claimCheck(email({ body: "Hi Priya,\nCompanies cut audit time by 60%." }), contact, CORPUS).ok).toBe(false));
  it("allows numbers found on the site", () => expect(claimCheck(email({ body: "Hi Priya,\nCongrats on the team of 120 people." }), contact, CORPUS).ok).toBe(true));
  it("rejects stray email addresses", () => expect(claimCheck(email({ body: "Hi Priya,\nwrite to bob@other.com" }), contact, CORPUS).ok).toBe(false));
});

describe("signalsUsedBy", () => {
  it("fabricated hooks ban nothing; real hooks ban their signal", () => {
    const sigs = company().signals;
    expect(signalsUsedBy("closed a huge enterprise deal", sigs)).toEqual([]);
    expect(signalsUsedBy(HOOK, sigs)).toEqual([HOOK]);
  });
});

describe("pickContact", () => {
  const mk = (position: string, confidence = 90, first = "A") => ({ value: `${position.slice(0, 3)}@x.io`, first_name: first, last_name: "B", position, confidence });
  it("prefers security head over CEO", () => {
    expect(pickContact([mk("CEO"), mk("Head of Security"), mk("CTO")], rules, 200).contact?.position).toBe("Head of Security");
  });
  it("small company prefers founder over COO", () => {
    expect(pickContact([mk("COO"), mk("Co-Founder & CEO")], rules, 20).contact?.position).toBe("Co-Founder & CEO");
  });
  it("drops low confidence and nameless", () => {
    expect(pickContact([mk("CTO", 40), mk("CISO", 90, "")], rules, 100).contact).toBeNull();
  });
});

describe("cleanDomain", () => {
  it("normalises", () => expect(cleanDomain("https://www.Acme.io/about")).toBe("acme.io"));
  it("rejects IPs and localhost", () => {
    expect(() => cleanDomain("127.0.0.1")).toThrow();
    expect(() => cleanDomain("localhost")).toThrow();
    expect(() => cleanDomain("10.0.0.5")).toThrow();
  });
});
