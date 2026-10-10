import "server-only";
import { bookSlot, findBookingForCall } from "./calcom";
import { db, logEvent } from "./db";
import { designerRecipient, renderCallerConfirmation, renderDesignerEmail, sendEmail } from "./email";
import { env } from "./env";
import { extract } from "./extract";
import { syncToHubspot } from "./hubspot";
import { evaluate } from "./rubric";
import { isAfterHours } from "./time";
import { effectiveStatus, type CallRow } from "./types";

// Channel-agnostic: phone (Vaani) today; WhatsApp / web form would build a CallInput
// from their own payload and call processCall() the same way.

export interface CallInput {
  sourceId: string; // unique per conversation (vaani call id, whatsapp thread id, form submission id)
  channel: "phone" | "website" | "whatsapp" | "web_form";
  startedAt: Date;
  durationSec: number | null;
  transcript: string;
  transcriptUrl?: string | null;
  recordingUrl?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  booking?: { uid: string | null; start: string | null; type: "site_visit" | "studio" | null; status: string | null } | null;
  transferred?: boolean;
  failed?: boolean;
  raw: unknown;
}

/** Step 1: store the raw payload immediately (before any slow work). Returns null if already processed. */
export async function receiveCall(input: CallInput): Promise<{ row: CallRow; duplicate: boolean }> {
  // A row without a transcript is only a stub from call_started; a row stuck without a status
  // for 5+ minutes is a failed run. Anything else has already been received.
  const existing = await db().getCallByVaaniId(input.sourceId);
  const stale = existing && !existing.status && Date.now() - Date.parse(existing.updated_at) > 5 * 60_000;
  if (existing && existing.transcript && !stale) return { row: existing, duplicate: true };
  const row = await db().upsertCall({
    vaani_call_id: input.sourceId,
    channel: input.channel,
    started_at: input.startedAt.toISOString(),
    duration_sec: input.durationSec,
    after_hours: isAfterHours(input.startedAt),
    transcript: input.transcript || null,
    transcript_url: input.transcriptUrl ?? null,
    recording_url: input.recordingUrl ?? null,
    raw: input.raw,
  });
  await logEvent(row.id, "received", { channel: input.channel, chars: input.transcript.length });
  return { row, duplicate: false };
}

/** Steps 2–7: extract, score, match booking, save, notify. Never throws. */
export async function processCall(callId: string, input: CallInput): Promise<CallRow | null> {
  try {
    // 2. Extraction (Gemini, or heuristic in mock mode)
    const ex = await extract(input.failed ? "" : input.transcript, input.startedAt);
    if (!ex.ok) await logEvent(callId, "extract_failed", { error: ex.error });
    const x = ex.extraction;

    // 3. Rubric (deterministic)
    const r = evaluate(x, input.startedAt);
    const status = ex.ok ? r.status : "incomplete";

    // Typed (website) or caller-ID details beat what the model heard on the line.
    const email = input.email ?? x.email ?? null;
    const phone = input.phone ?? x.phone ?? null;

    // 4. Booking: from the Vaani payload, else look it up in Cal.com
    let booking = input.booking?.start ? input.booking : null;
    if (!booking && (status === "qualified" || status === "borderline")) {
      try {
        const found = await findBookingForCall({ email, phone, callStart: input.startedAt, durationSec: input.durationSec });
        if (found) booking = { uid: found.uid, start: found.start, type: found.type, status: found.status };
        await logEvent(callId, "calcom_lookup", { found: Boolean(found), uid: found?.uid ?? null });
      } catch (e) {
        await logEvent(callId, "calcom_error", { error: String(e) });
      }
    }

    // 4b. No booking yet, but the caller agreed a slot on the call → book it in Cal.com ourselves.
    let bookingMoved = false;
    const slotOk = x.requested_slot && !Number.isNaN(Date.parse(x.requested_slot)) && Date.parse(x.requested_slot) > Date.now();
    if (!booking && slotOk && email && (status === "qualified" || status === "borderline")) {
      try {
        const made = await bookSlot({
          startIso: x.requested_slot!,
          name: input.name ?? x.caller_name ?? "Aangan caller",
          email,
          phone,
          siteVisit: x.booking_type === "site_visit",
          address: x.site_address ?? (x.location_area ? `${x.location_area}, Pune` : null),
          callId,
        });
        if (made) {
          booking = { uid: made.booking.uid, start: made.booking.start, type: x.booking_type ?? made.booking.type, status: made.booking.status ?? "accepted" };
          bookingMoved = made.moved;
          await logEvent(callId, "calcom_booked", { uid: made.booking.uid, start: made.booking.start, requested: x.requested_slot, moved: made.moved });
        } else {
          await logEvent(callId, "calcom_book_failed", { requested: x.requested_slot, reason: "no free slot near the requested time" });
        }
      } catch (e) {
        await logEvent(callId, "calcom_error", { stage: "book", requested: x.requested_slot, error: String(e) });
      }
    }

    const flags = new Set<string>(r.flags);
    if (bookingMoved) flags.add("unconfirmed_fields");
    if (ex.unconfirmed.length) flags.add("unconfirmed_fields");
    if (input.transferred) flags.add("transferred");
    if ((status === "qualified" || status === "borderline") && !booking?.start) flags.add("no_booking");

    const rate = Number(env("VAANI_RATE_INR", "7")) || 0;

    // 5. Save
    const row = await db().updateCall(callId, {
      caller_name: input.name ?? x.caller_name ?? null,
      phone,
      email,
      call_type: x.call_type,
      project_type: x.project_type,
      property: x.property,
      scope: x.scope,
      scope_category: x.scope_category,
      location_area: r.location_area,
      in_service_area: r.in_service_area,
      carpet_sqft: x.carpet_sqft,
      site_state: x.site_state,
      timeline_text: x.timeline_text,
      target_date: x.target_date,
      weeks_to_target: r.weeks_to_target,
      decision_maker: x.decision_maker,
      budget_volunteered: x.budget_volunteered,
      budget_inr: x.budget_inr,
      asked_price: x.asked_price,
      source: x.source,
      language: x.language,
      score: r.score,
      gate_fail: r.gate_fail,
      status,
      decline_reason: ex.ok ? r.decline_reason : "Extraction failed: review transcript",
      reengage_rating: r.reengage_rating,
      reengage_date: r.reengage_date,
      flags: [...flags],
      booking_start: booking?.start ?? null,
      booking_type: booking?.type ?? x.booking_type ?? null,
      calcom_booking_uid: booking?.uid ?? null,
      booking_status: booking ? booking.status ?? "accepted" : null,
      summary: x.summary || null,
      // 7. Cost
      cost_inr: input.durationSec !== null ? Math.round((input.durationSec / 60) * rate * 100) / 100 : null,
      extraction: { ...x, _unconfirmed: ex.unconfirmed, _mode: ex.mode, _breakdown: r.breakdown, _failed_criteria: r.failed_criteria },
    });
    if (!row) return null;
    await logEvent(callId, "scored", { status, score: r.score, gate_fail: r.gate_fail, mode: ex.mode, unconfirmed: ex.unconfirmed });

    // 6. Outputs
    return await runOutputs(row);
  } catch (e) {
    console.error("processCall failed", e);
    await logEvent(callId, "pipeline_error", { error: String(e) });
    return null;
  }
}

