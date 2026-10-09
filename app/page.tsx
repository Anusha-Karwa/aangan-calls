import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { monthKey, monthStats } from "@/lib/stats";
import { formatDate, formatIst, toIst } from "@/lib/time";
import { effectiveStatus, type CallRow, type CallStatus } from "@/lib/types";
import { Flags, Score, STATUS_STYLE, StatusPill, Tile, VideoBackdrop } from "@/components/ui";
import { TopNav } from "@/components/nav";
import { markContacted } from "./actions";

export const dynamic = "force-dynamic";

type Search = { view?: string; status?: string; q?: string; from?: string; to?: string; month?: string };
const VIEWS = [
  { key: "all", label: "All calls" },
  { key: "upcoming", label: "Upcoming consultations" },
  { key: "reengage", label: "Re-engage" },
];
const STATUSES: CallStatus[] = ["qualified", "borderline", "unqualified", "escalated", "incomplete"];

function filterRows(rows: CallRow[], s: Search): CallRow[] {
  const q = (s.q ?? "").toLowerCase().trim();
  const qDigits = q.replace(/\D/g, "");
  return rows.filter((r) => {
    if (s.status && effectiveStatus(r) !== s.status) return false;
    const day = toIst(new Date(r.started_at ?? r.created_at)).toISOString().slice(0, 10);
    if (s.from && day < s.from) return false;
    if (s.to && day > s.to) return false;
    if (q) {
      const name = (r.caller_name ?? "").toLowerCase();
      const phone = (r.phone ?? "").replace(/\D/g, "");
      if (!name.includes(q) && !(qDigits.length >= 3 && phone.includes(qDigits))) return false;
    }
    return true;
  });
}

