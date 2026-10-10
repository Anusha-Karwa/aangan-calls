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
import { DailyBars } from "@/components/insights";
import { CallerFilters } from "@/components/filters";
import { TopNav } from "@/components/nav";

export const dynamic = "force-dynamic";

type Search = { view?: string; status?: string; q?: string; month?: string };
const VIEWS = [
  { key: "all", label: "All callers" },
  { key: "upcoming", label: "Upcoming consultations" },
  { key: "reengage", label: "Re-engage" },
] as const;
const STATUSES: CallStatus[] = ["qualified", "borderline", "unqualified", "escalated", "incomplete"];

const STATUS_ICON: Record<CallStatus, string> = { qualified: "✓", borderline: "◐", unqualified: "✕", escalated: "!", incomplete: "…" };

function SectionTitle({ n, title, aside }: { n: string; title: string; aside?: string }) {
  return (
    <div className="mb-3 mt-10 flex flex-wrap items-end gap-x-4 gap-y-1">
      <span className="text-ombre font-display text-sm font-semibold">{n}</span>
      <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
      <span className="mb-1.5 hidden h-px flex-1 bg-gradient-to-r from-violet-200 via-fuchsia-200 to-transparent sm:block" />
      <span className="mb-1 flex items-center gap-1" aria-hidden>
        {["bg-violet-500", "bg-fuchsia-500", "bg-rose-400", "bg-orange-400"].map((c) => <span key={c} className={`h-2.5 w-2.5 rounded-full ${c} ring-2 ring-white`} />)}
      </span>
      {aside && <span className="w-full text-xs text-muted sm:w-auto">{aside}</span>}
    </div>
  );
}

function Meter({ label, pct, note }: { label: string; pct: number; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
        <span className="text-ombre font-display text-2xl font-semibold tabular-nums"><CountUp value={pct} suffix="%" /></span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-violet-50" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="bg-ombre h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, pct ? 4 : 0)}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted">{note}</div>
    </div>
  );
}

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
  const thisMonth = monthKey(new Date());
  const latestWithCalls = all.length ? monthKey(all[0].started_at ?? all[0].created_at) : thisMonth;
  const month = searchParams.month ?? (all.some((r) => monthKey(r.started_at ?? r.created_at) === thisMonth) ? thisMonth : latestWithCalls);
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
  const daily = calendar.map((d) => ({ label: `${d.day} ${new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(cy, cm - 1, 1)))}`, calls: d.pins.filter((x) => x.kind === "call").length, booked: d.pins.filter((x) => x.kind === "booking").length }));
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
                <Link href="/?view=upcoming#callers" className="btn-ombre px-5 py-2.5">📅 Upcoming consultations</Link>
                <Link href="/?view=reengage#callers" className="btn-soft px-5 py-2.5">↻ Re-engage{warm ? ` · ${warm}` : ""}</Link>
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

        {/* 01 · At a glance: one flowing strip, not four boxes */}
        <SectionTitle n="01" title="The month at a glance" aside={monthLabel(month)} />
        <section className="card animate-rise relative overflow-hidden p-0">
          <div className="bg-ombre absolute inset-x-0 top-0 h-1" />
          <div className="grid divide-y divide-violet-100 md:grid-cols-[1.5fr_1fr] md:divide-x md:divide-y-0">
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Calls per day</span>
                <span className="text-xs text-muted">{st.afterHoursPct}% after hours</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-ombre font-display text-4xl font-semibold tabular-nums"><CountUp value={st.calls} /></span>
                <span className="text-sm text-muted">calls · {st.people} people</span>
              </div>
              <div className="mt-3"><DailyBars days={daily} /></div>
            </div>
            <div className="space-y-5 p-5">
              <Meter label="Booking rate" pct={st.bookingRate} note={`${st.booked} of ${st.byStatus.qualified + st.byStatus.borderline} qualified callers booked on the call`} />
              <Meter label="Asked about price" pct={st.askedPricePct} note="deflected every time · no number quoted" />
            </div>
          </div>
        </section>

        {/* 02 · Who called */}
        <SectionTitle n="02" title="Who called" aside="Click a status to filter the board" />
        <section className="card animate-rise p-5">
          <div className="flex h-11 gap-[2px] overflow-hidden rounded-2xl bg-white">
            {STATUSES.filter((s) => st.byStatus[s]).map((s) => {
              const w = (st.byStatus[s] / Math.max(st.people, 1)) * 100;
              return (
                <Link key={s} scroll={false} href={href({ view: "all", status: s })} title={`${STATUS_STYLE[s].label}: ${st.byStatus[s]}`}
                  className={`${s === "qualified" ? "bg-ombre" : STATUS_STYLE[s].bar} flex items-center justify-center gap-1.5 px-2 text-xs font-bold text-white transition hover:brightness-110 ${s === "unqualified" || s === "incomplete" ? "!text-ink/70" : ""}`}
                  style={{ width: `${w}%` }}>
                  {w >= 14 && <><span aria-hidden>{STATUS_ICON[s]}</span>{st.byStatus[s]} {STATUS_STYLE[s].label}</>}
                </Link>
              );
            })}
            {st.people === 0 && <div className="flex flex-1 items-center justify-center rounded-2xl bg-violet-50 text-xs font-semibold text-muted">No calls in {monthLabel(month)} yet</div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = searchParams.status === s;
              return (
                <Link key={s} scroll={false} href={on ? href({ status: undefined }) : href({ view: "all", status: s })}
                  className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-transparent bg-ink text-white" : "border-violet-100 bg-white text-ink hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-sm"}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] text-white ${s === "qualified" ? "bg-ombre" : STATUS_STYLE[s].dot}`} aria-hidden>{STATUS_ICON[s]}</span>
                  {STATUS_STYLE[s].label}
                  <span className={on ? "text-white/70" : "text-muted"}>{st.byStatus[s]}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 03 · Callers */}
        <div id="callers" className="scroll-mt-20" />
        <SectionTitle n="03" title="Callers" aside={`${listPeople.length} ${view === "all" ? `in ${monthLabel(month)}` : "people"} · click anyone for details`} />
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-violet-100 bg-white/70 p-1 text-sm shadow-sm backdrop-blur">
          {VIEWS.map((v) => (
            <Link key={v.key} scroll={false} href={href({ view: v.key, status: undefined })}
              className={`whitespace-nowrap rounded-xl px-4 py-2 font-semibold transition ${view === v.key ? "bg-ombre text-white shadow-[0_8px_20px_-8px_rgba(192,38,211,0.8)]" : "text-muted hover:bg-violet-50 hover:text-ink"}`}>
              {v.label}
              {v.key === "reengage" && warm > 0 && <span className="ml-2 rounded-full bg-orange-500 px-1.5 text-[11px] text-white">{warm}</span>}
            </Link>
          ))}
        </nav>

        {view === "all" && (
          <CallerFilters
            q={searchParams.q ?? ""}
            month={month}
            status={searchParams.status ?? ""}
            months={months.map((m) => ({ value: m, label: monthLabel(m) }))}
            statuses={STATUSES.map((s) => ({ value: s, label: STATUS_STYLE[s].label }))}
          />
        )}

        <PeopleBoard view={view} people={listPeople} />
      </main>
    </>
  );
}