/** Designer/escalation email + HubSpot. Used by the webhook and the dashboard's re-send buttons. */
export async function runOutputs(row: CallRow, opts: { email?: boolean; hubspot?: boolean } = { email: true, hubspot: true }): Promise<CallRow> {
  const st = effectiveStatus(row);
  let current = row;
  const wantsEmail = st === "qualified" || st === "borderline" || st === "escalated";

  // Email first: a HubSpot failure must never block it.
  if (opts.email !== false && wantsEmail) current = await notifyDesigner(current);
  if (opts.email !== false && st && st !== "incomplete") await emailCaller(current);
  if (opts.hubspot !== false && (st === "qualified" || st === "borderline")) current = await pushHubspot(current);
  return current;
}

export async function notifyDesigner(row: CallRow): Promise<CallRow> {
  const to = designerRecipient(row);
  const msg = renderDesignerEmail(row);
  try {
    const sent = await sendEmail({ to, ...msg, replyTo: row.email });
    await logEvent(row.id, sent.mock ? "email_dry_run" : "email_sent", { to, subject: msg.subject, id: sent.id });
    row = (await db().updateCall(row.id, { email_id: sent.id ?? (sent.mock ? "dry-run" : null), notified_at: new Date().toISOString() })) ?? row;
  } catch (e) {
    await logEvent(row.id, "email_error", { to, error: String(e) });
  }
  return row;
}

/** The caller's own summary email (booking confirmation or a thank-you). Off with SEND_CALLER_CONFIRMATION=false. */
export async function emailCaller(row: CallRow): Promise<void> {
  if (!row.email || env("SEND_CALLER_CONFIRMATION") === "false") return;
  try {
    const c = renderCallerConfirmation(row);
    const sent = await sendEmail({ to: row.email, ...c, replyTo: env("DESIGNER_EMAIL") || null });
    await logEvent(row.id, sent.mock ? "caller_email_dry_run" : "caller_email_sent", { to: row.email, id: sent.id });
  } catch (e) {
    await logEvent(row.id, "caller_email_error", { to: row.email, error: String(e) });
  }
}

export async function pushHubspot(row: CallRow): Promise<CallRow> {
  try {
    const r = await syncToHubspot(row);
    await logEvent(row.id, r.mock ? "hubspot_dry_run" : "hubspot_synced", r);
    if (!r.mock) row = (await db().updateCall(row.id, { hubspot_contact_id: r.contactId, hubspot_deal_id: r.dealId })) ?? row;
  } catch (e) {
    await logEvent(row.id, "hubspot_error", { error: String(e) });
  }
  return row;
}
