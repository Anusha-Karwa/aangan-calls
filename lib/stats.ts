import { toIst } from "./time";
import { effectiveStatus, type CallRow } from "./types";

export interface MonthStats {
  calls: number;
  afterHoursPct: number;
  byStatus: Record<string, number>;
  booked: number;
  bookingRate: number; // booked / (qualified + borderline)
  avgMinutes: number;
  totalCost: number;
  costPerBooking: number | null;
  askedPricePct: number;
}

export function monthKey(iso: string | Date): string {
  return toIst(new Date(iso)).toISOString().slice(0, 7);
}

export function monthStats(rows: CallRow[], month: string): MonthStats {
  const inMonth = rows.filter((r) => monthKey(r.started_at ?? r.created_at) === month);
  const byStatus: Record<string, number> = { qualified: 0, borderline: 0, unqualified: 0, escalated: 0, incomplete: 0 };
  for (const r of inMonth) {
    const s = effectiveStatus(r);
    if (s) byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const bookable = byStatus.qualified + byStatus.borderline;
  const booked = inMonth.filter((r) => r.booking_start && r.booking_status !== "cancelled").length;
  const talked = inMonth.filter((r) => r.duration_sec);
  const totalCost = inMonth.reduce((s, r) => s + (r.cost_inr ?? 0), 0);
  const conversations = inMonth.filter((r) => effectiveStatus(r) !== "incomplete");
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  return {
    calls: inMonth.length,
    afterHoursPct: pct(inMonth.filter((r) => r.after_hours).length, inMonth.length),
    byStatus,
    booked,
    bookingRate: pct(booked, bookable),
    avgMinutes: talked.length ? Math.round((talked.reduce((s, r) => s + (r.duration_sec ?? 0), 0) / talked.length / 60) * 10) / 10 : 0,
    totalCost: Math.round(totalCost),
    costPerBooking: booked ? Math.round(totalCost / booked) : null,
    askedPricePct: pct(conversations.filter((r) => r.asked_price).length, conversations.length),
  };
}
