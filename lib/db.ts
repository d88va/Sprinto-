import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

// node-postgres + Vercel Fluid compute: one pooled connection string (DATABASE_URL, the -pooler host).
let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    try {
      attachDatabasePool(pool); // lets Vercel drain idle connections before the function suspends
    } catch {
      /* not running on Vercel */
    }
  }
  return pool;
}

export async function q(text: string, params: unknown[] = []): Promise<any[]> {
  await ensureSchema();
  return (await getPool().query(text, params as any[])).rows;
}

function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const p = getPool();
    const stmts = [
      `create table if not exists prospects(
         id serial primary key, run_id text not null, domain text not null,
         status text not null default 'queued', outcome text, why text,
         state jsonb not null default '{}', corpus jsonb, links jsonb,
         company jsonb, contact jsonb, pains jsonb, email jsonb,
         locked_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now())`,
      `create table if not exists events(
         id serial primary key, prospect_id int references prospects(id) on delete cascade,
         ts timestamptz default now(), step text, decision text, reason text, data jsonb)`,
      `create table if not exists hunter_usage(month text primary key, count int not null default 0)`,
      `create table if not exists poc_overrides(
         domain text primary key, first_name text, last_name text, position text, email text)`,
    ];
    for (const t of stmts) await p.query(t);
  })().catch((e) => {
    ready = null; // allow retry after a transient failure
    throw e;
  });
  return ready;
}

const JSON_COLS = new Set(["state", "corpus", "links", "company", "contact", "pains", "email"]);
const COLS = new Set([...JSON_COLS, "status", "outcome", "why"]);

export async function patch(id: number, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => COLS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => (JSON_COLS.has(k) ? `${k}=$${i + 1}::jsonb` : `${k}=$${i + 1}`));
  const vals = keys.map((k) => (JSON_COLS.has(k) ? JSON.stringify(fields[k]) : fields[k]));
  await q(`update prospects set ${sets.join(", ")}, updated_at=now() where id=$${keys.length + 1}`, [...vals, id]);
}

export async function logEvent(id: number, step: string, decision: string, reason: string, data: unknown = null) {
  await q(`insert into events(prospect_id, step, decision, reason, data) values ($1,$2,$3,$4,$5::jsonb)`, [
    id, step, decision, reason, JSON.stringify(data),
  ]);
}
