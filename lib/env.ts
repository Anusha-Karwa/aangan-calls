// Central place for configuration. Every integration checks `isLive(...)` and
// falls back to mock / dry-run mode when its key is missing.

export function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const integrations = {
  vaani: ["VAANI_API_KEY", "VAANI_AGENT_ID"],
  vaaniWebhook: ["VAANI_WEBHOOK_SECRET"],
  gemini: ["GEMINI_API_KEY"],
  calcom: ["CALCOM_API_KEY"],
  resend: ["RESEND_API_KEY", "DESIGNER_EMAIL"],
  hubspot: ["HUBSPOT_TOKEN"],
  db: ["DATABASE_URL"],
  dashboardAuth: ["DASHBOARD_PASSWORD"],
} as const;

export type Integration = keyof typeof integrations;

export function isLive(name: Integration): boolean {
  return integrations[name].every((k) => env(k) !== "");
}

export function integrationStatus(): Record<Integration, "live" | "mock"> {
  return Object.fromEntries(
    (Object.keys(integrations) as Integration[]).map((k) => [k, isLive(k) ? "live" : "mock"]),
  ) as Record<Integration, "live" | "mock">;
}

export function mockLog(integration: string, action: string, detail: unknown) {
  console.log(`[MOCK ${integration}] ${action}`, JSON.stringify(detail, null, 2).slice(0, 2000));
}

export function appBaseUrl(): string {
  return env("APP_BASE_URL", "http://localhost:3000").replace(/\/$/, "");
}
