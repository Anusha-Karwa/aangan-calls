import { groupPeople, type Person } from "./people";
import { toIst } from "./time";
import type { CallRow } from "./types";

// Tiles count PEOPLE (same grouping as the list) so the numbers always match what is listed.
// Calls, minutes and cost are per call.

export interface MonthStats {
  calls: number;
  people: number;
  afterHoursPct: number;
  byStatus: Record<string, number>;
  booked: number;
  bookingRate: number; // booked people / (qualified + borderline people)
  avgMinutes: number;
  totalCost: number;
  costPerBooking: number | null;
  askedPricePct: number;
}

export function monthKey(iso: string | Date): string {
  return toIst(new Date(iso)).toISOString().slice(0, 7);
}

export function inMonth(rows: CallRow[], month: string): CallRow[] {
  return month === "all" ? rows : rows.filter((r) => monthKey(r.started_at ?? r.created_at) === month);
}

export function monthStats(rows: CallRow[], people: Person[]): MonthStats {
  const byStatus: Record<string, number> = { qualified: 0, borderline: 0, unqualified: 0, escalated: 0, incomplete: 0 };
  for (const p of people) if (p.latest.status) byStatus[p.latest.status] += 1;
  const bookable = byStatus.qualified + byStatus.borderline;
  const booked = people.filter((p) => p.calls.some((c) => c.booking_start && c.booking_status !== "cancelled")).length;
  const talked = rows.filter((r) => r.duration_sec);
  const totalCost = rows.reduce((s, r) => s + (r.cost_inr ?? 0), 0);
  const conversations = people.filter((p) => p.latest.status !== "incomplete");
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  return {
    calls: rows.length,
    people: people.length,
    afterHoursPct: pct(rows.filter((r) => r.after_hours).length, rows.length),
    byStatus,
    booked,
    bookingRate: pct(booked, bookable),
    avgMinutes: talked.length ? Math.round((talked.reduce((s, r) => s + (r.duration_sec ?? 0), 0) / talked.length / 60) * 10) / 10 : 0,
    totalCost: Math.round(totalCost),
    costPerBooking: booked ? Math.round(totalCost / booked) : null,
    askedPricePct: pct(conversations.filter((p) => p.calls.some((c) => c.asked_price)).length, conversations.length),
  };
}

export { groupPeople };
