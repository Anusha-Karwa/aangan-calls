"use client";

import { useState } from "react";

// Calls per day: a single-series bar chart (one hue, no legend; the title names it).
// Thin bars, 4px rounded tops on the baseline, 2px gaps, hover tooltip per bar.
export function DailyBars({ days }: { days: { label: string; calls: number; booked: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.calls));
  const total = days.reduce((s, d) => s + d.calls, 0);
  return (
    <div>
      <div className="relative flex h-10 items-end gap-[2px]" onMouseLeave={() => setHover(null)} role="img" aria-label={`Calls per day, ${total} in total`}>
        {days.map((d, i) => {
          const h = d.calls ? Math.max(14, (d.calls / max) * 100) : 0;
          return (
            <div key={i} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
              {/* hit target is the full column height, larger than the mark */}
              {d.calls ? (
                <div className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-fuchsia-500" : "bg-violet-400"}`} style={{ height: `${h}%` }} />
              ) : (
                <div className="h-[2px] w-full rounded-full bg-violet-100" />
              )}
              {hover === i && (
                <div className="animate-pop pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-max -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
                  {d.label} · {d.calls} call{d.calls === 1 ? "" : "s"}{d.booked ? ` · ${d.booked} booked` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}
