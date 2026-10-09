import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatIst } from "@/lib/time";
import { effectiveStatus } from "@/lib/types";
import { Flags, Score, StatusPill } from "@/components/ui";
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
  const warn = (k: string) => (unconfirmed.has(k) ? <span title="Not confirmed: check with the caller" className="ml-1 text-amber-600">⚠</span> : null);

  const prep: [string, React.ReactNode][] = [
    ["Phone", c.phone ? <a href={`tel:${c.phone}`} className="text-brand-700 underline-offset-2 hover:underline">{c.phone}</a> : "–"],
    ["Email", c.email ? <a href={`mailto:${c.email}`} className="text-brand-700">{c.email}{warn("email")}</a> : "–"],
    ["Area", <>{c.location_area ?? "–"}{c.in_service_area === false && " (outside area)"}{c.in_service_area === null && c.location_area && " (unclear)"}{warn("location_area")}</>],
    ["Property", <>{[c.property, c.carpet_sqft ? `${c.carpet_sqft} sq ft carpet` : null].filter(Boolean).join(" · ") || "–"}{warn("carpet_sqft")}</>],
    ["Site state", c.site_state ? SITE[c.site_state] ?? c.site_state : "–"],
    ["Scope", <>{c.scope ?? "–"}{warn("scope")}</>],
    ["Wants it done by", <>{c.timeline_text ?? "–"}{c.target_date && <span className="text-muted"> ({formatDate(c.target_date)})</span>}{c.weeks_to_target !== null && <span className="text-muted"> · ~{c.weeks_to_target} wks</span>}{warn("timeline")}</>],
    ["Budget", <>{c.budget_volunteered ?? "Not discussed"}{c.asked_price && <span className="ml-1 rounded bg-stone-100 px-1.5 text-xs">asked price</span>}</>],
    ["Decision-maker", <>{c.decision_maker ? DM[c.decision_maker] ?? c.decision_maker : "Not confirmed"}{warn("decision_maker")}</>],
    ["Source", c.source ?? "–"],
    ["Booking", c.booking_start ? <><strong>{formatIst(c.booking_start)}</strong> · {c.booking_type === "site_visit" ? "Site visit" : c.booking_type === "studio" ? "Studio" : "type ?"}{c.booking_status && c.booking_status !== "accepted" && <span className="ml-1 text-red-700">({c.booking_status})</span>}</> : <span className="text-amber-700">Not booked: call back</span>],
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">← All calls</Link>

      {/* Call prep card */}
      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h1 className="text-xl font-semibold">{c.caller_name ?? c.phone ?? "Unknown caller"}</h1>
            <div className="mt-0.5 text-sm text-muted">
              Called {formatIst(c.started_at ?? c.created_at)}
              {c.after_hours && " · after hours"}
              {c.duration_sec !== null && ` · ${Math.floor(c.duration_sec / 60)}m ${c.duration_sec % 60}s`}
              {c.cost_inr !== null && ` · ₹${c.cost_inr}`}
              {c.channel !== "phone" && ` · ${c.channel}`}
            </div>
            <div className="mt-2"><Flags flags={c.flags} /></div>
          </div>
          <div className="text-right">
            <div className="text-3xl"><Score score={c.score} /><span className="text-base text-muted">/100</span></div>
            <StatusPill status={status} overridden={Boolean(c.status_override)} />
            {c.status_override && <div className="mt-1 text-xs text-muted">by {c.override_by}; rubric said {c.status}</div>}
          </div>
        </div>
        {(c.decline_reason || c.reengage_rating) && (
          <div className="border-b border-line bg-paper px-4 py-2 text-sm">
            {c.decline_reason && <span>{c.decline_reason}</span>}
            {c.reengage_rating && <span className="ml-2 text-muted">· re-engage: <strong>{c.reengage_rating}</strong>{c.reengage_date && ` on ${formatDate(c.reengage_date)}`}</span>}
          </div>
        )}
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {prep.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
              <dt className="w-32 shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
        {ex._breakdown && (
          <div className="border-t border-line px-4 py-2 text-xs text-muted">
            Score: {Object.entries(ex._breakdown).map(([k, v]) => `${k.replace("_", "-")} ${v}`).join(" · ")}
            {ex._mode === "heuristic" && " · extracted in mock mode (no Gemini key)"}
          </div>
        )}
      </section>

      {/* Summary + recording */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Summary</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {(c.summary ?? "").split("\n").filter(Boolean).map((l, i) => <li key={i}>{l.replace(/^[-•]\s*/, "")}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Recording</h2>
          {c.recording_url ? (
            <audio controls preload="none" src={c.recording_url} className="mt-3 w-full" />
          ) : (
            <p className="mt-2 text-sm text-muted">No recording in the webhook payload.</p>
          )}
          {c.transcript_url && <a href={c.transcript_url} className="mt-2 block text-sm text-brand-700">Transcript file ↗</a>}
        </div>
      </section>

      {/* Human in the loop */}
      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Front desk</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <form action={overrideStatus} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="id" value={c.id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Status</span>
              <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-line px-2 py-1.5">
                {["qualified", "borderline", "unqualified", "escalated", "incomplete"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Your name</span>
              <input name="by" defaultValue={c.override_by ?? ""} placeholder="front desk" className="w-32 rounded-lg border border-line px-2 py-1.5" />
            </label>
            <button className="rounded-lg bg-ink px-3 py-1.5 text-white">Save status</button>
          </form>
          <form action={resendEmail}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">Resend email</button>
          </form>
          <form action={resendHubspot}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">Resend to HubSpot</button>
          </form>
        </div>
        <div className="mt-2 text-xs text-muted">
          {c.notified_at ? `Emailed ${formatIst(c.notified_at)}${c.email_id && c.email_id !== "dry-run" ? ` · Resend id ${c.email_id}` : c.email_id === "dry-run" ? " (dry run)" : ""}` : "No email sent"}
          {c.hubspot_deal_id && ` · HubSpot deal ${c.hubspot_deal_id}`}
        </div>
      </section>

      {/* Transcript */}
      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Transcript</h2>
        <div className="mt-3 space-y-2 text-sm leading-relaxed">
          {(c.transcript ?? "No transcript.").split("\n").filter(Boolean).map((line, i) => {
            const m = /^([A-Za-z ]{2,20}):\s*(.*)$/.exec(line);
            const isCaller = m && /caller|user|customer/i.test(m[1]);
            return m ? (
              <p key={i}><span className={`font-medium ${isCaller ? "text-brand-700" : "text-muted"}`}>{m[1]}:</span> {m[2]}</p>
            ) : (
              <p key={i} className="text-muted">{line}</p>
            );
          })}
        </div>
      </section>

      {/* Audit log */}
      <section className="mt-4 rounded-xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Activity</h2>
        <ul className="mt-2 space-y-1 text-xs">
          {events.map((e) => (
            <li key={String(e.id)} className="flex gap-3">
              <span className="w-36 shrink-0 text-muted">{formatIst(e.at)}</span>
              <span className={/error|failed/.test(e.type) ? "font-medium text-red-700" : ""}>{e.type}</span>
              <span className="truncate text-muted">{e.detail ? JSON.stringify(e.detail) : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
