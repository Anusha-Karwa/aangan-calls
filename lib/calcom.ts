import { createHmac, timingSafeEqual } from "node:crypto";
import { env, mockLog } from "./env";

// Cal.com API v2. We read free slots (offered to the voice agent), create the booking the caller
// agreed to after the call, and look bookings up. Every v2 call needs a cal-api-version header.
const BASE = "https://api.cal.com/v2";
const BOOKINGS_VERSION = () => env("CALCOM_API_VERSION", "2026-05-01");
const SLOTS_VERSION = "2024-09-04";
const CREATE_VERSION = "2024-08-13";

function calHeaders(version: string): Record<string, string> {
  return { Authorization: `Bearer ${env("CALCOM_API_KEY")}`, "cal-api-version": version, "Content-Type": "application/json" };
}

/** Free consultation start times (ISO, +05:30) over the next `days` days. */
export async function getFreeSlots(days = 7): Promise<string[]> {
  if (!env("CALCOM_API_KEY") || !env("CALCOM_EVENT_TYPE_ID")) return [];
  const start = new Date(Date.now() + 2 * 3600_000); // never offer something starting in the next 2 hours
  const end = new Date(Date.now() + days * 86_400_000);
  const q = new URLSearchParams({
    eventTypeId: env("CALCOM_EVENT_TYPE_ID"),
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: env("CALCOM_TIMEZONE", "Asia/Kolkata"),
  });
  const res = await fetch(`${BASE}/slots?${q}`, { headers: calHeaders(SLOTS_VERSION), cache: "no-store" });
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { data?: Record<string, { start: string }[]> };
  return Object.values(j.data ?? {}).flat().map((s) => s.start).filter((s) => Date.parse(s) > start.getTime()).sort();
}

export interface NewBooking {
  startIso: string;
  name: string;
  email: string;
  phone?: string | null;
  siteVisit: boolean;
  address?: string | null;
  callId: string;
}

async function postBooking(b: NewBooking, startIso: string): Promise<{ ok: true; booking: FoundBooking } | { ok: false; conflict: boolean; error: string }> {
  const body: Record<string, unknown> = {
    start: new Date(startIso).toISOString(),
    eventTypeId: Number(env("CALCOM_EVENT_TYPE_ID")),
    attendee: {
      name: b.name,
      email: b.email,
      timeZone: env("CALCOM_TIMEZONE", "Asia/Kolkata"),
      language: "en",
      ...(b.phone && /^\+?\d{10,15}$/.test(b.phone.replace(/\s/g, "")) ? { phoneNumber: b.phone.startsWith("+") ? b.phone : `+91${b.phone.replace(/\D/g, "").slice(-10)}` } : {}),
    },
    location: b.siteVisit && b.address ? { type: "attendeeAddress", address: b.address } : { type: "address" },
    metadata: { source: "aangan-voice-agent", aangan_call_id: b.callId },
  };
  const res = await fetch(`${BASE}/bookings`, { method: "POST", headers: calHeaders(CREATE_VERSION), body: JSON.stringify(body) });
  const text = await res.text();
  if (res.ok) {
    const d = (JSON.parse(text) as { data: CalBooking }).data;
    return { ok: true, booking: toFound(d) };
  }
  return { ok: false, conflict: res.status === 409 || /already has booking|not available/i.test(text), error: `Cal.com ${res.status}: ${text.slice(0, 200)}` };
}

/**
 * Book the slot the caller agreed to. If it was taken in the meantime, book the nearest free slot
 * on the same day, else the next free slot after it. Returns null when nothing could be booked.
 */
export async function bookSlot(b: NewBooking): Promise<{ booking: FoundBooking; moved: boolean } | null> {
  if (!env("CALCOM_API_KEY") || !env("CALCOM_EVENT_TYPE_ID")) {
    mockLog("calcom", "bookSlot (dry run)", b);
    return null;
  }
  const first = await postBooking(b, b.startIso);
  if (first.ok) return { booking: first.booking, moved: false };
  if (!first.conflict) throw new Error(first.error);
  const wanted = Date.parse(b.startIso);
  const free = await getFreeSlots(10);
  const sameDay = free.filter((s) => s.slice(0, 10) === b.startIso.slice(0, 10));
  const candidates = [
    ...sameDay.sort((x, y) => Math.abs(Date.parse(x) - wanted) - Math.abs(Date.parse(y) - wanted)),
    ...free.filter((s) => Date.parse(s) > wanted && !sameDay.includes(s)),
  ].slice(0, 4);
  for (const s of candidates) {
    const r = await postBooking(b, s);
    if (r.ok) return { booking: r.booking, moved: true };
    if (!r.conflict) throw new Error(r.error);
  }
  return null;
}

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
