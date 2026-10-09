import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { env } from "./env";
import type { CallEvent, CallRow } from "./types";

// Two stores behind one interface:
//  - Postgres (Neon/Supabase) when DATABASE_URL is set;
//  - a JSON file in .data/ for local dev without a database (mock mode).

export interface Store {
  upsertCall(data: Partial<CallRow> & { vaani_call_id: string }): Promise<CallRow>;
  updateCall(id: string, patch: Partial<CallRow>): Promise<CallRow | null>;
  getCall(id: string): Promise<CallRow | null>;
  getCallByVaaniId(vaaniId: string): Promise<CallRow | null>;
  getCallByBookingUid(uid: string): Promise<CallRow | null>;
  listCalls(opts?: { limit?: number }): Promise<CallRow[]>;
  addEvent(callId: string, type: string, detail?: unknown): Promise<void>;
  listEvents(callId: string): Promise<CallEvent[]>;
}

const JSON_COLS = new Set(["extraction", "raw"]);

function emptyRow(): CallRow {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), vaani_call_id: null, channel: "phone", started_at: null, duration_sec: null,
    after_hours: null, caller_name: null, phone: null, email: null, call_type: null, project_type: null,
    property: null, scope: null, scope_category: null, location_area: null, in_service_area: null,
    carpet_sqft: null, site_state: null, timeline_text: null, target_date: null, weeks_to_target: null,
    decision_maker: null, budget_volunteered: null, budget_inr: null, asked_price: null, source: null,
    language: null, score: null, gate_fail: null, status: null, decline_reason: null, reengage_rating: null,
    reengage_date: null, reengaged_at: null, flags: [], email_id: null, booking_start: null, booking_type: null,
    calcom_booking_uid: null, booking_status: null, summary: null, transcript: null, transcript_url: null,
    recording_url: null, notified_at: null, hubspot_contact_id: null, hubspot_deal_id: null, cost_inr: null,
    status_override: null, override_by: null, extraction: null, raw: null, created_at: now, updated_at: now,
  };
}

// ---------- Postgres ----------

let _sql: postgres.Sql | null = null;
function sql(): postgres.Sql {
  if (!_sql) {
    const url = env("DATABASE_URL");
    _sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 3, idle_timeout: 20 });
  }
  return _sql;
}

function normalise(row: Record<string, unknown>): CallRow {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = k === "target_date" || k === "reengage_date" ? v.toISOString().slice(0, 10) : v.toISOString();
    else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && ["weeks_to_target", "budget_inr", "cost_inr"].includes(k)) out[k] = Number(v);
  }
  out.flags = (out.flags as string[] | null) ?? [];
  return out as unknown as CallRow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDb(patch: Partial<CallRow>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || k === "id" || k === "created_at") continue;
    out[k] = JSON_COLS.has(k) && v !== null ? sql().json(v as never) : v;
  }
  return out;
}

const pgStore: Store = {
  async upsertCall(data) {
    const row = toDb({ ...data, updated_at: new Date().toISOString() });
    const cols = Object.keys(row);
    const [r] = await sql()`
      insert into calls ${sql()(row, cols)}
      on conflict (vaani_call_id) do update set ${sql()(row, cols.filter((c) => c !== "vaani_call_id"))}
      returning *`;
    return normalise(r);
  },
  async updateCall(id, patch) {
    const row = toDb({ ...patch, updated_at: new Date().toISOString() });
    const [r] = await sql()`update calls set ${sql()(row, Object.keys(row))} where id = ${id} returning *`;
    return r ? normalise(r) : null;
  },
  async getCall(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await sql()`select * from calls where id = ${id}`;
    return r ? normalise(r) : null;
  },
  async getCallByVaaniId(vaaniId) {
    const [r] = await sql()`select * from calls where vaani_call_id = ${vaaniId}`;
    return r ? normalise(r) : null;
  },
  async getCallByBookingUid(uid) {
    const [r] = await sql()`select * from calls where calcom_booking_uid = ${uid}`;
    return r ? normalise(r) : null;
  },
  async listCalls({ limit = 500 } = {}) {
    const rows = await sql()`select * from calls order by coalesce(started_at, created_at) desc limit ${limit}`;
    return rows.map(normalise);
  },
  async addEvent(callId, type, detail) {
    await sql()`insert into call_events (call_id, type, detail) values (${callId}, ${type}, ${sql().json((detail ?? null) as never)})`;
  },
  async listEvents(callId) {
    const rows = await sql()`select * from call_events where call_id = ${callId} order by at desc`;
    return rows.map((r) => ({ ...r, at: (r.at as Date).toISOString() }) as CallEvent);
  },
};

// ---------- Local JSON file (mock mode) ----------

const FILE = path.join(process.cwd(), ".data", "store.json");
type FileData = { calls: CallRow[]; events: CallEvent[] };

function load(): FileData {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { calls: [], events: [] };
  }
}
function save(d: FileData) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}
function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const fileStore: Store = {
  async upsertCall(data) {
    const d = load();
    const i = d.calls.findIndex((c) => c.vaani_call_id === data.vaani_call_id);
    const base = i >= 0 ? d.calls[i] : emptyRow();
    const row = { ...base, ...clean(data), id: base.id, updated_at: new Date().toISOString() } as CallRow;
    if (i >= 0) d.calls[i] = row;
    else d.calls.push(row);
    save(d);
    return row;
  },
  async updateCall(id, patch) {
    const d = load();
    const i = d.calls.findIndex((c) => c.id === id);
    if (i < 0) return null;
    d.calls[i] = { ...d.calls[i], ...clean(patch), id, updated_at: new Date().toISOString() };
    save(d);
    return d.calls[i];
  },
  async getCall(id) {
    return load().calls.find((c) => c.id === id) ?? null;
  },
  async getCallByVaaniId(vaaniId) {
    return load().calls.find((c) => c.vaani_call_id === vaaniId) ?? null;
  },
  async getCallByBookingUid(uid) {
    return load().calls.find((c) => c.calcom_booking_uid === uid) ?? null;
  },
  async listCalls({ limit = 500 } = {}) {
    return load()
      .calls.sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))
      .slice(0, limit);
  },
  async addEvent(callId, type, detail) {
    const d = load();
    d.events.push({ id: randomUUID(), call_id: callId, at: new Date().toISOString(), type, detail: detail ?? null });
    save(d);
  },
  async listEvents(callId) {
    return load()
      .events.filter((e) => e.call_id === callId)
      .sort((a, b) => b.at.localeCompare(a.at));
  },
};

export function db(): Store {
  return env("DATABASE_URL") ? pgStore : fileStore;
}

/** Log to call_events without ever throwing: the audit log must not break the pipeline. */
export async function logEvent(callId: string, type: string, detail?: unknown) {
  try {
    await db().addEvent(callId, type, detail);
  } catch (e) {
    console.error("call_events write failed", type, e);
  }
}
