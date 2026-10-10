"use client";

import Link from "next/link";
import { useState } from "react";

// Booking calendar for the hero: each day shows pins for calls received and consultations booked.
// Hover / focus / tap a pin to pop its label.

export interface DayPin {
  id: string;
  kind: "call" | "booking";
  name: string;
  time: string;
  detail: string; // e.g. "Qualified · Koregaon Park" or "Site visit"
}

export interface CalendarDay {
  day: number;
  isToday: boolean;
  pins: DayPin[];
}

export function BookingCalendar({ title, offset, days }: { title: string; offset: number; days: CalendarDay[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const calls = days.reduce((n, d) => n + d.pins.filter((p) => p.kind === "call").length, 0);
  const bookings = days.reduce((n, d) => n + d.pins.filter((p) => p.kind === "booking").length, 0);

  return (
    <div tabIndex={-1} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(null)} className="w-[272px] rounded-2xl border border-violet-100 bg-white/95 p-4 shadow-[0_24px_50px_-20px_rgba(91,33,182,0.35)] backdrop-blur" onMouseLeave={() => setOpen(null)}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-ink">📅 {title}</div>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-muted">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />{calls} calls</span>
          <span className="flex items-center gap-1"><span className="bg-ombre h-2 w-2 rounded-full" />{bookings} booked</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {days.map((d) => {
          const booking = d.pins.find((p) => p.kind === "booking");
          const has = d.pins.length > 0;
          const isOpen = open === d.day;
          return (
            <div key={d.day} className="relative">
              <button
                type="button"
                disabled={!has}
                onMouseEnter={() => has && setOpen(d.day)}
                onFocus={() => has && setOpen(d.day)}
                onClick={() => has && setOpen(d.day)}
                className={`relative grid h-8 w-full place-items-center rounded-lg text-xs font-semibold transition ${
                  booking ? "bg-ombre text-white shadow-sm" : has ? "bg-violet-50 text-violet-800 hover:bg-violet-100" : "text-ink/60"
                } ${d.isToday ? "ring-2 ring-orange-400 ring-offset-1" : ""} ${isOpen ? "scale-110" : ""}`}
                aria-label={has ? `${d.day}: ${d.pins.length} item(s)` : String(d.day)}
              >
                {d.day}
                {has && !booking && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-violet-500" />}
                {booking && <span className="pin-ring absolute -inset-0.5 rounded-lg bg-fuchsia-300/40" />}
              </button>
              {isOpen && (
                <div className="animate-pop absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-56 -translate-x-1/2 rounded-xl bg-white p-2.5 text-left shadow-xl ring-1 ring-violet-100">
                  <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white ring-1 ring-violet-100 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                  <ul className="space-y-1.5">
                    {d.pins.slice(0, 4).map((p) => (
                      <li key={p.id + p.kind}>
                        <Link href={`/calls/${p.id}`} className="flex items-start gap-2 rounded-lg p-1 hover:bg-violet-50">
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.kind === "booking" ? "bg-ombre" : "bg-violet-400"}`} />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-ink">{p.kind === "booking" ? "Consultation · " : "Call · "}{p.name}</span>
                            <span className="block truncate text-[11px] text-muted">{p.time} · {p.detail}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                    {d.pins.length > 4 && <li className="px-1 text-[11px] text-muted">+{d.pins.length - 4} more</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
