import Link from "next/link";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/env";
import { monthKey, monthStats } from "@/lib/stats";
import { formatDate, formatIst, toIst } from "@/lib/time";
import { effectiveStatus, type CallRow } from "@/lib/types";
import { Flags, Score, StatusPill, Tile } from "@/components/ui";
import { logout, markContacted } from "./actions";

export const dynamic = "force-dynamic";

type Search = { view?: string; status?: string; q?: string; from?: string; to?: string; month?: string };
const VIEWS = [
  { key: "all", label: "All calls" },
  { key: "upcoming", label: "Upcoming consultations" },
  { key: "reengage", label: "Re-engage" },
];

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

export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const view = searchParams.view ?? "all";
  const rows = await db().listCalls({ limit: 1000 });
  const month = searchParams.month ?? monthKey(new Date());
  const st = monthStats(rows, month);
  const mock = Object.entries(integrationStatus()).filter(([, v]) => v === "mock").map(([k]) => k);

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/?${p}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Aangan Studio</div>
          <h1 className="text-2xl font-semibold">Calls</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <form className="flex items-center gap-2">
            <label className="text-muted" htmlFor="month">Month</label>
            <input id="month" type="month" name="month" defaultValue={month} className="rounded-lg border border-line bg-white px-2 py-1" />
            <button className="rounded-lg border border-line bg-white px-2 py-1">Go</button>
          </form>
          {process.env.DASHBOARD_PASSWORD && (
            <form action={logout}>
              <button className="text-muted hover:text-ink">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {mock.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {mock.length === 1 && mock[0] === "vaaniWebhook"
            ? "Vaani webhook secret not set yet: incoming calls are accepted without signature checks. Add VAANI_WEBHOOK_SECRET in Vercel (SETUP.md §3, V6)."
            : `Not connected yet: ${mock.join(", ")}. These integrations log instead of sending. See SETUP.md.`}
        </p>
      )}

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Calls this month" value={st.calls} sub={`${st.afterHoursPct}% after hours`} />
        <Tile
          label="Qualified / borderline"
          value={`${st.byStatus.qualified} / ${st.byStatus.borderline}`}
          sub={`${st.byStatus.unqualified} unqualified · ${st.byStatus.escalated} escalated`}
        />
        <Tile label="Consultations booked" value={st.booked} sub={`${st.bookingRate}% of qualified + borderline`} />
        <Tile label="Cost" value={`₹${st.totalCost.toLocaleString("en-IN")}`} sub={`${st.avgMinutes} min avg · ${st.costPerBooking !== null ? `₹${st.costPerBooking}/booking` : "no bookings"}`} />
        <Tile label="Asked about price" value={`${st.askedPricePct}%`} sub="of conversations" />
      </section>

      <nav className="mt-6 flex gap-1 border-b border-line text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href({ view: v.key })}
            className={`-mb-px border-b-2 px-3 py-2 ${view === v.key ? "border-brand-600 font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "upcoming" ? <Upcoming rows={rows} /> : view === "reengage" ? <Reengage rows={rows} /> : <AllCalls rows={filterRows(rows, searchParams)} s={searchParams} />}
    </main>
  );
}

function AllCalls({ rows, s }: { rows: CallRow[]; s: Search }) {
  return (
    <>
      <form className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="view" value="all" />
        <input name="q" defaultValue={s.q} placeholder="Search name or phone" className="w-48 rounded-lg border border-line bg-white px-3 py-1.5" />
        <select name="status" defaultValue={s.status ?? ""} className="rounded-lg border border-line bg-white px-2 py-1.5">
          <option value="">All statuses</option>
          {["qualified", "borderline", "unqualified", "escalated", "incomplete"].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-muted">From <input type="date" name="from" defaultValue={s.from} className="rounded-lg border border-line bg-white px-2 py-1" /></label>
        <label className="flex items-center gap-1 text-muted">To <input type="date" name="to" defaultValue={s.to} className="rounded-lg border border-line bg-white px-2 py-1" /></label>
        <button className="rounded-lg bg-ink px-3 py-1.5 text-white">Filter</button>
        <Link href="/" className="px-2 py-1.5 text-muted">Clear</Link>
      </form>

      {rows.length === 0 ? (
        <Empty text="No calls match. Test calls appear here a few seconds after they end." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-line bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Area</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-paper">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      <Link href={`/calls/${r.id}`} className="block">{formatIst(r.started_at ?? r.created_at)}</Link>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/calls/${r.id}`} className="block">{r.caller_name ?? r.phone ?? "Unknown"}</Link>
                    </td>
                    <td className="px-3 py-2">{r.location_area ?? <span className="text-muted">–</span>}</td>
                    <td className="px-3 py-2 text-right"><Score score={r.score} /></td>
                    <td className="px-3 py-2"><StatusPill status={effectiveStatus(r)} overridden={Boolean(r.status_override)} /></td>
                    <td className="whitespace-nowrap px-3 py-2">{r.booking_start ? formatIst(r.booking_start) : <span className="text-muted">–</span>}</td>
                    <td className="px-3 py-2"><Flags flags={r.flags} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="mt-4 space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/calls/${r.id}`} className="block rounded-xl border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.caller_name ?? r.phone ?? "Unknown"}</span>
                    <StatusPill status={effectiveStatus(r)} overridden={Boolean(r.status_override)} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {formatIst(r.started_at ?? r.created_at)} · {r.location_area ?? "area ?"} · score {r.score ?? "–"}
                  </div>
                  {r.booking_start && <div className="mt-1 text-xs">📅 {formatIst(r.booking_start)}</div>}
                  <div className="mt-1"><Flags flags={r.flags} /></div>
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
  if (!list.length) return <Empty text="No upcoming consultations." />;
  return (
    <ul className="mt-4 space-y-2">
      {list.map((r) => (
        <li key={r.id}>
          <Link href={`/calls/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-white p-3 hover:border-brand-300">
            <span className="w-44 font-semibold">{formatIst(r.booking_start)}</span>
            <span className="font-medium">{r.caller_name ?? r.phone}</span>
            <span className="text-sm text-muted">
              {[r.property, r.location_area, r.carpet_sqft ? `${r.carpet_sqft} sq ft` : null, r.booking_type === "site_visit" ? "Site visit" : r.booking_type === "studio" ? "Studio" : null].filter(Boolean).join(" · ")}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <Flags flags={r.flags} />
              <StatusPill status={effectiveStatus(r)} />
            </span>
          </Link>
        </li>
      ))}
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
      {list.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-white p-3">
          <span className={`w-28 text-sm font-semibold ${r.reengage_date && r.reengage_date <= today ? "text-brand-700" : ""}`}>
            {formatDate(r.reengage_date)}
            {r.reengage_date && r.reengage_date <= today && <span className="block text-xs font-normal">due</span>}
          </span>
          <Link href={`/calls/${r.id}`} className="min-w-0 flex-1">
            <div className="font-medium">{r.caller_name ?? r.phone ?? "Unknown"}</div>
            <div className="truncate text-sm text-muted">{r.decline_reason}</div>
          </Link>
          {r.phone && <a href={`tel:${r.phone}`} className="text-sm text-brand-700">{r.phone}</a>}
          <form action={markContacted}>
            <input type="hidden" name="id" value={r.id} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">Mark contacted</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-8 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{text}</p>;
}
