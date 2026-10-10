import { NextResponse } from "next/server";
import { env, VAANI_API } from "@/lib/env";

export const dynamic = "force-dynamic";

// Starts an in-browser voice session with the Aangan agent (Vaani WebRTC dispatch).
// The browser gets a short-lived LiveKit token, never the Vaani API key.
// When the call ends, Vaani's webhook (set once in the Vaani account) sends the conversation to the
// studio's designer dashboard, exactly like a phone call. This site stores nothing.

const GREETING = "Hi, this is Aangan Studio's assistant. This call is recorded so our designer has your details. May I know your name?";

// Basic abuse protection (per server instance): a few sessions per visitor per hour, and a daily cap.
const PER_IP_PER_HOUR = 5;
const DAILY_CAP = 200;
const hits = new Map<string, number[]>();
let day = { key: "", count: 0 };

function allowed(ip: string): boolean {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  if (day.count >= DAILY_CAP) return false;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_IP_PER_HOUR) return false;
  recent.push(now);
  hits.set(ip, recent);
  day.count++;
  return true;
}

export async function POST(req: Request) {
  const key = env("VAANI_API_KEY");
  const agentId = env("VAANI_AGENT_ID");
  if (!key || !agentId) return NextResponse.json({ error: "Voice assistant is not set up yet." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allowed(ip)) return NextResponse.json({ error: "Too many calls from this device. Please try again in a little while." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { language?: string };
  const primary = body.language === "hi" ? "hi" : "en";

  const res = await fetch(`${VAANI_API}/api/trigger-call/`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      medium: "webrtc",
      primary_language: primary,
      secondary_language: primary === "en" ? "hi" : "en",
      voice_gender: "female",
      welcome_message: GREETING,
      welcome_interruptible: false, // a stray "okay" or speaker echo must not chop the greeting
      voice_speed: 1.0,
      metadata: { channel: "website" },
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Vaani webrtc dispatch failed", res.status, text.slice(0, 300));
    return NextResponse.json({ error: "The assistant is busy right now. Please try again in a minute." }, { status: 502 });
  }
  const j = JSON.parse(text) as { token?: string; connection_url?: string; room_name?: string; live_captions_url?: string };
  if (!j.token || !j.connection_url) return NextResponse.json({ error: "Could not start the call." }, { status: 502 });
  return NextResponse.json({ token: j.token, url: j.connection_url, room: j.room_name ?? null, captions: j.live_captions_url ?? null });
}
