import { NextResponse } from "next/server";
import { bookingTypeFromLocation, verifyCalcomSignature } from "@/lib/calcom";
import { db, logEvent } from "@/lib/db";
import { env } from "@/lib/env";
import { updateDealStage } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

// Optional: Cal.com -> keeps booking_status / booking_start in sync on reschedule & cancel.
// Payload: { triggerEvent, createdAt, payload: { uid, startTime, status, location, attendees[], rescheduleUid?, cancellationReason? } }
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCalcomSignature(raw, req.headers.get("x-cal-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(raw) as {
    triggerEvent?: string;
    payload?: { uid?: string; startTime?: string; status?: string; location?: string; responses?: Record<string, unknown>; rescheduleUid?: string; fromReschedule?: string; attendees?: { email?: string }[]; cancellationReason?: string };
  };
  const p = body.payload ?? {};
  const trigger = body.triggerEvent ?? "UNKNOWN";

  // A reschedule creates a new uid; the old one is in rescheduleUid / fromReschedule.
  const lookupUid = p.rescheduleUid ?? p.fromReschedule ?? p.uid;
  const row = lookupUid ? await db().getCallByBookingUid(lookupUid) : null;
  if (!row) return NextResponse.json({ ok: true, matched: false, trigger });

  if (trigger === "BOOKING_CANCELLED") {
    await db().updateCall(row.id, { booking_status: "cancelled" });
    if (row.hubspot_deal_id && env("HUBSPOT_TOKEN")) {
      await updateDealStage(row.hubspot_deal_id, env("HUBSPOT_STAGE_QUALIFIED", "qualifiedtobuy")).catch((e) => logEvent(row.id, "hubspot_error", { error: String(e) }));
    }
  } else if (trigger === "BOOKING_RESCHEDULED" || trigger === "BOOKING_CREATED") {
    await db().updateCall(row.id, {
      booking_status: trigger === "BOOKING_RESCHEDULED" ? "rescheduled" : "accepted",
      booking_start: p.startTime ?? row.booking_start,
      calcom_booking_uid: p.uid ?? row.calcom_booking_uid,
      booking_type: bookingTypeFromLocation(p.location, p.responses) ?? (row.booking_type as "site_visit" | "studio" | null),
    });
  }
  await logEvent(row.id, `calcom_${trigger.toLowerCase()}`, { uid: p.uid, start: p.startTime, reason: p.cancellationReason ?? null });
  return NextResponse.json({ ok: true, matched: true, trigger });
}
