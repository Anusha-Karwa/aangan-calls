import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { processCall, receiveCall, type CallInput } from "@/lib/pipeline";
import { normaliseVaaniPayload, verifyVaaniRequest } from "@/lib/vaani";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vaani post-call webhook. Vaani gives each attempt 10 s, so we store the raw payload,
// reply 200 at once, and finish extraction/notifications in the background (waitUntil).
export async function POST(req: Request) {
  const raw = await req.text();
  const url = new URL(req.url);
  const auth = verifyVaaniRequest(raw, req.headers, url);
  if (!auth.ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const call = normaliseVaaniPayload(body);
  if (call.eventType === "webhook.ping") return NextResponse.json({ ok: true, pong: true });
  if (!["call.completed", "call.failed", "call.ended", "call_ended"].includes(call.eventType)) {
    return NextResponse.json({ ok: true, ignored: call.eventType });
  }

  const input: CallInput = {
    sourceId: call.callId,
    channel: "phone",
    startedAt: call.startedAt,
    durationSec: call.durationSec,
    transcript: call.transcript,
    transcriptUrl: call.transcriptUrl,
    recordingUrl: call.recordingUrl,
    phone: call.callerPhone,
    name: call.callerName,
    email: call.callerEmail,
    booking: call.booking,
    transferred: call.transferred,
    failed: call.failed,
    raw: body,
  };

  const { row, duplicate } = await receiveCall(input);
  if (duplicate) return NextResponse.json({ ok: true, id: row.id, duplicate: true });

  const work = processCall(row.id, input);
  // ?sync=1 waits for the whole pipeline (handy for local tests and scripts).
  if (url.searchParams.get("sync") === "1") {
    const done = await work;
    return NextResponse.json({ ok: true, id: row.id, status: done?.status ?? null, score: done?.score ?? null });
  }
  waitUntil(work);
  return NextResponse.json({ ok: true, id: row.id, verified: auth.mode });
}
