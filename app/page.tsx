import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { groupPeople, type Person } from "@/lib/people";
import { inMonth, monthKey, monthStats } from "@/lib/stats";
import { formatIst, toIst } from "@/lib/time";
import { effectiveStatus, type CallStatus } from "@/lib/types";
import { STATUS_STYLE, StatusPill, VideoBackdrop } from "@/components/ui";
import { CountUp, PeopleBoard } from "@/components/interactive";
import { BookingCalendar, type CalendarDay, type DayPin } from "@/components/hero";
import { TopNav } from "@/components/nav";

export const dynamic = "force-dynamic";

type Search = { view?: string; status?: string; q?: string; month?: string };
const VIEWS = [
  { key: "all", label: "All callers" },
  { key: "upcoming", label: "Upcoming consultations" },
  { key: "reengage", label: "Re-engage" },
] as const;
const STATUSES: CallStatus[] = ["qualified", "borderline", "unqualified", "escalated", "incomplete"];

function greeting(): string {
  const h = toIst(new Date()).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function monthLabel(m: string): string {
  if (m === "all") return "All time";
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
}
function search(people: Person[], s: Search): Person[] {
  const q = (s.q ?? "").toLowerCase().trim();
  const qd = q.replace(/\D/g, "");
  return people.filter((p) => {
    if (s.status && p.latest.status !== s.status) return false;
    if (!q) return true;
    return (p.name ?? "").toLowerCase().includes(q) || (qd.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(qd)) || (p.latest.location_area ?? "").toLowerCase().includes(q);
  });
}

export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const view = (VIEWS.find((v) => v.key === searchParams.view)?.key ?? "all") as "all" | "upcoming" | "reengage";
  const all = await db().listCalls({ limit: 2000 });
  const month = searchParams.month ?? monthKey(new Date());
  const rows = inMonth(all, month);
  const monthPeople = groupPeople(rows);
  const st = monthStats(rows, monthPeople);

  // Upcoming + re-engage are not month-bound: they're about what to do next.
  const everyone = groupPeople(all);
  const listPeople = view === "all" ? search(monthPeople, searchParams) : everyone;
  const warm = everyone.filter((p) => p.latest.status === "unqualified" && p.latest.reengage_rating === "warm" && !p.latest.reengaged_at).length;
  const months = Array.from(new Set([monthKey(new Date()), ...all.map((r) => monthKey(r.started_at ?? r.created_at))])).sort().reverse();

  // Booking calendar for the hero: pins for calls received and consultations booked that month.
  const calMonth = month === "all" ? monthKey(new Date()) : month;
  const [cy, cm] = calMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(cy, cm - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
  const todayKey = toIst(new Date()).toISOString().slice(0, 10);
  const istDay = (iso: string) => toIst(new Date(iso)).toISOString().slice(0, 10);
  const istTime = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  const calendar: CalendarDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const key = `${calMonth}-${String(i + 1).padStart(2, "0")}`;
    const pins: DayPin[] = [
      ...all.filter((r) => r.booking_start && r.booking_status !== "cancelled" && istDay(r.booking_start) === key).map((r) => ({
        id: r.id, kind: "booking" as const, name: r.caller_name ?? r.phone ?? "Caller", time: istTime(r.booking_start!),
        detail: r.booking_type === "site_visit" ? "Site visit" : r.booking_type === "studio" ? "Studio visit" : "Consultation",
      })),
      ...all.filter((r) => istDay(r.started_at ?? r.created_at) === key).map((r) => {
        const s = effectiveStatus(r);
        return {
          id: r.id, kind: "call" as const, name: r.caller_name ?? r.phone ?? "Caller", time: istTime(r.started_at ?? r.created_at),
          detail: [s ? STATUS_STYLE[s].label : "Processing", r.location_area].filter(Boolean).join(" · "),
        };
      }),
    ];
    return { day: i + 1, isToday: key === todayKey, pins };
  });
  const last = all.find((r) => r.status);
  const nextBooking = everyone
    .flatMap((p) => p.calls.filter((c) => c.booking_start && Date.parse(c.booking_start) > Date.now() && c.booking_status !== "cancelled").map((c) => ({ p, c })))
    .sort((a, b) => a.c.booking_start!.localeCompare(b.c.booking_start!))[0];

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/?${p}`;
  };

  const funnel = [
    { label: "Answered", value: st.calls, icon: "📞" },
    { label: "Qualified", value: st.byStatus.qualified + st.byStatus.borderline, icon: "✓" },
    { label: "Booked", value: st.booked, icon: "📅" },
  ];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 pb-20">
        {/* Hero: the studio's call desk */}
        <section className="card floorplan animate-rise relative mt-5 overflow-hidden rounded-[28px] p-6 sm:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
            {/* Left: greeting + call-to-booking funnel */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 ring-1 ring-violet-100">
                <span className="bg-ombre h-1.5 w-1.5 rounded-full" />Call desk · {monthLabel(month)}
              </span>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-[56px]">
                {greeting()},<br /><span className="text-ombre">designer.</span>
              </h1>
              <p className="mt-3 max-w-md text-[15px] text-muted">
                {nextBooking
                  ? <>Your next consultation is with <strong className="text-ink">{nextBooking.p.name ?? nextBooking.p.phone}</strong> on <strong className="text-ink">{formatIst(nextBooking.c.booking_start)}</strong>.</>
                  : <>Every call is answered, qualified and booked into a consultation, and you get the brief before you call back.</>}
              </p>

              <ol className="mt-7 flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                {funnel.map((f, i) => (
                  <li key={f.label} className="flex flex-1 items-center gap-2">
                    <div className="flex-1 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                        <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${i === 2 ? "bg-ombre text-white" : "bg-violet-50 text-violet-700"}`}>{f.icon}</span>
                        {f.label}
                      </div>
                      <div className="text-ombre mt-1 font-display text-3xl font-semibold tabular-nums"><CountUp value={f.value} /></div>
                    </div>
                    {i < funnel.length - 1 && <span className="bg-ombre hidden h-0.5 w-5 shrink-0 rounded-full sm:block" />}
                  </li>
                ))}
              </ol>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/?view=upcoming" className="btn-ombre px-5 py-2.5">📅 Upcoming consultations</Link>
                <Link href="/?view=reengage" className="btn-soft px-5 py-2.5">↻ Re-engage{warm ? ` · ${warm}` : ""}</Link>
              </div>
            </div>

            {/* Right: the studio, with the last call and the booking calendar pinned to it */}
            <div className="relative mx-auto w-full max-w-[540px] pb-32 pt-8">
              <div className="relative ml-auto aspect-[4/3] w-[88%] overflow-hidden rounded-[26px] shadow-[0_30px_60px_-28px_rgba(91,33,182,0.55)] ring-8 ring-white">
                <VideoBackdrop src={env("HERO_VIDEO_URL")} tone="light" />
              </div>

              {last && (
                <Link href={`/calls/${last.id}`} className="card card-hover absolute right-0 top-0 flex w-[250px] items-center gap-3 p-3 sm:-right-3">
                  <span className="bg-ombre grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-md">📞</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Last call</span>
                      <span className="wave flex items-center gap-[3px]" aria-hidden><span /><span /><span /><span /><span /></span>
                    </span>
                    <span className="block truncate text-sm font-semibold text-ink">{last.caller_name ?? last.phone ?? "Caller"}</span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <StatusPill status={effectiveStatus(last)} />
                      <span className="truncate text-[11px] text-muted">{last.location_area ?? ""}</span>
                    </span>
                  </span>
                </Link>
              )}

              <div className="absolute bottom-0 left-0">
                <BookingCalendar title={monthLabel(calMonth)} offset={offset} days={calendar} />
              </div>
            </div>
          </div>
        </section>

        {/* KPI tiles */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Callers", value: <CountUp value={st.people} />, sub: `${st.calls} calls · ${st.afterHoursPct}% after hours` },
            { label: "Booking rate", value: <CountUp value={st.bookingRate} suffix="%" />, sub: `${st.booked} of ${st.byStatus.qualified + st.byStatus.borderline} qualified callers booked` },
            { label: "Asked about price", value: <CountUp value={st.askedPricePct} suffix="%" />, sub: "deflected · no number ever quoted" },
            { label: "Call cost", value: <CountUp value={st.totalCost} prefix="₹" />, sub: `${st.avgMinutes} min avg${st.costPerBooking !== null ? ` · ₹${st.costPerBooking} per booking` : ""}` },
          ].map((t, i) => (
            <div key={t.label} className="card card-hover animate-rise p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.label}</div>
              <div className="text-ombre mt-1 font-display text-3xl font-semibold tabular-nums">{t.value}</div>
              <div className="mt-1 text-xs text-muted">{t.sub}</div>
            </div>
          ))}
        </section>

        {/* Status mix: click a segment to filter */}
        <section className="card mt-5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Who called · {monthLabel(month)}</h2>
            <span className="text-xs text-muted">Click a colour to filter</span>
          </div>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-violet-50">
            {STATUSES.map((s) =>
              st.byStatus[s] ? (
                <Link key={s} href={href({ view: "all", status: s })} title={`${STATUS_STYLE[s].label}: ${st.byStatus[s]}`}
                  className={`${STATUS_STYLE[s].bar} transition-all hover:brightness-110 hover:saturate-150`} style={{ width: `${(st.byStatus[s] / Math.max(st.people, 1)) * 100}%` }} />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Link key={s} href={searchParams.status === s ? href({ status: undefined }) : href({ view: "all", status: s })}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition ${searchParams.status === s ? "bg-ink text-white" : "bg-violet-50 text-ink hover:bg-violet-100"}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                {STATUS_STYLE[s].label}
                <span className="opacity-70">{st.byStatus[s]}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <nav className="mt-8 flex gap-1 overflow-x-auto rounded-2xl border border-violet-100 bg-white/70 p-1 text-sm shadow-sm backdrop-blur">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ view: v.key, status: undefined })}
              className={`whitespace-nowrap rounded-xl px-4 py-2 font-semibold transition ${view === v.key ? "bg-ombre text-white shadow-[0_8px_20px_-8px_rgba(192,38,211,0.8)]" : "text-muted hover:bg-violet-50 hover:text-ink"}`}>
              {v.label}
              {v.key === "reengage" && warm > 0 && <span className="ml-2 rounded-full bg-orange-500 px-1.5 text-[11px] text-white">{warm}</span>}
            </Link>
          ))}
        </nav>

        {view === "all" && (
          <form className="mt-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value="all" />
            <input name="q" defaultValue={searchParams.q} placeholder="Search name, phone or area…" className="field w-64" />
            <select name="month" defaultValue={month} className="field">
              <option value="all">All time</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select name="status" defaultValue={searchParams.status ?? ""} className="field">
              <option value="">Every status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
            </select>
            <button className="btn-ombre">Apply</button>
            {(searchParams.q || searchParams.status || searchParams.month) && <Link href="/" className="px-2 text-sm font-semibold text-muted hover:text-ink">Reset</Link>}
            <span className="ml-auto text-xs text-muted">{listPeople.length} caller{listPeople.length === 1 ? "" : "s"} · click anyone for details</span>
          </form>
        )}

        <PeopleBoard view={view} people={listPeople} />
      </main>
    </>
  );
}
