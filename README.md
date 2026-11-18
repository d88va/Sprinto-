# Sprinto Outreach

Research, qualify and draft personalised cold emails for Sprinto, at scale, with a human approving every send.

**Live site:** https://sprinto22.vercel.app

Built for the Growth Lead at Sprinto, which automates SOC 2, ISO 27001 and GDPR compliance for SaaS companies. Outbound
is manual today: research a company, work out who to contact, write a personal first email. That takes 15 to 20 minutes
per company, 8 to 15 companies a week, and quality drops toward the end of the list because the writer is tired, not
because the companies are worse. This does the research and the first draft for every company on the list, and the
Growth Lead keeps the judgement.

## Two rules the whole design rests on

**The Cut: facts about a prospect never come from the AI alone.**
- The AI extracts facts from the website, but each one must come with a word-for-word quote, and code checks the quote
  really appears on a page it read. If not, the fact is thrown away.
- A contact's name, role and email come only from Hunter.io (or from the Growth Lead), never from the AI.
- The email is checked in code before anyone sees it: the hook quote must be on the site, the greeting must use the
  contact's real first name, and every number in the body must exist on the site. A draft that fails is dropped and
  rewritten; if none passes, nothing is written ("Held back").

**The human gate: it proposes, the Growth Lead decides.**
- Code, not the AI, decides whether a company fits, by adding up the points in the ICP rubric.
- Nothing is sent until the Growth Lead approves. Edits are re-checked by the same claim check.
- Every decision is saved with its reason, so each result can be defended: why this company, why this person, why this
  email.

## The app

| Page | What it is for |
|---|---|
| **Outreach** (`/`) | Paste domains and run. Emails waiting for approval come first, then work in progress, then finished companies with filters. |
| **Company** (`/p/[id]`) | Review and edit the draft, approve or decline. Shows why the company fit (points and quotes with links to the exact page), why this person, the two pain points, and every decision in order. Add a contact by hand when none is found; retry when something fails. |
| **Who we target** (`/icp`) | The Growth Lead's editable ICP rubric: threshold, size, stage and signal points, who to contact. Stored in Neon. |
| **Impact** (`/impact`) | Time saved, fit rate, emails approved, share approved without edits, Hunter lookups used. |
| **How it works** (`/about`) | The seven steps, the two rules, the component map and the nine checks. |

## Architecture

Built to `docs/Sprinto_Component_Map.jpg` (rows are components; columns are Trigger, Input, Context, Processing, Output).

| Component (row) | What it does | Code |
|---|---|---|
| **Growth Lead** | Pastes domains (Trigger); edits the ICP rubric (Context); approves each email (Output) | `app/page.tsx`, `app/icp`, `app/p/[id]` |
| **Website** | Raw signal: home plus about, pricing, security, trust, customers, careers | `lib/scrape.ts` |
| **LLM (Extract)** | Pulls structured facts and quotes from the pages | `lib/pipeline.ts` (`extract`, `groundExtraction`) |
| **Config** | ICP rubric and rules, editable in the app | `icp_rules.json` (defaults), `lib/settings.ts`, `app/api/rules` |
| **Pipeline code (Verdict)** | Scores the rubric, returns FIT / NOT_FIT / INSUFFICIENT; the research loop (max 3) fetches more pages when unsure | `lib/pipeline.ts` (`qualifyVerdict`), `lib/engine.ts` |
| **Hunter.io** | Finds named contacts; code picks the best role; 25 lookups/month cap enforced in the database | `lib/hunter.ts` |
| **LLM (Write)** | Two pain points, then the draft | `lib/pipeline.ts` (`painPoints`, `draftEmail`) |
| **Pipeline code (Check)** | The claim check; drops unsupported hooks | `lib/pipeline.ts` (`claimCheck`) |
| **Gmail** | Sends to your own address after approval | `lib/send.ts` |
| **Run log** | Every decision and its reason | `events` table, shown on each company page |
| **Neon Postgres** | Companies, decisions, rules, Hunter usage | `lib/db.ts` |

### The pipeline

Each company moves through stages. Every call to `/api/prospects/[id]/advance` runs exactly **one short stage**, so no
Vercel function runs long; the browser keeps calling it until the company needs a human or finishes.

`queued` (read site) → `qualifying` (extract, code verdict, up to 3 research loops) → `finding_poc` (Hunter) → `pains`
→ `drafting` (draft and claim check, up to 3 attempts) → `awaiting_approval` → `sent` / `drafted` / `rejected`.

Other outcomes: `not_fit`, `no_contact` (add one by hand), `held`, `skipped` (site unreachable), `error` (retry).

## Setup

1. **Neon.** Create a project; copy the **pooled** connection string (the host contains `-pooler`). Tables are created
   automatically on first use.
2. **AI.** Create a Gemini key at https://aistudio.google.com (free), or an Anthropic key at https://console.anthropic.com.
3. **Hunter.io.** Free plan, 25 searches a month. Or skip it and add contacts by hand.
4. **Gmail.** Turn on 2-step verification, then create an **App Password** (Google Account → Security → App passwords).
5. **Environment variables.** Copy `.env.example` to `.env.local` for local runs; add the same in Vercel under
   Settings → Environment Variables.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `GEMINI_API_KEY` | Reads sites, writes drafts. Free tier works (about 5 requests a minute, so a run is slower). Default `gemini-3.8-flash` with Flash fallbacks; override with `GEMINI_MODEL` |
| `ANTHROPIC_API_KEY` | Alternative to Gemini (default `claude-opus-5-5`, override with `SPRINTO_MODEL`). Used first if both are set |
| `HUNTER_API_KEY` | Contact lookup |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | Sending |
| `SEND_TO` | Your own inbox. Every email is delivered here, never to the prospect, as the brief requires |
| `SENDER_NAME` | Sign-off on the emails |
| `DRY_RUN` | `1` = approving records the email but does not send. Set to `0` to send for real |
| `DASHBOARD_PASSWORD` | Optional. The app is open by default; set this to require a password |

The home page shows a notice listing any of these that are missing.

```bash
npm install
npm test          # 22 offline tests, no keys needed
npm run dev
```

## Notes and limits

- **Open by default.** Anyone with the link can run companies and spend your Anthropic credits. Emails still go only to
  `SEND_TO`. Set `DASHBOARD_PASSWORD` to lock it.
- **Time limits (Vercel Hobby).** Functions can run up to 300 seconds; each stage is much shorter. Closing the tab pauses
  work and it resumes when the app is opened again.
- The claim check verifies the hook quote, name and numbers, not every proper noun in the body.
- Sites that render entirely with JavaScript may return little text and end as "Not a fit: not enough evidence".
- Time saved on the Impact page is an estimate (17.5 minutes per researched company, the midpoint of the brief).

## The nine checks

| # | Check | How it is handled |
|---|---|---|
| 01 | Problem real | 15–20 min per company, 8–15 a week, quality drops late in the list |
| 02 | Workflow repeated | Outbound runs every week on a new list |
| 03 | Input available | Domains and public pages; Hunter's 25/month cap enforced in the database |
| 04 | Output valuable | Email to a named person with one specific hook |
| 05 | Impact measurable | Impact page: minutes saved, emails per week, share approved unedited |
| 06 | Failure risk OK | The Cut: quote grounding, claim check, contacts from Hunter only |
| 07 | Judgment protected | Code sets the verdict; the Growth Lead approves before any send |
| 08 | ROI worth it | Replaces 2–5 hours a week of manual work; free tiers |
| 09 | Owner clear | The Growth Lead owns the run, the ICP rubric and the approval |
