import { formatDate, formatIst } from "./time";
import { effectiveStatus, type CallRow, type CallStatus } from "./types";

// The dashboard lists PEOPLE, not raw calls: a caller who phones twice (or a dropped
// call followed by a call-back, like T17) shows once, with all their calls inside.

/** The subset of a call the browser needs (no transcript, raw payload or extraction). */
export interface CallLite {
  id: string;
  at: string;
  status: CallStatus | null;
  overridden: boolean;
  caller_name: string | null;
  phone: string | null;
  email: string | null;
  score: number | null;
  location_area: string | null;
  in_service_area: boolean | null;
  property: string | null;
  carpet_sqft: number | null;
  site_state: string | null;
  scope: string | null;
  timeline_text: string | null;
  target_date: string | null;
  budget_volunteered: string | null;
  asked_price: boolean | null;
  decision_maker: string | null;
  source: string | null;
  booking_start: string | null;
  booking_type: string | null;
  booking_status: string | null;
  flags: string[];
  summary: string | null;
  decline_reason: string | null;
  reengage_rating: string | null;
  reengage_date: string | null;
  reengaged_at: string | null;
  duration_sec: number | null;
  after_hours: boolean | null;
  // Dates pre-formatted on the server (IST) so server and browser render identical text.
  label: { at: string; atShort: string; booking: string; bMonth: string; bDay: string; bTime: string; target: string; reengage: string };
}

export interface Person {
  key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  latest: CallLite;
  calls: CallLite[]; // newest first
}

export function toLite(r: CallRow): CallLite {
  return {
    id: r.id, at: r.started_at ?? r.created_at, status: effectiveStatus(r), overridden: Boolean(r.status_override),
    caller_name: r.caller_name, phone: r.phone, email: r.email, score: r.score, location_area: r.location_area,
    in_service_area: r.in_service_area, property: r.property, carpet_sqft: r.carpet_sqft, site_state: r.site_state,
    scope: r.scope, timeline_text: r.timeline_text, target_date: r.target_date, budget_volunteered: r.budget_volunteered,
    asked_price: r.asked_price, decision_maker: r.decision_maker, source: r.source, booking_start: r.booking_start,
    booking_type: r.booking_type, booking_status: r.booking_status, flags: r.flags, summary: r.summary,
    decline_reason: r.decline_reason, reengage_rating: r.reengage_rating, reengage_date: r.reengage_date,
    reengaged_at: r.reengaged_at, duration_sec: r.duration_sec, after_hours: r.after_hours,
    label: labels(r),
  };
}

const ist = (iso: string | null, o: Intl.DateTimeFormatOptions) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o }).format(new Date(iso)) : "");

function labels(r: CallRow): CallLite["label"] {
  const at = r.started_at ?? r.created_at;
  return {
    at: formatIst(at),
    atShort: ist(at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }),
    booking: formatIst(r.booking_start),
    bMonth: ist(r.booking_start, { month: "short" }),
    bDay: ist(r.booking_start, { day: "numeric" }),
    bTime: ist(r.booking_start, { hour: "numeric", minute: "2-digit", hour12: true }),
    target: formatDate(r.target_date),
    reengage: formatDate(r.reengage_date),
  };
}

export function personKey(r: Pick<CallRow, "id" | "phone" | "email">): string {
  const digits = (r.phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length === 10) return `p:${digits}`;
  if (r.email) return `e:${r.email.trim().toLowerCase()}`;
  return `c:${r.id}`;
}

/** Group calls into people, newest activity first. */
export function groupPeople(rows: CallRow[]): Person[] {
  const map = new Map<string, CallLite[]>();
  for (const r of rows) {
    const k = personKey(r);
    const list = map.get(k) ?? [];
    list.push(toLite(r));
    map.set(k, list);
  }
  const people: Person[] = [];
  for (const [key, calls] of map) {
    calls.sort((a, b) => b.at.localeCompare(a.at));
    // The person's "headline" call: the latest one that actually had a conversation.
    const latest = calls.find((c) => c.status && c.status !== "incomplete") ?? calls[0];
    people.push({
      key,
      name: calls.find((c) => c.caller_name)?.caller_name ?? null,
      phone: calls.find((c) => c.phone)?.phone ?? null,
      email: calls.find((c) => c.email)?.email ?? null,
      latest,
      calls,
    });
  }
  return people.sort((a, b) => b.calls[0].at.localeCompare(a.calls[0].at));
}
