import { createHmac, timingSafeEqual } from "node:crypto";
import { env, mockLog } from "./env";

// Vaani Labs (vaanilabs.in). Per the docs (checked 2026-10):
//  - Webhook envelope: { id: "evt_...", type: "call.completed" | "call.failed" | "webhook.ping" | ..., created, data: {...} }
//  - Signature: header X-VaaniVoice-Signature: sha256=<hex HMAC-SHA256(raw body, secret)>
//  - De-dupe on envelope id (stable across retries). Any 2xx = success; 10 s timeout per attempt.
//  - The fields inside `data` are NOT documented, so normaliseVaaniPayload() reads them defensively
//    and the raw payload is stored on every row. Tighten the field paths after the first real call.
//  - There is no public API to edit an agent's prompt: it is pasted in the dashboard (see SETUP.md).

export interface NormalisedCall {
  eventId: string | null;
  eventType: string;
  callId: string;
  startedAt: Date;
  durationSec: number | null;
  transcript: string;
  transcriptUrl: string | null;
  recordingUrl: string | null;
  callerPhone: string | null;
  callerName: string | null;
  callerEmail: string | null;
  booking: { uid: string | null; start: string | null; type: "site_visit" | "studio" | null; status: string | null } | null;
  transferred: boolean;
  failed: boolean;
}

// ---------- signature ----------

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Accepts the documented HMAC header, or a plain shared secret in a header / ?secret= query
 * param (useful for "custom webhook" actions that can't sign). No secret configured = mock mode.
 */
export function verifyVaaniRequest(rawBody: string, headers: Headers, url: URL): { ok: boolean; mode: "hmac" | "shared" | "mock" | "rejected" } {
  const secret = env("VAANI_WEBHOOK_SECRET");
  if (!secret) {
    mockLog("vaani", "webhook accepted WITHOUT verification (VAANI_WEBHOOK_SECRET not set)", {});
    return { ok: true, mode: "mock" };
  }
  const sig = headers.get("x-vaanivoice-signature");
  if (sig) {
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEq(sig.trim(), expected) ? { ok: true, mode: "hmac" } : { ok: false, mode: "rejected" };
  }
  const shared =
    headers.get("x-webhook-secret") ?? headers.get("x-vaani-secret") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  return shared && safeEq(shared, secret) ? { ok: true, mode: "shared" } : { ok: false, mode: "rejected" };
}

// ---------- payload ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** First non-empty value among dotted paths. */
function pick(o: unknown, paths: string[]): unknown {
  for (const p of paths) {
    let cur: unknown = o;
    for (const k of p.split(".")) cur = isObj(cur) ? cur[k] : undefined;
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return null;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function transcriptToText(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((turn) => {
        if (typeof turn === "string") return turn;
        if (!isObj(turn)) return "";
        const role = String(turn.role ?? turn.speaker ?? turn.from ?? "").toLowerCase();
        const who = /agent|assistant|bot|ai/.test(role) ? "Agent" : /user|caller|customer|human/.test(role) ? "Caller" : role || "Speaker";
        return `${who}: ${String(turn.content ?? turn.text ?? turn.message ?? turn.transcript ?? "")}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function bookingType(v: unknown): "site_visit" | "studio" | null {
  const s = JSON.stringify(v ?? "").toLowerCase();
  if (/site|attendee.?address|in.?person.*(home|address)|visit.*home/.test(s)) return "site_visit";
  if (/studio|office|our address|organizer/.test(s)) return "studio";
  return null;
}

export function normaliseVaaniPayload(body: unknown): NormalisedCall {
  const env_ = isObj(body) ? body : {};
  const data = isObj(env_.data) ? env_.data : env_; // tolerate un-enveloped payloads
  const eventType = String(env_.type ?? env_.event ?? "call.completed");

  const callId = str(pick(data, ["call_id", "callId", "call.id", "session_id", "sessionId", "conversation_id", "id"])) ?? str(env_.id) ?? `vaani_${Date.now()}`;
  const started = pick(data, ["started_at", "startedAt", "start_time", "startTime", "call.started_at", "created_at", "createdAt"]) ?? (typeof env_.created === "number" ? new Date(env_.created * 1000).toISOString() : null);
  const startedAt = started ? new Date(typeof started === "number" && started < 1e12 ? started * 1000 : (started as string)) : new Date();
  const dur = pick(data, ["duration_sec", "duration_seconds", "durationSec", "duration", "call.duration", "billed_seconds"]);
  const durationMs = pick(data, ["duration_ms", "durationMs"]);

  const transcriptRaw = pick(data, ["transcript", "transcript_text", "call.transcript", "messages", "conversation", "turns"]);
  const bookingRaw = pick(data, ["booking", "appointment", "actions.book_appointment", "book_appointment", "calcom", "calcom_booking", "extracted.booking"]);
  const b = isObj(bookingRaw) ? bookingRaw : null;

  return {
    eventId: str(env_.id),
    eventType,
    callId,
    startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
    durationSec: dur !== null ? Math.round(Number(dur)) : durationMs !== null ? Math.round(Number(durationMs) / 1000) : null,
    transcript: transcriptToText(transcriptRaw),
    transcriptUrl: str(pick(data, ["transcript_url", "transcriptUrl"])),
    recordingUrl: str(pick(data, ["recording_url", "recordingUrl", "recording.url", "recording", "audio_url", "audioUrl"])),
    callerPhone: str(pick(data, ["caller_phone", "callerPhone", "from", "from_number", "phone", "customer.phone", "user.phone", "extracted.phone"])),
    callerName: str(pick(data, ["caller_name", "customer.name", "user.name", "extracted.name"])),
    callerEmail: str(pick(data, ["caller_email", "customer.email", "user.email", "extracted.email", "booking.email", "booking.attendee.email"])),
    booking: b
      ? {
          uid: str(pick(b, ["uid", "booking_uid", "bookingUid", "id"])),
          start: str(pick(b, ["start", "startTime", "start_time", "slot", "datetime"])),
          type: bookingType(pick(b, ["location", "type", "booking_type"])),
          status: str(pick(b, ["status"])) ?? "accepted",
        }
      : null,
    transferred: Boolean(pick(data, ["transferred", "call.transferred", "transfer.done"])),
    failed: eventType === "call.failed",
  };
}

/** Vaani has no public prompt API (checked 2026-10), so the prompt is pasted by hand. */
export async function pushAgentPrompt(_prompt: string): Promise<{ pushed: false; reason: string }> {
  mockLog("vaani", "pushAgentPrompt", { note: "No public API for agent prompts. Paste prompts/vaani_agent.md in the dashboard." });
  return { pushed: false, reason: "Vaani has no public API for editing agent prompts; paste it in the dashboard (SETUP.md step V3)." };
}
