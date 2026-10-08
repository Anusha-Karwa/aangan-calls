// IST helpers. India has no DST, so a fixed +05:30 offset is exact.
const IST_MS = 330 * 60_000;

export function toIst(d: Date): Date {
  return new Date(d.getTime() + IST_MS);
}

/** Outside 10:00–19:00 IST, or any time on Sunday. */
export function isAfterHours(d: Date): boolean {
  const ist = toIst(d);
  const h = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  return ist.getUTCDay() === 0 || h < 10 || h >= 19;
}

export function formatIst(iso: string | Date | null | undefined, opts: { date?: boolean; time?: boolean } = { date: true, time: true }): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const parts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };
  if (opts.date !== false) Object.assign(parts, { weekday: "short", day: "numeric", month: "short" });
  if (opts.time !== false) Object.assign(parts, { hour: "numeric", minute: "2-digit", hour12: true });
  return new Intl.DateTimeFormat("en-IN", parts).format(d) + (opts.time !== false ? " IST" : "");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso.length === 10 ? iso + "T12:00:00+05:30" : iso));
}
