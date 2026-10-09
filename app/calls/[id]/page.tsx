import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatIst } from "@/lib/time";
import { effectiveStatus } from "@/lib/types";
import { Flags, ScoreRing, StatusPill } from "@/components/ui";
import { TopNav } from "@/components/nav";
import { overrideStatus, resendEmail, resendHubspot } from "../../actions";

export const dynamic = "force-dynamic";

const SITE: Record<string, string> = { bare: "Bare shell", builder: "Builder finish", lived_in: "Lived-in", rented: "Rented", unknown: "Unknown" };
const DM: Record<string, string> = {
  self: "Caller decides",
  authorised: "Authorised by owner",
  represents: "Calling for the owners",
  research: "Research only",
  unknown: "Not confirmed",
};

export default async function CallPage({ params }: { params: { id: string } }) {
  const c = await db().getCall(params.id);
  if (!c) notFound();
  const events = await db().listEvents(c.id);
  const status = effectiveStatus(c);
  const ex = (c.extraction ?? {}) as { _unconfirmed?: string[]; _breakdown?: Record<string, number> | null; _mode?: string };
  const unconfirmed = new Set(ex._unconfirmed ?? []);
  const warn = (k: string) => (unconfirmed.has(k) ? <span title="Not confirmed: check with the caller" className="ml-1 text-amber-300">⚠</span> : null);

  const prep: [string, React.ReactNode, string?][] = [
    ["Phone", c.phone ? <a href={`tel:${c.phone}`} className="font-semibold text-orange-200 hover:text-orange-100">{c.phone}</a> : "–", "📞"],
    ["Email", c.email ? <a href={`mailto:${c.email}`} className="text-orange-200 hover:text-orange-100">{c.email}{warn("email")}</a> : "–", "✉️"],
    ["Area", <>{c.location_area ?? "–"}{c.in_service_area === false && <span className="text-rose-300"> (outside area)</span>}{c.in_service_area === null && c.location_area && <span className="text-amber-200"> (unclear)</span>}{warn("location_area")}</>, "📍"],
    ["Property", <>{[c.property, c.carpet_sqft ? `${c.carpet_sqft} sq ft carpet` : null].filter(Boolean).join(" · ") || "–"}{warn("carpet_sqft")}</>, "🏠"],
    ["Site state", c.site_state ? SITE[c.site_state] ?? c.site_state : "–", "🧱"],
    ["Scope", <>{c.scope ?? "–"}{warn("scope")}</>, "✏️"],
    ["Wants it done by", <>{c.timeline_text ?? "–"}{c.target_date && <span className="text-white/50"> ({formatDate(c.target_date)})</span>}{c.weeks_to_target !== null && <span className="text-white/50"> · ~{c.weeks_to_target} wks</span>}{warn("timeline")}</>, "⏳"],
    ["Budget", <>{c.budget_volunteered ?? "Not discussed"}{c.asked_price && <span className="ml-2 rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-orange-200">asked price</span>}</>, "₹"],
    ["Decision-maker", <>{c.decision_maker ? DM[c.decision_maker] ?? c.decision_maker : "Not confirmed"}{warn("decision_maker")}</>, "🤝"],
    ["Source", c.source ?? "–", "✨"],
  ];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">
        <Link href="/" className="text-sm text-white/50 hover:text-white">← All calls</Link>

        {/* Header card */}
        <section className="glass ombre-border relative mt-3 overflow-hidden p-6">
          <div className="bg-ombre animate-drift pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-6">
            <ScoreRing score={c.score} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={status} overridden={Boolean(c.status_override)} />
                <Flags flags={c.flags} />
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{c.caller_name ?? c.phone ?? "Unknown caller"}</h1>
              <div className="mt-1 text-sm text-white/55">
                Called {formatIst(c.started_at ?? c.created_at)}
                {c.after_hours && " · after hours"}
                {c.duration_sec !== null && ` · ${Math.floor(c.duration_sec / 60)}m ${c.duration_sec % 60}s`}
                {c.cost_inr !== null && ` · ₹${c.cost_inr}`}
              </div>
              {c.status_override && <div className="mt-1 text-xs text-white/45">Set to {status} by {c.override_by}; the rubric said {c.status}.</div>}
            </div>
            <div className={`rounded-2xl px-5 py-4 text-center ${c.booking_start ? "bg-ombre text-white shadow-[0_12px_32px_-10px_rgba(249,115,22,0.7)]" : "border border-orange-400/40 bg-orange-500/10 text-orange-100"}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Consultation</div>
              {c.booking_start ? (
                <>
                  <div className="mt-1 font-display text-xl font-semibold">{formatIst(c.booking_start)}</div>
                  <div className="text-xs opacity-90">
                    {c.booking_type === "site_visit" ? "Site visit" : c.booking_type === "studio" ? "Studio visit" : "Type not set"}
                    {c.booking_status && c.booking_status !== "accepted" && ` · ${c.booking_status}`}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm font-semibold">Not booked: call back</div>
              )}
            </div>
          </div>
          {(c.decline_reason || c.reengage_rating) && (
            <div className="relative mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80">
              {c.decline_reason}
              {c.reengage_rating && <span className="ml-2 text-white/50">· re-engage <strong className="text-white">{c.reengage_rating}</strong>{c.reengage_date && ` on ${formatDate(c.reengage_date)}`}</span>}
            </div>
          )}
        </section>

        {/* Prep card */}
        <section className="mt-4">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Call prep card</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {prep.map(([k, v, icon]) => (
              <div key={k} className="glass flex gap-3 p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-base">{icon}</span>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{k}</dt>
                  <dd className="mt-0.5 text-sm text-white/90">{v}</dd>
                </div>
              </div>
            ))}
          </dl>
          {ex._breakdown && (
            <div className="mt-2 flex flex-wrap gap-2 px-1 text-xs text-white/50">
              {Object.entries(ex._breakdown).map(([k, v]) => (
                <span key={k} className="rounded-full border border-white/10 px-2.5 py-1">
                  {k.replace("_", "-")} <strong className="text-white/85">{v}</strong>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Summary + recording */}
        <section className="mt-4 grid gap-4 md:grid-cols-5">
          <div className="glass p-5 md:col-span-3">
            <h2 className="text-sm font-semibold">Summary</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/85">
              {(c.summary ?? "").split("\n").filter(Boolean).map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="bg-ombre mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  {l.replace(/^[-•]\s*/, "")}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass p-5 md:col-span-2">
            <h2 className="text-sm font-semibold">Recording</h2>
            {c.recording_url ? <audio controls preload="none" src={`/api/recording/${c.id}`} className="mt-4 w-full" /> : <p className="mt-3 text-sm text-white/50">No recording in the webhook payload.</p>}
            {c.transcript_url && <a href={c.transcript_url} className="mt-3 block text-sm text-orange-200">Transcript file ↗</a>}
          </div>
        </section>

        {/* Front desk */}
        <section className="glass mt-4 p-5">
          <h2 className="text-sm font-semibold">Front desk</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <form action={overrideStatus} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Status</span>
                <select name="status" defaultValue={status ?? ""} className="field">
                  {["qualified", "borderline", "unqualified", "escalated", "incomplete"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Your name</span>
                <input name="by" defaultValue={c.override_by ?? ""} placeholder="front desk" className="field w-36" />
              </label>
              <button className="btn-ombre">Save status</button>
            </form>
            <form action={resendEmail}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-ghost">Resend email</button>
            </form>
            <form action={resendHubspot}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-ghost">Resend to HubSpot</button>
            </form>
          </div>
          <div className="mt-3 text-xs text-white/45">
            {c.notified_at ? `Emailed ${formatIst(c.notified_at)}${c.email_id && c.email_id !== "dry-run" ? ` · Resend ${c.email_id.slice(0, 8)}…` : ""}` : "No email sent"}
            {c.hubspot_deal_id && ` · HubSpot deal ${c.hubspot_deal_id}`}
          </div>
        </section>

        {/* Transcript as chat */}
        <section className="glass mt-4 p-5">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <div className="mt-4 space-y-2.5">
            {(c.transcript ?? "No transcript.").split("\n").filter(Boolean).map((line, i) => {
              const m = /^([A-Za-z ]{2,20}):\s*(.*)$/.exec(line);
              if (!m) return <p key={i} className="text-center text-xs italic text-white/40">{line}</p>;
              const caller = /caller|user|customer/i.test(m[1]);
              return (
                <div key={i} className={`flex ${caller ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${caller ? "bg-ombre rounded-br-md text-white" : "rounded-bl-md border border-white/10 bg-white/[0.06] text-white/90"}`}>
                    <div className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${caller ? "text-white/75" : "text-white/45"}`}>{m[1]}</div>
                    {m[2]}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Activity */}
        <section className="glass mt-4 p-5">
          <h2 className="text-sm font-semibold">Activity</h2>
          <ol className="mt-3 space-y-2 border-l border-white/10 pl-4 text-xs">
            {events.map((e) => (
              <li key={String(e.id)} className="relative">
                <span className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${/error|failed/.test(e.type) ? "bg-rose-500" : "bg-ombre"}`} />
                <span className="text-white/45">{formatIst(e.at)}</span>
                <span className={`ml-2 font-semibold ${/error|failed/.test(e.type) ? "text-rose-300" : "text-white/85"}`}>{e.type.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
