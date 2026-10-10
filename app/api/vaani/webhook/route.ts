import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { processCall, receiveCall, type CallInput } from "@/lib/pipeline";
import { isAfterHours } from "@/lib/time";
import { normaliseVaaniPayload, verifyVaaniRequest } from "@/lib/vaani";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vaani webhook (Settings → Webhooks): https://<app>/api/vaani/webhook?secret=<VAANI_WEBHOOK_SECRET>
// - call_started / human_transfer_*: remember the caller's number and the transfer on a stub row.
// - call_postprocessing: transcript + recording are ready -> run the full pipeline (in the background,
//   so Vaani gets its 200 straight away).
// - everything else: acknowledged and ignored.
export async function POST(req: Request) {
  const raw = await req.text();
  const url = new URL(req.url);
  const auth = verifyVaaniRequest(raw, req.headers, url);
  if (!auth.ok) return NextResponse.json({ error: "invalid secret" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const call = normaliseVaaniPayload(body);

  // From the customer site (not Vaani): the details the caller typed before a website voice chat.
  if (call.event === "website_lead") {
    const b = body as { name?: string; email?: string; phone?: string };
    const existing = await db().getCallByVaaniId(call.callId);
    if (!existing?.transcript) {
      await db().upsertCall({
        vaani_call_id: call.callId,
        channel: "website",
        caller_name: String(b.name ?? "").slice(0, 60) || null,
        email: String(b.email ?? "").slice(0, 120).toLowerCase() || null,
        phone: String(b.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || null,
        started_at: existing?.started_at ?? new Date().toISOString(),
        after_hours: existing?.after_hours ?? isAfterHours(new Date()),
      });
    }
    return NextResponse.json({ ok: true, event: call.event });
  }

  if (call.event === "call_started" || call.event.startsWith("human_transfer")) {
    const existing = await db().getCallByVaaniId(call.callId);
    if (!existing?.transcript) {
      const flags = new Set(existing?.flags ?? []);
      if (call.transferred) flags.add("transferred");
      await db().upsertCall({
        vaani_call_id: call.callId,
        channel: existing?.channel ?? "phone",
        phone: existing?.phone ?? (call.event === "call_started" ? call.callerPhone : null),
        started_at: existing?.started_at ?? new Date().toISOString(),
        after_hours: existing?.after_hours ?? isAfterHours(new Date()),
        flags: [...flags],
      });
    }
    return NextResponse.json({ ok: true, event: call.event });
  }

  if (call.event !== "call_postprocessing") return NextResponse.json({ ok: true, ignored: call.event });

  const stub = await db().getCallByVaaniId(call.callId);
  // Prefer the call_started time, but only if it is consistent with timestamp - duration
  // (a stub from a retried or replayed event must not move the call to another day).
  const stubStart = stub?.started_at ? new Date(stub.started_at) : null;
  const startedAt = stubStart && Math.abs(stubStart.getTime() - call.startedAt.getTime()) < 30 * 60_000 ? stubStart : call.startedAt;
  const input: CallInput = {
    sourceId: call.callId,
    channel: stub?.channel === "website" ? "website" : "phone",
    startedAt,
    durationSec: call.durationSec,
    transcript: call.transcript,
    recordingUrl: call.recordingUrl,
    // Website calls: the caller typed these before the call; they beat anything heard on the line.
    name: stub?.caller_name ?? null,
    email: stub?.email ?? null,
    phone: stub?.phone ?? call.callerPhone ?? null,
    transferred: call.transferred || Boolean(stub?.flags.includes("transferred")),
    failed: !call.transcript.trim(),
    raw: body,
  };

  const { row, duplicate } = await receiveCall(input);
  if (duplicate) return NextResponse.json({ ok: true, id: row.id, duplicate: true });

  const work = processCall(row.id, input);
  if (url.searchParams.get("sync") === "1") {
    const done = await work;
    return NextResponse.json({ ok: true, id: row.id, status: done?.status ?? null, score: done?.score ?? null });
  }
  waitUntil(work);
  return NextResponse.json({ ok: true, id: row.id });
}
