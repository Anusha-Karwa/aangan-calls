import { timingSafeEqual } from "node:crypto";
import { env, mockLog } from "./env";

// Vaani (app.vaanivoice.ai). Docs: https://docs.vaanivoice.ai (checked 2026-10-09)
//  - API: https://api.vaanivoice.ai/api/*, header X-API-Key: vaani_...
//  - Webhooks (Settings → Webhooks) POST JSON with an `event` field:
//      call_started { room_name, phone_number }            human_transfer_* { room_name, phone_number }
//      call_ended { room_name, call_duration (SECONDS) }
//      call_postprocessing { call_id, timestamp, data: { call_id, call_duration (MILLISECONDS),
//                            summary, entities, dispositions, recording_url, transcript "[hh:mm:ss] AGENT: ..." } }
//  - Vaani does not sign webhooks, so the URL carries our own secret: /api/vaani/webhook?secret=...
//  - recording_url needs the API key, so the dashboard plays it through /api/recording/[id].

export const VAANI_API = "https://api.vaanivoice.ai";

export interface NormalisedCall {
  event: string;
  callId: string;
  startedAt: Date;
  durationSec: number | null;
  transcript: string;
  recordingUrl: string | null;
  callerPhone: string | null;
  vaaniSummary: string | null;
  entities: Record<string, unknown> | null;
  transferred: boolean;
}

// ---------- auth ----------

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Shared secret in ?secret= (Vaani can't sign) or an x-webhook-secret header. Unset = mock mode. */
export function verifyVaaniRequest(_rawBody: string, headers: Headers, url: URL): { ok: boolean; mode: "shared" | "mock" | "rejected" } {
  const secret = env("VAANI_WEBHOOK_SECRET");
  if (!secret) {
    mockLog("vaani", "webhook accepted WITHOUT verification (VAANI_WEBHOOK_SECRET not set)", {});
    return { ok: true, mode: "mock" };
  }
  const given = url.searchParams.get("secret") ?? headers.get("x-webhook-secret") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return given && safeEq(given, secret) ? { ok: true, mode: "shared" } : { ok: false, mode: "rejected" };
}

// ---------- payload ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/** "[13:33:14] AGENT: Hi\n\n[13:33:19] USER: Hello" -> "Agent: Hi\nCaller: Hello" */
export function normaliseTranscript(t: unknown): string {
  if (Array.isArray(t)) {
    return t
      .map((turn) => (isObj(turn) ? `${/agent|assistant|bot/i.test(String(turn.role ?? turn.speaker)) ? "Agent" : "Caller"}: ${String(turn.content ?? turn.text ?? "")}` : String(turn)))
      .join("\n");
  }
  if (typeof t !== "string") return "";
  return t
    .split(/\n+/)
    .map((l) => l.trim().replace(/^\[\d{1,2}:\d{2}(:\d{2})?\]\s*/, ""))
    .filter(Boolean)
    .map((l) => l.replace(/^(AGENT|ASSISTANT|BOT)\s*:/i, "Agent:").replace(/^(USER|CALLER|CUSTOMER|HUMAN)\s*:/i, "Caller:"))
    .join("\n");
}

/** Call id for any event: postprocessing uses call_id, lifecycle events use room_name. */
export function vaaniCallId(body: Obj): string | null {
  const data = isObj(body.data) ? body.data : {};
  return str(body.call_id) ?? str(data.call_id) ?? str(body.room_name) ?? str(data.room_name);
}

export function normaliseVaaniPayload(body: unknown): NormalisedCall {
  const b = isObj(body) ? body : {};
  const data = isObj(b.data) ? b.data : b;
  const event = String(b.event ?? b.type ?? "call_postprocessing");

  // Docs say call_postprocessing reports milliseconds, but real WebRTC payloads send seconds
  // (e.g. 13.66). Treat values over 10,000 as milliseconds (no call lasts 2.7+ hours).
  const rawDur = Number(data.call_duration ?? b.call_duration);
  const durationSec = Number.isFinite(rawDur) ? Math.round(rawDur > 10_000 ? rawDur / 1000 : rawDur) : null;

  const ts = str(b.timestamp) ?? str(data.timestamp);
  const end = ts ? new Date(ts) : new Date();
  const startedAt = new Date((Number.isNaN(end.getTime()) ? Date.now() : end.getTime()) - (durationSec ?? 0) * 1000);

  return {
    event,
    callId: vaaniCallId(b) ?? `vaani_${Date.now()}`,
    startedAt,
    durationSec,
    transcript: normaliseTranscript(data.transcript ?? data.transcription),
    recordingUrl: str(data.recording_url),
    callerPhone: str(data.phone_number ?? b.phone_number ?? data.from_number ?? data.caller_number),
    vaaniSummary: str(data.summary),
    entities: isObj(data.entities) ? data.entities : isObj(data.entity) ? data.entity : null,
    transferred: /human_transfer_successful/.test(event),
  };
}

// ---------- API ----------

/** Only send the API key to Vaani's own hosts. */
export function isVaaniHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return /(^|\.)vaanivoice\.ai$|(^|\.)vaaniresearch\.com$/.test(h);
  } catch {
    return false;
  }
}

export async function fetchRecording(recordingUrl: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (env("VAANI_API_KEY") && isVaaniHost(recordingUrl)) headers["X-API-Key"] = env("VAANI_API_KEY");
  return fetch(recordingUrl, { headers, cache: "no-store" });
}
