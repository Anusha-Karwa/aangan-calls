import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { groupPeople, type Person } from "@/lib/people";
import { inMonth, monthKey, monthStats } from "@/lib/stats";
import { formatIst, toIst } from "@/lib/time";
import type { CallStatus } from "@/lib/types";
import { STATUS_STYLE, VideoBackdrop } from "@/components/ui";
import { CountUp, HeroPins, PeopleBoard, type Pin } from "@/components/interactive";
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
  const next = everyone
    .flatMap((p) => p.calls.filter((c) => c.booking_start && Date.parse(c.booking_start) > Date.now() && c.booking_status !== "cancelled").map((c) => ({ p, c })))
    .sort((a, b) => a.c.booking_start!.localeCompare(b.c.booking_start!))[0];
  const warm = everyone.filter((p) => p.latest.status === "unqualified" && p.latest.reengage_rating === "warm" && !p.latest.reengaged_at).length;
  const months = Array.from(new Set([monthKey(new Date()), ...all.map((r) => monthKey(r.started_at ?? r.created_at))])).sort().reverse();

  const pins: Pin[] = [
    { x: 66, y: 22, title: "Next consultation", value: next ? `${next.p.name ?? next.p.phone} · ${formatIst(next.c.booking_start)}` : "None booked yet", href: "/?view=upcoming" },
    { x: 84, y: 50, title: `Qualified · ${monthLabel(month)}`, value: `${st.byStatus.qualified} of ${st.people} callers`, href: `/?month=${month}&status=qualified` },
    { x: 70, y: 70, title: "Warm leads", value: warm ? `${warm} to re-engage` : "All caught up", href: "/?view=reengage" },
    { x: 90, y: 20, title: "Asked about price", value: `${st.askedPricePct}% · never quoted`, href: `/?month=${month}` },
  ];

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/?${p}`;
  };

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 pb-20">
        {/* Hero: video + Pinterest-style pins */}
        <section className="relative mt-5 overflow-hidden rounded-[28px] shadow-[0_30px_60px_-30px_rgba(91,33,182,0.45)]">
          <VideoBackdrop src={env("HERO_VIDEO_URL")} />
          <HeroPins pins={pins} />
          <div className="relative z-[5] flex min-h-[340px] flex-col justify-end p-6 pb-24 sm:p-10 sm:pb-24">
            <div className="max-w-xl animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700 shadow-sm backdrop-blur">
                <span className="bg-ombre h-1.5 w-1.5 rounded-full" />{monthLabel(month)}
              </span>
              <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-white drop-shadow-sm sm:text-6xl">
                {greeting()}, <span className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-orange-200 bg-clip-text text-transparent">designer.</span>
              </h1>
              <p className="mt-2 text-sm font-medium text-white/90 sm:text-base">
                {st.people} caller{st.people === 1 ? "" : "s"} this period · {st.booked} consultation{st.booked === 1 ? "" : "s"} booked
              </p>
            </div>
          </div>
        </section>

        {/* KPI tiles */}
        <section className="relative z-20 -mt-14 grid grid-cols-2 gap-3 px-2 sm:px-6 lg:grid-cols-5">
          {[
            { label: "Callers", value: <CountUp value={st.people} />, sub: `${st.calls} calls · ${st.afterHoursPct}% after hours` },
            { label: "Qualified", value: <CountUp value={st.byStatus.qualified} />, sub: `+${st.byStatus.borderline} borderline · ${st.byStatus.escalated} escalated` },
            { label: "Booked", value: <CountUp value={st.booked} />, sub: `${st.bookingRate}% booking rate` },
            { label: "Call cost", value: <CountUp value={st.totalCost} prefix="₹" />, sub: `${st.avgMinutes} min avg${st.costPerBooking !== null ? ` · ₹${st.costPerBooking}/booking` : ""}` },
            { label: "Asked price", value: <CountUp value={st.askedPricePct} suffix="%" />, sub: "no number ever quoted" },
          ].map((t, i) => (
            <div key={t.label} className="card card-hover animate-rise p-4" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.label}</div>
              <div className="text-ombre mt-1 font-display text-4xl font-semibold tabular-nums">{t.value}</div>
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
