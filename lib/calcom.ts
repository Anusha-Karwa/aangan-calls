import { createHmac, timingSafeEqual } from "node:crypto";
import { env, mockLog } from "./env";

// Cal.com API v2: read-only use. Vaani's Book Appointment action creates the booking;
// we only look it up to attach it to the call. Every v2 call needs a cal-api-version header.
const BASE = "https://api.cal.com/v2";
const BOOKINGS_VERSION = () => env("CALCOM_API_VERSION", "2026-05-01");

export interface FoundBooking {
  uid: string;
  start: string;
  status: string;
  type: "site_visit" | "studio" | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
}

interface CalBooking {
  uid: string;
  start: string;
  status: string;
  location?: string | null;
  createdAt?: string;
  attendees?: { name?: string; email?: string; phoneNumber?: string | null }[];
  bookingFieldsResponses?: Record<string, unknown>;
}

export function bookingTypeFromLocation(location: unknown, responses?: Record<string, unknown>): "site_visit" | "studio" | null {
  // The event offers two locations: the studio's own address, or the attendee's address
  // (a site visit). So: our studio address => studio; any other address => site visit.
  const s = (JSON.stringify(location ?? "") + JSON.stringify(responses?.location ?? "")).toLowerCase();
  if (/aangan studio|organizer|studio visit/.test(s)) return "studio";
  if (/site visit|attendeeinperson|attendee_?address/.test(s)) return "site_visit";
  const loc = typeof location === "string" ? location.trim() : "";
  if (loc && !/^https?:|integrations:|cal video|google meet|zoom|phone/i.test(loc)) return "site_visit";
  return null;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

function toFound(b: CalBooking): FoundBooking {
  const a = b.attendees?.[0];
  return {
    uid: b.uid,
    start: b.start,
    status: b.status,
    type: bookingTypeFromLocation(b.location, b.bookingFieldsResponses),
    attendeeEmail: a?.email ?? null,
    attendeePhone: a?.phoneNumber ?? (b.bookingFieldsResponses?.attendeePhoneNumber as string) ?? null,
  };
}

/**
 * Find the booking Vaani made during this call: same attendee (email or phone),
 * created within ±10 min of the call window.
 */
export async function findBookingForCall(opts: { email: string | null; phone: string | null; callStart: Date; durationSec: number | null }): Promise<FoundBooking | null> {
  if (!env("CALCOM_API_KEY")) {
    mockLog("calcom", "findBookingForCall (no CALCOM_API_KEY, returning none)", { email: opts.email, phone: opts.phone });
    return null;
  }
  const windowMs = 10 * 60_000;
  const from = new Date(opts.callStart.getTime() - windowMs);
  const to = new Date(opts.callStart.getTime() + (opts.durationSec ?? 1800) * 1000 + windowMs);
  const params = new URLSearchParams({ afterCreatedAt: from.toISOString(), beforeCreatedAt: to.toISOString(), limit: "50", sortCreated: "desc" });
  if (env("CALCOM_EVENT_TYPE_ID")) params.set("eventTypeId", env("CALCOM_EVENT_TYPE_ID"));
  if (opts.email) params.set("attendeeEmail", opts.email);

  const res = await fetch(`${BASE}/bookings?${params}`, {
    headers: { Authorization: `Bearer ${env("CALCOM_API_KEY")}`, "cal-api-version": BOOKINGS_VERSION() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Cal.com bookings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: CalBooking[] };
  const list = (json.data ?? []).filter((b) => b.status !== "cancelled");
  if (!list.length) return null;

  const phone = digits(opts.phone);
  const match =
    list.find((b) => opts.email && b.attendees?.some((a) => a.email?.toLowerCase() === opts.email!.toLowerCase())) ??
    list.find((b) => phone && (b.attendees?.some((a) => digits(a.phoneNumber) === phone) || JSON.stringify(b.bookingFieldsResponses ?? {}).replace(/\D/g, "").includes(phone))) ??
    (opts.email || phone ? null : list[0]);
  return match ? toFound(match) : null;
}

/** Cal.com webhook signature: x-cal-signature-256 = hex HMAC-SHA256(raw body, secret). */
export function verifyCalcomSignature(rawBody: string, signature: string | null): boolean {
  const secret = env("CALCOM_WEBHOOK_SECRET");
  if (!secret) {
    mockLog("calcom", "webhook accepted WITHOUT verification (CALCOM_WEBHOOK_SECRET not set)", {});
    return true;
  }
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
