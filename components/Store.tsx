"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IN_PROGRESS, type Prospect } from "@/lib/ui";

export type Health = {
  db: boolean; ai: boolean; ai_provider: string | null; hunter: boolean; gmail: boolean; send_to: string | null; dry_run: boolean; protected: boolean;
};

type Ctx = {
  list: Prospect[];
  loaded: boolean;
  health: Health | null;
  refresh: () => Promise<void>;
  start: (domains: string[]) => Promise<{ ok: boolean; error?: string }>;
};

const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
};

const MAX_PARALLEL = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One place that keeps companies moving. Each /advance call runs ONE short stage on the server (so Vercel never
 * times out); this loop keeps calling it until the company needs a human or finishes. Works from any page.
 */
export function Store({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Prospect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const working = useRef(new Set<number>());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/prospects", { cache: "no-store" });
      if (r.ok) setList(await r.json());
    } catch {}
    setLoaded(true);
  }, []);

  const drive = useCallback(async (id: number) => {
    working.current.add(id);
    let failures = 0;
    try {
      for (let i = 0; i < 40; i++) {
        let status = "";
        try {
          const r = await fetch(`/api/prospects/${id}/advance`, { method: "POST" });
          status = (await r.json()).status;
          failures = 0;
        } catch {
          if (++failures > 3) break;
          await sleep(3000);
          continue;
        }
        await refresh();
        if (!IN_PROGRESS.includes(status) && status !== "busy") break;
        if (status === "busy") await sleep(3000);
      }
    } finally {
      working.current.delete(id);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const load = () => fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).then(setHealth).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // Pick up anything in flight (new runs, or work left over after closing the tab).
  useEffect(() => {
    const todo = list.filter((p) => IN_PROGRESS.includes(p.status) && !working.current.has(p.id)).reverse();
    for (const p of todo) {
      if (working.current.size >= MAX_PARALLEL) break;
      drive(p.id);
    }
  }, [list, drive]);

  const start = useCallback(async (domains: string[]) => {
    try {
      const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domains }) });
      const j = await r.json();
      if (!r.ok) return { ok: false, error: j.error ?? "Could not start the run" };
      await refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
  }, [refresh]);

  return <StoreCtx.Provider value={{ list, loaded, health, refresh, start }}>{children}</StoreCtx.Provider>;
}