function greeting(): string {
  const h = toIst(new Date()).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function monthLabel(m: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
}

export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const view = searchParams.view ?? "all";
  const rows = await db().listCalls({ limit: 1000 });
  const month = searchParams.month ?? monthKey(new Date());
  const st = monthStats(rows, month);
  const upcomingCount = rows.filter((r) => r.booking_start && Date.parse(r.booking_start) >= Date.now() && r.booking_status !== "cancelled").length;
  const warmCount = rows.filter((r) => effectiveStatus(r) === "unqualified" && r.reengage_rating === "warm" && !r.reengaged_at).length;

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/?${p}`;
  };

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 pb-16">
        {/* Hero */}
        <section className="relative mt-5 overflow-hidden rounded-3xl border border-white/10">
          <VideoBackdrop src={env("HERO_VIDEO_URL")} />
          <div className="relative z-10 flex min-h-[300px] flex-col justify-end gap-4 p-6 pb-24 sm:p-10 sm:pb-24 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">{monthLabel(month)}</div>
              <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl">
                {greeting()}, <span className="text-ombre">designer.</span>
              </h1>
              <p className="mt-2 max-w-lg text-sm text-white/75">
                {upcomingCount ? `${upcomingCount} consultation${upcomingCount > 1 ? "s" : ""} coming up` : "No consultations booked yet"}
                {warmCount ? ` · ${warmCount} warm lead${warmCount > 1 ? "s" : ""} to re-engage` : ""}.
              </p>
            </div>
            <form className="flex items-center gap-2">
              <input type="hidden" name="view" value={view} />
              <input aria-label="Month" type="month" name="month" defaultValue={month} className="field bg-plum-950/50" />
              <button className="btn-ghost bg-plum-950/40">Show</button>
            </form>
          </div>
        </section>

        {/* KPI tiles overlap the hero */}
        <section className="relative z-20 -mt-16 grid grid-cols-2 gap-3 px-2 sm:px-6 lg:grid-cols-5">
          <Tile label="Calls" value={st.calls} sub={`${st.afterHoursPct}% after hours`} accent />
          <Tile label="Qualified" value={`${st.byStatus.qualified}`} sub={`+${st.byStatus.borderline} borderline · ${st.byStatus.escalated} escalated`} />
          <Tile label="Booked" value={st.booked} sub={`${st.bookingRate}% booking rate`} />
          <Tile label="Cost" value={`₹${st.totalCost.toLocaleString("en-IN")}`} sub={`${st.avgMinutes} min avg · ${st.costPerBooking !== null ? `₹${st.costPerBooking}/booking` : "no bookings yet"}`} />
          <Tile label="Asked price" value={`${st.askedPricePct}%`} sub="no number ever quoted" />
        </section>

        {/* Status mix */}
        <section className="mt-5">
          <div className="glass p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Status mix</h2>
              <span className="text-xs text-white/50">{st.calls} calls in {monthLabel(month)}</span>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/5">
              {STATUSES.map((s) =>
                st.byStatus[s] ? <div key={s} className={STATUS_STYLE[s].bar} style={{ width: `${(st.byStatus[s] / Math.max(st.calls, 1)) * 100}%` }} title={`${s}: ${st.byStatus[s]}`} /> : null,
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {STATUSES.map((s) => (
                <Link key={s} href={href({ view: "all", status: s })} className="flex items-center gap-2 text-xs text-white/70 hover:text-white">
                  <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                  <span className="capitalize">{s}</span>
                  <span className="font-semibold text-white">{st.byStatus[s]}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Tabs */}
        <nav className="mt-8 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1 text-sm">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href({ view: v.key })}
              className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition ${view === v.key ? "bg-ombre text-white shadow-[0_8px_24px_-8px_rgba(217,70,239,0.8)]" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
            >
              {v.label}
              {v.key === "upcoming" && upcomingCount > 0 && <span className="ml-2 rounded-full bg-white/20 px-1.5 text-[11px]">{upcomingCount}</span>}
              {v.key === "reengage" && warmCount > 0 && <span className="ml-2 rounded-full bg-white/20 px-1.5 text-[11px]">{warmCount}</span>}
            </Link>
          ))}
        </nav>

        {view === "upcoming" ? <Upcoming rows={rows} /> : view === "reengage" ? <Reengage rows={rows} /> : <AllCalls rows={filterRows(rows, searchParams)} s={searchParams} />}
      </main>
    </>
  );
}

function AllCalls({ rows, s }: { rows: CallRow[]; s: Search }) {
  return (
    <>
      <form className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value="all" />
        <input name="q" defaultValue={s.q} placeholder="Search name or phone…" className="field w-56" />
        <select name="status" defaultValue={s.status ?? ""} className="field">
          <option value="">All statuses</option>
          {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input aria-label="From" type="date" name="from" defaultValue={s.from} className="field" />
        <span className="text-white/40">→</span>
        <input aria-label="To" type="date" name="to" defaultValue={s.to} className="field" />
        <button className="btn-ombre">Filter</button>
        <Link href="/" className="px-2 text-sm text-white/50 hover:text-white">Clear</Link>
      </form>

      {rows.length === 0 ? (
        <Empty text="No calls match. Test calls appear here a few seconds after they end." />
      ) : (
        <>
          <div className="glass mt-4 hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-white/45">
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Caller</th>
                  <th className="px-4 py-3 font-semibold">Area</th>
                  <th className="px-4 py-3 text-right font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Consultation</th>
                  <th className="px-4 py-3 font-semibold">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b border-white/5 transition last:border-0 hover:bg-gradient-to-r hover:from-violet-600/15 hover:via-fuchsia-600/10 hover:to-orange-500/15">
                    <td className="whitespace-nowrap px-4 py-3 text-white/55">
                      <Link href={`/calls/${r.id}`} className="block">{formatIst(r.started_at ?? r.created_at)}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/calls/${r.id}`} className="block font-semibold text-white group-hover:text-ombre">{r.caller_name ?? r.phone ?? "Unknown caller"}</Link>
                      {r.caller_name && r.phone && <span className="text-xs text-white/40">{r.phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/80">{r.location_area ?? <span className="text-white/30">–</span>}</td>
                    <td className="px-4 py-3 text-right text-base"><Score score={r.score} /></td>
                    <td className="px-4 py-3"><StatusPill status={effectiveStatus(r)} overridden={Boolean(r.status_override)} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/80">{r.booking_start ? formatIst(r.booking_start) : <span className="text-white/30">–</span>}</td>
                    <td className="px-4 py-3"><Flags flags={r.flags} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/calls/${r.id}`} className="glass block p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.caller_name ?? r.phone ?? "Unknown caller"}</span>
                    <StatusPill status={effectiveStatus(r)} overridden={Boolean(r.status_override)} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-white/55">
                    <span>{formatIst(r.started_at ?? r.created_at)}</span>·<span>{r.location_area ?? "area ?"}</span>·<span>score <Score score={r.score} /></span>
                  </div>
                  {r.booking_start && <div className="mt-2 text-xs font-medium text-orange-200">📅 {formatIst(r.booking_start)}</div>}
                  <div className="mt-2"><Flags flags={r.flags} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Upcoming({ rows }: { rows: CallRow[] }) {
  const now = Date.now() - 2 * 3600_000;
  const list = rows
    .filter((r) => r.booking_start && Date.parse(r.booking_start) >= now && r.booking_status !== "cancelled")
    .sort((a, b) => a.booking_start!.localeCompare(b.booking_start!));
  if (!list.length) return <Empty text="No upcoming consultations yet. Calls the agent books show up here, soonest first." />;
  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {list.map((r) => {
        const d = new Date(r.booking_start!);
        return (
          <li key={r.id}>
            <Link href={`/calls/${r.id}`} className="glass ombre-border flex gap-4 p-4 transition hover:bg-white/[0.07]">
              <div className="bg-ombre grid w-16 shrink-0 place-items-center rounded-xl py-2 text-center text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wider">{new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(d)}</div>
                <div className="font-display text-2xl font-semibold leading-none">{new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }).format(d)}</div>
                <div className="text-[10px]">{formatIst(d, { date: false }).replace(" IST", "")}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{r.caller_name ?? r.phone}</span>
                  <StatusPill status={effectiveStatus(r)} />
                </div>
                <div className="mt-1 text-sm text-white/65">
                  {[r.property, r.location_area, r.carpet_sqft ? `${r.carpet_sqft} sq ft` : null].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium">{r.booking_type === "site_visit" ? "🏠 Site visit" : r.booking_type === "studio" ? "🏛 Studio" : "Type ?"}</span>
                  <Flags flags={r.flags} />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Reengage({ rows }: { rows: CallRow[] }) {
  const list = rows
    .filter((r) => effectiveStatus(r) === "unqualified" && r.reengage_rating === "warm" && !r.reengaged_at)
    .sort((a, b) => (a.reengage_date ?? "9999").localeCompare(b.reengage_date ?? "9999"));
  const today = toIst(new Date()).toISOString().slice(0, 10);
  if (!list.length) return <Empty text="No warm leads waiting. Unqualified calls with a short timeline or 'just exploring' land here." />;
  return (
    <ul className="mt-4 space-y-2">
      {list.map((r) => {
        const due = r.reengage_date && r.reengage_date <= today;
        return (
          <li key={r.id} className={`glass flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${due ? "ombre-border" : ""}`}>
            <span className="w-28">
              <span className={`block text-sm font-semibold ${due ? "text-ombre" : "text-white/80"}`}>{formatDate(r.reengage_date)}</span>
              {due && <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-300">Due now</span>}
            </span>
            <Link href={`/calls/${r.id}`} className="min-w-0 flex-1">
              <div className="font-semibold">{r.caller_name ?? r.phone ?? "Unknown caller"}</div>
              <div className="truncate text-sm text-white/55">{r.decline_reason}</div>
            </Link>
            {r.phone && <a href={`tel:${r.phone}`} className="text-sm font-medium text-orange-200 hover:text-orange-100">{r.phone}</a>}
            <form action={markContacted}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn-ghost">Mark contacted</button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="glass mt-4 p-10 text-center">
      <div className="bg-ombre mx-auto mb-3 h-10 w-10 rounded-full opacity-80 blur-[1px]" />
      <p className="text-sm text-white/60">{text}</p>
    </div>
  );
}
