import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

/**
 * One JSON-in, JSON-out call to whichever AI is configured.
 * LLM_PROVIDER=anthropic|gemini forces one; otherwise it uses Anthropic if ANTHROPIC_API_KEY is set, else Gemini.
 */
export type Provider = "anthropic" | "gemini";

export function aiProvider(): Provider | null {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function parseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON object in model output: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(`bad JSON from model: ${(e as Error).message}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Anthropic ----------
let anthropic: Anthropic | null = null;
async function viaAnthropic(system: string, user: string, maxTokens: number): Promise<string> {
  anthropic ??= new Anthropic();
  const resp = await anthropic.messages.create({
    model: process.env.SPRINTO_MODEL ?? "claude-opus-5-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  if ((resp.stop_reason as string) === "refusal") throw new Error("model refused the request");
  return resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

// ---------- Gemini ----------
let gemini: GoogleGenAI | null = null;

// Gemini's shared free capacity is uneven: a model can answer, return 503 "high demand", or hang, minute to minute.
// So every call has a timeout, any failure moves straight to the next model, and a struggling model is avoided for a while.
const CALL_TIMEOUT_MS = 30_000;
const BUDGET_MS = 170_000; // whole call, so one pipeline stage stays well inside the 300 s function limit
const coolUntil = new Map<string, number>(); // model -> time before which we try it last

function geminiModels(): string[] {
  const main = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const all = [main, ...fallbacks.filter((m) => m !== main)];
  const now = Date.now();
  return [...all.filter((m) => (coolUntil.get(m) ?? 0) <= now), ...all.filter((m) => (coolUntil.get(m) ?? 0) > now)];
}

const text = (e: unknown) => String((e as Error)?.message ?? e);

async function viaGemini(system: string, user: string): Promise<string> {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const deadline = Date.now() + BUDGET_MS;
  let quota = 0, busy = 0, other: unknown = null;
  for (const model of geminiModels()) {
    const left = deadline - Date.now();
    if (left < 8000) break;
    const ms = Math.min(CALL_TIMEOUT_MS, left);
    try {
      const res = await Promise.race([
        gemini.models.generateContent({
          model,
          contents: user,
          config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0, abortSignal: AbortSignal.timeout(ms) },
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms + 500)),
      ]);
      if (!res.text) throw new Error("EMPTY");
      return res.text;
    } catch (e) {
      const m = text(e);
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|API key expired/i.test(m)) throw e; // no point trying other models
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) { quota++; coolUntil.set(model, Date.now() + 10 * 60_000); }
      else if (/404|NOT_FOUND|no longer available/i.test(m)) { coolUntil.set(model, Date.now() + 60 * 60_000); }
      else if (/503|UNAVAILABLE|TIMEOUT|abort|overloaded|500|INTERNAL|EMPTY|fetch failed/i.test(m)) { busy++; coolUntil.set(model, Date.now() + 90_000); }
      else other = e;
    }
  }
  if (other) throw other;
  throw new Error(quota > busy ? "AI_QUOTA: every Gemini model is out of free quota" : "AI_BUSY: every Gemini model was too busy or too slow");
}

export async function completeJson(system: string, user: string, maxTokens = 8000): Promise<any> {
  const provider = aiProvider();
  if (!provider) throw new Error("NO_AI_KEY");
  const sys = `${system}\n\nReply with a single JSON object and nothing else.`;
  const text = provider === "anthropic" ? await viaAnthropic(sys, user, maxTokens) : await viaGemini(sys, user);
  return parseJson(text);
}
