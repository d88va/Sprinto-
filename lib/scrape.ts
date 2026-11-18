import * as cheerio from "cheerio";
import type { Corpus } from "./types";

const UA = "Mozilla/5.0 (compatible; SprintoResearchBot/0.1)";
const SEED_PATHS = ["", "/about", "/pricing", "/security", "/trust", "/customers", "/careers", "/enterprise"];
const MAX_CHARS_PER_PAGE = 6000;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function cleanDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  const tld = d.split(".").pop() ?? "";
  // Needs a letters-only TLD: rejects IPs, localhost and other internal-looking hosts.
  if (!DOMAIN_RE.test(d) || !/^[a-z]{2,}$/.test(tld)) throw new Error(`not a valid domain: ${d}`);
  return d;
}

export type Fetched = { text: string; links: [string, string][] };

export async function fetchPage(url: string): Promise<Fetched | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    const html = await r.text();
    const $ = cheerio.load(html);
    const host = new URL(r.url).host.replace(/^www\./, "");
    const links: [string, string][] = [];
    $("a[href]").each((_, a) => {
      try {
        const u = new URL($(a).attr("href")!, r.url);
        u.hash = "";
        if (u.host.replace(/^www\./, "") === host) links.push([u.toString(), $(a).text().replace(/\s+/g, " ").trim().slice(0, 80)]);
      } catch {}
    });
    $("script, style, noscript, svg").remove();
    const text = $.root().text().replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_PAGE);
    return { text, links };
  } catch {
    return null;
  }
}

export async function scrapeSite(domain: string): Promise<{ corpus: Corpus; links: Record<string, string> }> {
  const urls = SEED_PATHS.map((p) => `https://${domain}${p}`);
  const results = await Promise.all(urls.map(fetchPage));
  const corpus: Corpus = {};
  const links: Record<string, string> = {};
  results.forEach((res, i) => {
    if (!res) return;
    corpus[urls[i]] = res.text;
    for (const [u, a] of res.links) links[u] ??= a;
  });
  return { corpus, links };
}

export async function fetchPages(urls: string[]): Promise<Corpus> {
  const results = await Promise.all(urls.map(fetchPage));
  const out: Corpus = {};
  results.forEach((res, i) => {
    if (res) out[urls[i]] = res.text;
  });
  return out;
}
