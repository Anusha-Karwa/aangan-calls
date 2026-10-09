import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

// Current stable Flash model per ai.google.dev (checked 2026-10). Override with GEMINI_MODEL.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

let _ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") });
  return _ai;
}

export function geminiModel(): string {
  return env("GEMINI_MODEL", DEFAULT_GEMINI_MODEL);
}

/** One JSON-mode call. Returns the raw text; the caller parses + validates. */
export async function generateJson(opts: { system: string; prompt: string; schema: object; temperature?: number }): Promise<string> {
  const res = await client().models.generateContent({
    model: geminiModel(),
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseSchema: opts.schema as never,
      temperature: opts.temperature ?? 0,
    },
  });
  return res.text ?? "";
}

/** Plain text chat turn (used by the role-play simulator). */
export async function generateText(opts: { system: string; prompt: string; temperature?: number }): Promise<string> {
  const res = await client().models.generateContent({
    model: geminiModel(),
    contents: opts.prompt,
    config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.7 },
  });
  return (res.text ?? "").trim();
}
