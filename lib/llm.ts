import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.SPRINTO_MODEL ?? "claude-opus-5-5";
let client: Anthropic | null = null;

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

export async function completeJson(system: string, user: string, maxTokens = 8000): Promise<any> {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: `${system}\n\nReply with a single JSON object and nothing else.`,
    messages: [{ role: "user", content: user }],
  });
  if ((resp.stop_reason as string) === "refusal") throw new Error("model refused the request");
  const text = resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseJson(text);
}
