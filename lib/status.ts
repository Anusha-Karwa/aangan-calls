import "server-only";
import postgres from "postgres";
import { env } from "./env";
import { geminiModel } from "./gemini";

// Live connection checks: each one makes a real, read-only call to the service.
// Cached for 60 s per server instance so the dashboard/health endpoint can't hammer the APIs.

export type ConnState = "connected" | "error" | "not_configured" | "waiting";
export interface Connection {
  key: string;
  label: string;
  state: ConnState;
  detail: string;
}

let cache: { at: number; value: Connection[] } | null = null;

async function timed<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function check(key: string, label: string, configured: boolean, fn: () => Promise<string>): Promise<Connection> {
  if (!configured) return { key, label, state: "not_configured", detail: "Key not set" };
  try {
    return { key, label, state: "connected", detail: await timed(fn()) };
  } catch (e) {
    return { key, label, state: "error", detail: (e instanceof Error ? e.message : String(e)).slice(0, 160) };
  }
}

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function connectionStatus(force = false): Promise<Connection[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.value;

  const value = await Promise.all([
    check("neon", "Neon", Boolean(env("DATABASE_URL")), async () => {
      const sql = postgres(env("DATABASE_URL"), { ssl: "require", max: 1, idle_timeout: 2 });
      try {
        const [r] = await sql`select count(*)::int as n from calls`;
        return `${r.n} calls stored`;
      } finally {
        await sql.end({ timeout: 2 });
      }
    }),
    check("calcom", "Cal.com", Boolean(env("CALCOM_API_KEY")), async () => {
      const j = await getJson("https://api.cal.com/v2/event-types/" + env("CALCOM_EVENT_TYPE_ID"), {
        Authorization: `Bearer ${env("CALCOM_API_KEY")}`,
        "cal-api-version": "2024-06-14",
      });
      return `Event “${j.data?.title ?? env("CALCOM_EVENT_TYPE_ID")}”`;
    }),
    check("hubspot", "HubSpot", Boolean(env("HUBSPOT_TOKEN")), async () => {
      const j = await getJson("https://api.hubapi.com/crm/v3/pipelines/deals", { Authorization: `Bearer ${env("HUBSPOT_TOKEN")}` });
      const p = (j.results ?? []).find((x: { id: string }) => x.id === env("HUBSPOT_PIPELINE", "default"));
      return p ? `Pipeline “${p.label}”` : "Token OK";
    }),
    check("resend", "Resend", Boolean(env("RESEND_API_KEY")), async () => {
      // Sending-only keys can't list resources; a 401 "restricted_api_key" still proves the key is valid.
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` }, cache: "no-store" });
      const body = await res.text();
      if (res.ok || /restricted_api_key/.test(body)) return `Sending to ${env("DESIGNER_EMAIL") || "(no DESIGNER_EMAIL)"}`;
      throw new Error(`HTTP ${res.status}`);
    }),
    check("gemini", "Gemini", Boolean(env("GEMINI_API_KEY")), async () => {
      const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}`, { "x-goog-api-key": env("GEMINI_API_KEY") });
      return j.displayName ?? geminiModel();
    }),
    (async (): Promise<Connection> => {
      const secret = Boolean(env("VAANI_WEBHOOK_SECRET"));
      let last: string | null = null;
      if (env("DATABASE_URL")) {
        try {
          const sql = postgres(env("DATABASE_URL"), { ssl: "require", max: 1, idle_timeout: 2 });
          const [r] = await sql`select max(created_at) as at from calls where vaani_call_id not like 'sim-%'`;
          await sql.end({ timeout: 2 });
          last = r?.at ? new Date(r.at).toISOString() : null;
        } catch {
          /* reported by the Neon check */
        }
      }
      if (last) return { key: "vaani", label: "Vaani", state: "connected", detail: `Last call ${last.slice(0, 16).replace("T", " ")} UTC${secret ? "" : " · secret not set"}` };
      return { key: "vaani", label: "Vaani", state: "waiting", detail: secret ? "Webhook secret set · waiting for first call" : "Waiting for webhook + first call" };
    })(),
  ]);
  cache = { at: Date.now(), value };
  return value;
}
