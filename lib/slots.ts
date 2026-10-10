import "server-only";
import { AGENT_PROMPT } from "./agent-prompt";
import { getFreeSlots } from "./calcom";
import { env } from "./env";
import { VAANI_API } from "./vaani";

// Keeps the voice agent's AVAILABLE SLOTS section in sync with the real Cal.com calendar,
// so it only ever offers times that exist. The booking itself is created after the call
// by the pipeline (lib/pipeline.ts → bookSlot).

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o }).format(new Date(iso));

/** "Mon 12 Oct: 9:00 am, 10:00 am, …" for the next few working days. */
export function slotsSection(slots: string[], now = new Date()): string {
  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    const day = fmt(s, { weekday: "short", day: "numeric", month: "short" });
    const list = byDay.get(day) ?? [];
    if (list.length < 8) list.push(fmt(s, { hour: "numeric", minute: "2-digit", hour12: true }));
    byDay.set(day, list);
  }
  const days = [...byDay.entries()].slice(0, 5);
  const today = fmt(now.toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (!days.length) {
    return `\n\nAVAILABLE SLOTS\nToday is ${today}. There are no free consultation slots in the next few days. Do not offer any time; say our designer will call them today to fix a time.`;
  }
  return `\n\nAVAILABLE SLOTS (IST, 60-minute consultations; the ONLY times you may offer)\nToday is ${today}.\n${days.map(([d, t]) => `- ${d}: ${t.join(", ")}`).join("\n")}`;
}

let last: { text: string; at: number } | null = null;

/** Fetch free slots and, if they changed (or every 10 min), write them into the agent's prompt. */
export async function refreshAgentSlots(force = false): Promise<{ text: string; pushed: boolean }> {
  const text = slotsSection(await getFreeSlots(7));
  const stale = !last || Date.now() - last.at > 10 * 60_000;
  if (!force && last && last.text === text && !stale) return { text, pushed: false };
  if (env("VAANI_API_KEY") && env("VAANI_AGENT_ID")) {
    const res = await fetch(`${VAANI_API}/api/agent/${env("VAANI_AGENT_ID")}/persona`, {
      method: "PATCH",
      headers: { "X-API-Key": env("VAANI_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ identity: { system_prompt: AGENT_PROMPT + text } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Vaani persona ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  last = { text, at: Date.now() };
  return { text, pushed: true };
}
