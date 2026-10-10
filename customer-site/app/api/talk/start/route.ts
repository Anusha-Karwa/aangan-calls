import { NextResponse } from "next/server";
import { AGENT_PROMPT } from "@/lib/agent-prompt";
import { env, VAANI_API } from "@/lib/env";

export const dynamic = "force-dynamic";

// Starts an in-browser voice session with the Aangan agent (Vaani WebRTC dispatch).
// The customer has typed their name, email and phone first; we
//  1) start the session with a personal greeting and those CALLER DETAILS added to the agent's instructions,
//  2) tell the studio dashboard which call they belong to (so the transcript, email and HubSpot use
//     the typed details), via the same webhook Vaani posts to.
// The browser gets a short-lived LiveKit token, never the Vaani API key. This site stores nothing.

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

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export async function POST(req: Request) {
  const key = env("VAANI_API_KEY");
  const agentId = env("VAANI_AGENT_ID");
  if (!key || !agentId) return NextResponse.json({ error: "Voice assistant is not set up yet." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { language?: string; name?: string; email?: string; phone?: string };
  const name = clean(body.name, 60);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 20).replace(/[^\d+]/g, "");
  if (name.length < 2) return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return NextResponse.json({ error: "Please check your email address." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Please enter a 10-digit phone number." }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!allowed(ip)) return NextResponse.json({ error: "Too many calls from this device. Please try again in a little while." }, { status: 429 });

  const primary = body.language === "hi" ? "hi" : "en";
  const first = name.split(" ")[0];
  const greeting = `Hi ${first}, this is Aangan Studio's assistant. This call is recorded so our designer has your details. Is this about a new project, or one we're already working on?`;
  const callerDetails = `\n\nCALLER DETAILS (typed by the caller on the website before this call)\n- Name: ${name}\n- Email: ${email}\n- Phone: ${phone}\nYou have already greeted them by name and asked whether this is a new or existing project. Continue from their answer.`;

  const res = await fetch(`${VAANI_API}/api/trigger-call/`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      medium: "webrtc",
      primary_language: primary,
      secondary_language: primary === "en" ? "hi" : "en",
      voice_gender: "female",
      welcome_message: greeting,
      welcome_interruptible: false, // a stray "okay" or speaker echo must not chop the greeting
      voice_speed: 1.0,
      metadata: { channel: "website", caller_name: name, caller_email: email, caller_phone: phone },
      modify_agent: { persona: { identity: { system_prompt: AGENT_PROMPT + callerDetails } } },
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

  // Attach the typed details to this call on the studio dashboard (best effort; the call works without it).
  if (j.room_name && env("STUDIO_WEBHOOK_URL")) {
    const url = new URL(env("STUDIO_WEBHOOK_URL"));
    if (env("VAANI_WEBHOOK_SECRET")) url.searchParams.set("secret", env("VAANI_WEBHOOK_SECRET"));
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "website_lead", room_name: j.room_name, name, email, phone }),
      signal: AbortSignal.timeout(4000),
    }).catch((e) => console.error("studio webhook (website_lead) failed", e));
  }

  return NextResponse.json({ token: j.token, url: j.connection_url, room: j.room_name ?? null, captions: j.live_captions_url ?? null, firstName: first });
}
