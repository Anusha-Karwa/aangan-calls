"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { markContacted } from "@/app/actions";
import type { CallLite, Person } from "@/lib/people";
import { Flags, Score, ScoreRing, StatusPill } from "./ui";

// Dates arrive pre-formatted from the server (CallLite.label) to avoid hydration mismatches.
const SITE: Record<string, string> = { bare: "Bare shell", builder: "Builder finish", lived_in: "Lived-in", rented: "Rented", unknown: "Unknown" };
const DM: Record<string, string> = { self: "Caller decides", authorised: "Authorised by owner", represents: "Calling for the owners", research: "Research only", unknown: "Not confirmed" };

// ---------- count-up numbers ----------

export function CountUp({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{prefix}{n.toLocaleString("en-IN")}{suffix}</>;
}

// ---------- people board + details drawer ----------

type View = "all" | "upcoming" | "reengage";

export function PeopleBoard({ view, people }: { view: View; people: Person[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"board" | "list">("board");
  const open =(p: Person, id?: string) => { setOpenKey(p.key); setCallId(id ?? p.latest.id); };
  const person = people.find((p) => p.key === openKey) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenKey(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const now = Date.now() - 2 * 3600_000;
  const upcoming = useMemo(
    () => people.flatMap((p) => p.calls.filter((c) => c.booking_start && Date.parse(c.booking_start) >= now && c.booking_status !== "cancelled").map((c) => ({ p, c })))
      .sort((a, b) => a.c.booking_start!.localeCompare(b.c.booking_start!)),
    [people, now],
  );
  const reengage = useMemo(
    () => people.filter((p) => p.latest.status === "unqualified" && p.latest.reengage_rating === "warm" && !p.latest.reengaged_at)
      .sort((a, b) => (a.latest.reengage_date ?? "9999").localeCompare(b.latest.reengage_date ?? "9999")),
    [people],
  );

  return (
    <>
      {view === "upcoming" ? (
        upcoming.length ? (
          // Timeline: an ombré spine with a date bubble per consultation.
          <ol className="relative mt-6 space-y-4 pl-0 before:absolute before:bottom-4 before:left-[31px] before:top-4 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-violet-500 before:via-fuchsia-500 before:to-orange-400">
            {upcoming.map(({ p, c }, i) => (
              <li key={c.id} className="animate-rise relative flex items-center gap-4" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="bg-ombre relative z-10 grid h-16 w-16 shrink-0 place-items-center rounded-full text-center text-white shadow-lg ring-4 ring-white">
                  <div className="leading-none">
                    <div className="text-[9px] font-bold uppercase tracking-wider">{c.label.bMonth}</div>
                    <div className="font-display text-xl font-semibold">{c.label.bDay}</div>
                  </div>
                </div>
                <button onClick={() => open(p, c.id)} className="card card-hover flex flex-1 gap-4 p-4 text-left">
                  <div className="w-16 shrink-0 text-center">
                    <div className="font-display text-lg font-semibold text-ink">{c.label.bTime}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">IST</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{p.name ?? p.phone}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <div className="mt-1 text-sm text-muted">{[c.property, c.location_area, c.carpet_sqft ? `${c.carpet_sqft} sq ft` : null].filter(Boolean).join(" · ")}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">{c.booking_type === "site_visit" ? "🏠 Site visit" : c.booking_type === "studio" ? "🏛 Studio" : "Visit type ?"}</span>
                      <Flags flags={c.flags} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        ) : <Empty text="No upcoming consultations yet. Calls the agent books land here, soonest first." />
      ) : view === "reengage" ? (
        reengage.length ? (
          <ul className="mt-4 space-y-2">
            {reengage.map((p, i) => {
              const due = p.latest.reengage_date && p.latest.reengage_date <= new Date().toISOString().slice(0, 10);
              return (
                <li key={p.key} className={`card card-hover animate-rise flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${due ? "ombre-border" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="w-28">
                    <span className={`block text-sm font-bold ${due ? "text-ombre" : "text-ink"}`}>{p.latest.label.reengage}</span>
                    {due && <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600">Due now</span>}
                  </span>
                  <button onClick={() => open(p)} className="min-w-0 flex-1 text-left">
                    <div className="font-semibold text-ink">{p.name ?? p.phone ?? "Unknown caller"}</div>
                    <div className="truncate text-sm text-muted">{p.latest.decline_reason}</div>
                  </button>
                  {p.phone && <a href={`tel:${p.phone}`} className="text-sm font-semibold text-fuchsia-700 hover:underline">{p.phone}</a>}
                  <form action={markContacted}>
                    <input type="hidden" name="id" value={p.latest.id} />
                    <button className="btn-soft">Mark contacted</button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : <Empty text="No warm leads waiting. Callers with a short timeline or who were 'just exploring' land here." />
      ) : people.length === 0 ? (
        <Empty text="No callers match. Test calls appear here a few seconds after they end." />
      ) : (
        <>
          <div className="mt-4 flex items-center justify-end">
            <div className="inline-flex rounded-full border border-violet-100 bg-white p-0.5 text-xs font-semibold shadow-sm" role="tablist" aria-label="Layout">
              {(["board", "list"] as const).map((l) => (
                <button key={l} role="tab" aria-selected={layout === l} onClick={() => setLayout(l)}
                  className={`rounded-full px-3 py-1 transition ${layout === l ? "bg-ombre text-white shadow" : "text-muted hover:text-ink"}`}>
                  {l === "board" ? "▦ Board" : "☰ List"}
                </button>
              ))}
            </div>
          </div>
          {layout === "board" ? <MoodBoard people={people} onOpen={open} /> : (<>
          {/* Desktop table */}
          <div className="card mt-4 hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-violet-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Caller</th>
                  <th className="px-4 py-3">Last call</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Consultation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => {
                  const c = p.latest;
                  const booking = p.calls.find((x) => x.booking_start) ?? null;
                  return (
                    <tr key={p.key} onClick={() => open(p)}
                      className="animate-rise group cursor-pointer border-t border-violet-50 transition hover:bg-gradient-to-r hover:from-violet-50 hover:via-fuchsia-50/60 hover:to-orange-50"
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name ?? p.phone ?? "?"} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-semibold text-ink">
                              {p.name ?? p.phone ?? "Unknown caller"}
                              {p.calls.length > 1 && <span className="rounded-full bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">{p.calls.length} calls</span>}
                            </div>
                            <div className="mt-0.5"><Flags flags={c.flags} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{p.calls[0].label.at}</td>
                      <td className="px-4 py-3 text-ink">{c.location_area ?? <span className="text-slate-300">–</span>}</td>
                      <td className="px-4 py-3 text-right text-base"><Score score={c.score} /></td>
                      <td className="px-4 py-3"><StatusPill status={c.status} overridden={c.overridden} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink">{booking ? booking.label.booking : <span className="text-slate-300">–</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-bold text-fuchsia-600 opacity-0 transition group-hover:opacity-100">Details →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="mt-4 space-y-2 md:hidden">
            {people.map((p) => (
              <li key={p.key}>
                <button onClick={() => open(p)} className="card flex w-full items-center gap-3 p-4 text-left">
                  <Avatar name={p.name ?? p.phone ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{p.name ?? p.phone ?? "Unknown caller"}</span>
                      <StatusPill status={p.latest.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{p.calls[0].label.at} · {p.latest.location_area ?? "area ?"}{p.calls.length > 1 ? ` · ${p.calls.length} calls` : ""}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          </>)}
        </>
      )}

      {person && <Drawer person={person} callId={callId ?? person.latest.id} onPick={setCallId} onClose={() => setOpenKey(null)} />}
    </>
  );
}

// Mood board: callers pinned like a designer's reference board (masonry columns).
const SWATCH: Record<string, string> = {
  qualified: "bg-ombre",
  borderline: "bg-gradient-to-r from-amber-300 to-orange-400",
  escalated: "bg-gradient-to-r from-rose-400 to-rose-600",
  unqualified: "bg-gradient-to-r from-slate-200 to-slate-300",
  incomplete: "bg-gradient-to-r from-zinc-200 to-zinc-300",
};

function MoodBoard({ people, onOpen }: { people: Person[]; onOpen: (p: Person) => void }) {
  return (
    <div className="mt-3 columns-1 gap-4 sm:columns-2 lg:columns-3">
      {people.map((p, i) => {
        const c = p.latest;
        const booked = p.calls.find((x) => x.booking_start);
        return (
          <article key={p.key} className="animate-rise group mb-4 break-inside-avoid" style={{ animationDelay: `${Math.min(i, 9) * 50}ms` }}>
            <div className="card card-hover relative overflow-hidden">
              {/* pin */}
              <span className="absolute left-1/2 top-1.5 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-fuchsia-400" aria-hidden />
              <div className={`h-14 ${SWATCH[c.status ?? "incomplete"]} relative`}>
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:14px_14px]" />
              </div>
              <button onClick={() => onOpen(p)} className="block w-full p-4 pt-0 text-left">
                <div className="relative z-10 -mt-6 flex items-end justify-between">
                  <span className="rounded-full ring-4 ring-white"><Avatar name={p.name ?? p.phone ?? "?"} /></span>
                  <MiniRing score={c.score} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <h3 className="truncate font-display text-lg font-semibold text-ink">{p.name ?? p.phone ?? "Unknown caller"}</h3>
                  {p.calls.length > 1 && <span className="shrink-0 rounded-full bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">{p.calls.length} calls</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted">{p.calls[0].label.atShort}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <StatusPill status={c.status} overridden={c.overridden} />
                  {c.location_area && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800">📍 {c.location_area}</span>}
                  {c.property && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-800">🏠 {c.property}</span>}
                </div>
                {c.summary && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink/70">{c.summary.split("\n")[0]}</p>}
                {booked && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                    📅 {booked.label.booking}
                  </div>
                )}
                {c.flags.length > 0 && <div className="mt-2"><Flags flags={c.flags} /></div>}
              </button>
              <div className="flex border-t border-violet-50 text-xs font-semibold opacity-80 transition group-hover:opacity-100">
                {p.phone ? <a href={`tel:${p.phone}`} className="flex-1 py-2.5 text-center text-violet-700 hover:bg-violet-50">📞 Call</a> : <span className="flex-1 py-2.5 text-center text-slate-300">No number</span>}
                <button onClick={() => onOpen(p)} className="flex-1 border-l border-violet-50 py-2.5 text-fuchsia-700 hover:bg-fuchsia-50">Details →</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MiniRing({ score }: { score: number | null }) {
  const pct = score ?? 0;
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full" title={score === null ? "Not scored" : `Score ${score}/100`}
      style={{ background: `conic-gradient(#7c3aed 0%, #d946ef ${pct * 0.45}%, #f97316 ${pct}%, #efe9fb ${pct}% 100%)` }}>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[11px] font-bold text-ink">{score ?? "–"}</span>
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "☎";
  return <span className="bg-ombre grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white shadow-sm">{initials}</span>;
}

function Drawer({ person, callId, onPick, onClose }: { person: Person; callId: string; onPick: (id: string) => void; onClose: () => void }) {
  const c: CallLite = person.calls.find((x) => x.id === callId) ?? person.latest;
  const rows: [string, React.ReactNode, string][] = [
    ["Area", <>{c.location_area ?? "–"}{c.in_service_area === false && <span className="text-rose-600"> (outside area)</span>}</>, "📍"],
    ["Property", [c.property, c.carpet_sqft ? `${c.carpet_sqft} sq ft` : null, c.site_state ? SITE[c.site_state] : null].filter(Boolean).join(" · ") || "–", "🏠"],
    ["Scope", c.scope ?? "–", "✏️"],
    ["Wants it done by", <>{c.timeline_text ?? "–"}{c.target_date && <span className="text-muted"> ({c.label.target})</span>}</>, "⏳"],
    ["Budget", <>{c.budget_volunteered ?? "Not discussed"}{c.asked_price && <span className="ml-1.5 rounded bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-700">asked price</span>}</>, "₹"],
    ["Decision-maker", c.decision_maker ? DM[c.decision_maker] ?? c.decision_maker : "Not confirmed", "🤝"],
    ["Source", c.source ?? "–", "✨"],
  ];
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Details for ${person.name ?? person.phone}`}>
      <div className="animate-fade-in absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="animate-slide-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="bg-ombre relative px-6 pb-6 pt-5 text-white">
          <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/20 text-lg hover:bg-white/30" aria-label="Close">×</button>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">Caller</div>
          <h2 className="mt-1 font-display text-3xl font-semibold">{person.name ?? person.phone ?? "Unknown caller"}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {person.phone && <a href={`tel:${person.phone}`} className="rounded-full bg-white/20 px-3 py-1 font-semibold hover:bg-white/30">📞 {person.phone}</a>}
            {person.email && <a href={`mailto:${person.email}`} className="rounded-full bg-white/20 px-3 py-1 font-semibold hover:bg-white/30">✉️ {person.email}</a>}
          </div>
        </div>

        <div className="space-y-5 p-6">
          {person.calls.length > 1 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{person.calls.length} calls from this person</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {person.calls.map((x) => (
                  <button key={x.id} onClick={() => onPick(x.id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${x.id === c.id ? "bg-ombre text-white shadow" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}>
                    {x.label.atShort}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <ScoreRing score={c.score} size={88} />
            <div className="space-y-1.5">
              <StatusPill status={c.status} overridden={c.overridden} />
              <div className="text-xs text-muted">Called {c.label.at}{c.duration_sec ? ` · ${Math.floor(c.duration_sec / 60)}m ${c.duration_sec % 60}s` : ""}</div>
              <Flags flags={c.flags} />
            </div>
          </div>

          <div className={`rounded-2xl p-4 ${c.booking_start ? "bg-ombre text-white" : "border border-orange-200 bg-orange-50 text-orange-800"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">Consultation</div>
            <div className="mt-0.5 font-semibold">{c.booking_start ? `${c.label.booking} · ${c.booking_type === "site_visit" ? "Site visit" : c.booking_type === "studio" ? "Studio visit" : "type ?"}` : "Not booked: call back"}</div>
          </div>

          {c.decline_reason && <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{c.decline_reason}{c.reengage_rating && <> · re-engage <strong>{c.reengage_rating}</strong>{c.reengage_date && ` on ${c.label.reengage}`}</>}</div>}

          <dl className="space-y-2">
            {rows.map(([k, v, icon]) => (
              <div key={k} className="flex gap-3 rounded-xl border border-violet-50 bg-violet-50/30 p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm shadow-sm">{icon}</span>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{k}</dt>
                  <dd className="text-sm text-ink">{v}</dd>
                </div>
              </div>
            ))}
          </dl>

          {c.summary && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Summary</div>
              <ul className="mt-2 space-y-1.5 text-sm text-ink">
                {c.summary.split("\n").filter(Boolean).map((l, i) => (
                  <li key={i} className="flex gap-2"><span className="bg-ombre mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />{l.replace(/^[-•]\s*/, "")}</li>
                ))}
              </ul>
            </div>
          )}

          <Link href={`/calls/${c.id}`} className="btn-ombre block w-full py-3 text-center">Open full details: recording, transcript, actions →</Link>
        </div>
      </aside>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card mt-4 p-10 text-center">
      <div className="bg-ombre animate-drift mx-auto mb-3 h-10 w-10 rounded-full" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
