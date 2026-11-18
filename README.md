# Sprinto Outreach (Next.js + Neon + Vercel)

Paste domains in the dashboard. The system scrapes each site, qualifies it against the ICP, finds the contact via Hunter.io, drafts an email, verifies every claim against the site, and then waits for the Growth Lead to approve. Approved emails go to **your own address** (`SEND_TO`), never the prospect.

**Design rule: the LLM extracts and writes; code decides** (verdict, contact choice, claim check, send gate).

## Where things live

| Piece | Role |
|---|---|
| Neon (Postgres) | `prospects` (state of each domain), `events` (every decision + reason), `hunter_usage` (25/month cap), `poc_overrides` (Apollo option). Tables are created automatically on first request. |
| Vercel | Hosts the dashboard and API. Each pipeline stage is its own short request (`/api/prospects/:id/advance`), so no function hits a timeout. |
| GitHub | Source repo; Vercel deploys from it on every push. |

## Setup

1. **Neon**: create a project, copy the *pooled* connection string into `DATABASE_URL`.
2. **Env vars**: copy `.env.example` to `.env.local` and fill it in. Same names go in Vercel > Settings > Environment Variables.
   Keep `DRY_RUN=1` until you've reviewed a few drafts. Set it to `0` to send for real.
3. **Local run** (needs Node 20+):
   ```bash
   npm install
   npm test
   npm run dev
   ```
   The dashboard asks for HTTP basic auth: any username, password = `DASHBOARD_PASSWORD`.
4. **Deploy**: push to GitHub, import the repo in Vercel, add the env vars, deploy.

Optional Apollo fallback (Option B): `insert into poc_overrides values ('acme.io','Priya','Rao','CTO','priya@acme.io');`

## Pipeline (one stage per request)

`queued` scrape -> `qualifying` (extract + code verdict; up to 3 research loops that fetch more pages) -> `finding_poc` (Hunter) -> `pains` (two pain points) -> `drafting` (draft + claim check; failed hook is dropped and redrafted, max 3) -> `awaiting_approval` -> `sent` / `drafted` / `rejected`.

Terminal outcomes: `not_fit`, `no_contact`, `held` (no draft passed the claim check), `skipped`, `error`, `rejected`, `sent`, `drafted`.

## How decisions are defended

- **Why this company**: ICP rubric in `icp_rules.json` (stage, headcount, compliance signals); every point maps to a quote that exists on the site. Shown under "Why?" for each prospect.
- **Why this person**: role priority list in `icp_rules.json`; name, role and email come only from Hunter (or an override), never the LLM.
- **Why this email**: one hook quoted from their site, tied to one of two role-specific pains. The claim check drops any draft whose hook, greeting name or numbers aren't supported. Edits you make before approving go through the same check.

## Safety

- All routes sit behind `DASHBOARD_PASSWORD` basic auth, or behind Vercel Authentication if you set `PROTECTED_BY_VERCEL=1` (only after enabling it in Vercel > Settings > Deployment Protection). With neither set, the app refuses everything.
- Recipient is hardcoded via `SEND_TO`. Secrets live only in env vars; `.env*` is gitignored.
- Domains that look like IPs or `localhost` are rejected before any fetch.

## Known limits

- Claim check verifies the hook quote, name and numbers, not every proper noun.
- JS-rendered sites that serve empty HTML scrape poorly and end up not_fit for insufficient evidence.
- Function time limit: each stage should finish well within 300s; very slow model responses could still time out and the stage is retried on resume.
