import type { CallStatus } from "@/lib/types";
import type { Connection } from "@/lib/status";

// ---------- status + flags ----------

export const STATUS_STYLE: Record<CallStatus, { pill: string; dot: string; bar: string }> = {
  qualified: { pill: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  borderline: { pill: "bg-amber-400/15 text-amber-300 ring-amber-400/40", dot: "bg-amber-400", bar: "bg-amber-400" },
  unqualified: { pill: "bg-slate-400/15 text-slate-300 ring-slate-400/30", dot: "bg-slate-400", bar: "bg-slate-500" },
  escalated: { pill: "bg-rose-500/20 text-rose-300 ring-rose-400/50", dot: "bg-rose-500", bar: "bg-rose-500" },
  incomplete: { pill: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", dot: "bg-zinc-500", bar: "bg-zinc-600" },
};

export function StatusPill({ status, overridden }: { status: CallStatus | null; overridden?: boolean }) {
  if (!status) return <span className="text-xs text-white/40">processing…</span>;
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${s.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
      {overridden && <span title="Changed by the front desk">✎</span>}
    </span>
  );
}

const FLAG: Record<string, { label: string; cls: string }> = {
  vip: { label: "VIP", cls: "bg-violet-500/20 text-violet-200 ring-violet-400/40" },
  frustrated: { label: "Frustrated", cls: "bg-rose-500/20 text-rose-200 ring-rose-400/40" },
  existing_client: { label: "Existing client", cls: "bg-rose-500/20 text-rose-200 ring-rose-400/40" },
  no_booking: { label: "No slot booked", cls: "bg-orange-500/20 text-orange-200 ring-orange-400/40" },
  unconfirmed_fields: { label: "Check details", cls: "bg-amber-400/15 text-amber-200 ring-amber-400/30" },
  wants_human: { label: "Wants a human", cls: "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-400/40" },
  represented: { label: "Calling for owners", cls: "bg-sky-400/15 text-sky-200 ring-sky-400/30" },
  transferred: { label: "Transferred", cls: "bg-white/10 text-white/80 ring-white/20" },
};

export function Flags({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => {
        const x = FLAG[f] ?? { label: f, cls: "bg-white/10 text-white/80 ring-white/20" };
        return (
          <span key={f} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${x.cls}`}>
            {x.label}
          </span>
        );
      })}
    </span>
  );
}

// ---------- numbers ----------

export function Score({ score }: { score: number | null }) {
  if (score === null) return <span className="text-white/30">–</span>;
  const tone = score >= 70 ? "text-ombre" : score >= 40 ? "text-amber-300" : "text-white/50";
  return <span className={`font-bold tabular-nums ${tone}`}>{score}</span>;
}

export function ScoreRing({ score, size = 104 }: { score: number | null; size?: number }) {
  const pct = score ?? 0;
  return (
    <div
      className="relative grid place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(#7c3aed 0%, #d946ef ${pct * 0.45}%, #f97316 ${pct}%, rgba(255,255,255,0.08) ${pct}% 100%)` }}
    >
      <div className="grid place-items-center rounded-full bg-plum-950" style={{ width: size - 14, height: size - 14 }}>
        <div className="text-center leading-none">
          <div className="font-display text-3xl font-semibold text-white">{score ?? "–"}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/50">of 100</div>
        </div>
      </div>
    </div>
  );
}

export function Tile({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`glass ombre-border p-4 ${accent ? "bg-white/[0.07]" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold tabular-nums text-ombre">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/55">{sub}</div>}
    </div>
  );
}

// ---------- video ----------

export function VideoBackdrop({ src, poster }: { src: string; poster?: string }) {
  return (
    <>
      <div className="bg-ombre animate-drift absolute inset-0 opacity-80" />
      {src && <video className="video-bg" src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" aria-hidden />}
      <div className="video-wash" />
      <div className="video-scrim" />
    </>
  );
}

// ---------- connections ----------

const CONN_DOT: Record<Connection["state"], string> = {
  connected: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]",
  waiting: "bg-amber-300 shadow-[0_0_10px_2px_rgba(252,211,77,0.5)]",
  error: "bg-rose-500 shadow-[0_0_10px_2px_rgba(244,63,94,0.6)]",
  not_configured: "bg-white/25",
};
const CONN_WORD: Record<Connection["state"], string> = { connected: "Connected", waiting: "Waiting", error: "Error", not_configured: "Not set" };

export function Connections({ items }: { items: Connection[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span key={c.key} title={`${c.label}: ${CONN_WORD[c.state]} · ${c.detail}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/80">
          <span className={`h-1.5 w-1.5 rounded-full ${CONN_DOT[c.state]}`} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function ConnectionList({ items }: { items: Connection[] }) {
  return (
    <ul className="divide-y divide-white/5">
      {items.map((c) => (
        <li key={c.key} className="flex items-center gap-3 py-2.5 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${CONN_DOT[c.state]}`} />
          <span className="w-20 font-medium">{c.label}</span>
          <span className={`text-xs font-semibold ${c.state === "connected" ? "text-emerald-300" : c.state === "error" ? "text-rose-300" : "text-amber-200"}`}>{CONN_WORD[c.state]}</span>
          <span className="ml-auto truncate text-xs text-white/50">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="bg-ombre grid h-8 w-8 place-items-center rounded-xl font-display text-lg font-bold text-white shadow-[0_8px_24px_-6px_rgba(217,70,239,0.7)]">A</span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-semibold">Aangan</span>
        <span className="block text-[10px] uppercase tracking-[0.2em] text-white/50">Studio · Calls</span>
      </span>
    </span>
  );
}
