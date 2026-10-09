import type { CallStatus } from "@/lib/types";

const STATUS_STYLE: Record<CallStatus, string> = {
  qualified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  borderline: "bg-amber-50 text-amber-800 ring-amber-200",
  unqualified: "bg-stone-100 text-stone-700 ring-stone-200",
  escalated: "bg-red-50 text-red-800 ring-red-200",
  incomplete: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusPill({ status, overridden }: { status: CallStatus | null; overridden?: boolean }) {
  if (!status) return <span className="text-xs text-muted">processing…</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
      {overridden && <span title="Changed by the front desk">✎</span>}
    </span>
  );
}

const FLAG_LABEL: Record<string, string> = {
  vip: "VIP",
  frustrated: "Frustrated",
  unconfirmed_fields: "Check details",
  existing_client: "Existing client",
  wants_human: "Wants a human",
  transferred: "Transferred",
  represented: "Calling for owners",
  no_booking: "No slot booked",
};
const FLAG_STYLE: Record<string, string> = {
  vip: "bg-violet-50 text-violet-800",
  frustrated: "bg-red-50 text-red-800",
  existing_client: "bg-red-50 text-red-800",
  no_booking: "bg-amber-50 text-amber-800",
};

export function Flags({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${FLAG_STYLE[f] ?? "bg-stone-100 text-stone-700"}`}>
          {FLAG_LABEL[f] ?? f}
        </span>
      ))}
    </span>
  );
}

export function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Score({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted">–</span>;
  const tone = score >= 70 ? "text-emerald-700" : score >= 40 ? "text-amber-700" : "text-stone-500";
  return <span className={`font-semibold tabular-nums ${tone}`}>{score}</span>;
}
