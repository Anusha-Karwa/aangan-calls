import type { CallStatus } from "@/lib/types";
import { AanganLogo } from "./logo";

// ---------- status + flags (light theme, vivid) ----------

export const STATUS_STYLE: Record<CallStatus, { pill: string; dot: string; bar: string; label: string }> = {
  qualified: { pill: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-600", bar: "bg-violet-600", label: "Qualified" },
  borderline: { pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", bar: "bg-amber-400", label: "Borderline" },
  unqualified: { pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400", bar: "bg-gray-400", label: "Unqualified" },
  escalated: { pill: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-600", bar: "bg-red-600", label: "Escalated" },
  incomplete: { pill: "bg-stone-50 text-stone-400 ring-stone-200", dot: "bg-stone-300", bar: "bg-stone-200", label: "Incomplete" },
};

export function StatusPill({ status, overridden }: { status: CallStatus | null; overridden?: boolean }) {
  if (!status) return <span className="text-xs text-muted">processing…</span>;
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
      {overridden && <span title="Changed by the front desk">✎</span>}
    </span>
  );
}

const FLAG: Record<string, { label: string; cls: string }> = {
  vip: { label: "VIP", cls: "bg-violet-100 text-violet-700" },
  frustrated: { label: "Frustrated", cls: "bg-rose-100 text-rose-700" },
  existing_client: { label: "Existing client", cls: "bg-rose-100 text-rose-700" },
  no_booking: { label: "No slot booked", cls: "bg-orange-100 text-orange-700" },
  unconfirmed_fields: { label: "Check details", cls: "bg-amber-100 text-amber-700" },
  wants_human: { label: "Wants a human", cls: "bg-fuchsia-100 text-fuchsia-700" },
  represented: { label: "Calling for owners", cls: "bg-sky-100 text-sky-700" },
  transferred: { label: "Transferred", cls: "bg-slate-100 text-slate-600" },
};

export function Flags({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => {
        const x = FLAG[f] ?? { label: f, cls: "bg-slate-100 text-slate-600" };
        return (
          <span key={f} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${x.cls}`}>
            {x.label}
          </span>
        );
      })}
    </span>
  );
}

// ---------- numbers ----------

export function Score({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-300">–</span>;
  const tone = score >= 70 ? "text-ombre" : score >= 40 ? "text-amber-600" : "text-slate-400";
  return <span className={`font-bold tabular-nums ${tone}`}>{score}</span>;
}

export function ScoreRing({ score, size = 104 }: { score: number | null; size?: number }) {
  const pct = score ?? 0;
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(#7c3aed 0%, #d946ef ${pct * 0.45}%, #f97316 ${pct}%, #efe9fb ${pct}% 100%)` }}
    >
      <div className="grid place-items-center rounded-full bg-white" style={{ width: size - 12, height: size - 12 }}>
        <div className="text-center leading-none">
          <div className="font-display text-3xl font-semibold text-ink">{score ?? "–"}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted">of 100</div>
        </div>
      </div>
    </div>
  );
}

// ---------- video ----------

export function VideoBackdrop({ src, tone = "dark" }: { src: string; tone?: "dark" | "light" }) {
  return (
    <>
      <div className="bg-ombre animate-drift absolute inset-0 opacity-70" />
      {src && <video className="video-bg" src={src} autoPlay muted loop playsInline preload="metadata" aria-hidden />}
      <div className="video-wash" />
      <div className={tone === "light" ? "video-scrim-light" : "video-scrim"} />
    </>
  );
}

export function Logo({ light, tagline = "Interiors · Pune" }: { light?: boolean; tagline?: string | null }) {
  return <AanganLogo tone={light ? "light" : "dark"} tagline={tagline} />;
}
