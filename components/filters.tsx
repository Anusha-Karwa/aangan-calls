"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Caller filters that update the board in place: no full page reload, no jump to the top.
// Month / status apply on change; search applies as you type (debounced) or on Enter / Apply.
export function CallerFilters({ q, month, status, months }: {
  q: string;
  month: string;
  status: string;
  months: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(q);
  const [m, setM] = useState(month);
  const [s, setS] = useState(status); // set by the status chips (links) via the URL
  const first = useRef(true);

  // Follow changes made elsewhere (status chips, tabs) without touching what is being typed.
  useEffect(() => setS(status), [status]);
  useEffect(() => setM(month), [month]);

  const apply = (next: { q?: string; month?: string; status?: string } = {}) => {
    const p = new URLSearchParams({ view: "all" });
    const qq = (next.q ?? text).trim();
    const mm = next.month ?? m;
    const ss = next.status ?? s;
    if (qq) p.set("q", qq);
    if (mm) p.set("month", mm);
    if (ss) p.set("status", ss);
    start(() => router.push(`/?${p}`, { scroll: false }));
  };

  // Search as you type (debounced).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => apply({ q: text }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const reset = () => {
    setText(""); setS("");
    start(() => router.push("/", { scroll: false }));
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">🔍</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, phone or area…" className="field w-64 pl-8" aria-label="Search callers" />
      </div>
      <select value={m} onChange={(e) => { setM(e.target.value); apply({ month: e.target.value }); }} className="field" aria-label="Month">
        <option value="all">All time</option>
        {months.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
      <button className="btn-ombre min-w-[92px]" disabled={pending}>{pending ? "Applying…" : "Apply"}</button>
      {(text || s || q) && <button type="button" onClick={reset} className="px-2 text-sm font-semibold text-muted hover:text-ink">Reset</button>}
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300 border-t-transparent" aria-label="Updating" />}
    </form>
  );
}
