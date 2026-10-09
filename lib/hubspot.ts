import { appBaseUrl, env, mockLog } from "./env";
import { formatIst } from "./time";
import { effectiveStatus, type CallRow } from "./types";

// HubSpot CRM v3 with a private-app token. Scopes: crm.objects.contacts.read/write, crm.objects.deals.read/write.
// (HubSpot also has dated /crm/objects/2026-09/... paths; v3 is supported until Sept 2027.)
const BASE = "https://api.hubapi.com";

async function hs<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function splitName(name: string | null): { firstname?: string; lastname?: string } {
  if (!name) return {};
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? { firstname: first, lastname: rest.join(" ") } : { firstname: first };
}

async function findContact(c: CallRow): Promise<string | null> {
  const groups = [];
  if (c.email) groups.push({ filters: [{ propertyName: "email", operator: "EQ", value: c.email }] });
  if (c.phone) {
    groups.push({ filters: [{ propertyName: "phone", operator: "EQ", value: c.phone }] });
    groups.push({ filters: [{ propertyName: "mobilephone", operator: "EQ", value: c.phone }] });
  }
  if (!groups.length) return null;
  const r = await hs<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", { filterGroups: groups, properties: ["email", "phone"], limit: 1 });
  return r.results[0]?.id ?? null;
}

export async function upsertContact(c: CallRow): Promise<string> {
  const properties: Record<string, string> = { ...splitName(c.caller_name) } as Record<string, string>;
  if (c.email) properties.email = c.email;
  if (c.phone) properties.phone = c.phone;
  if (c.location_area) properties.city = `${c.location_area}, Pune`;
  properties.lifecyclestage = "lead";
  const existing = await findContact(c);
  if (existing) {
    delete properties.lifecyclestage; // never move an existing contact backwards
    await hs("PATCH", `/crm/v3/objects/contacts/${existing}`, { properties });
    return existing;
  }
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties });
  return r.id;
}

export function dealName(c: CallRow): string {
  return `${c.caller_name ?? c.phone ?? "Caller"} — ${c.property ?? "Interior project"}, ${c.location_area ?? "Pune"}`;
}

export async function createDeal(c: CallRow, contactId: string): Promise<string> {
  const stage = c.booking_start ? env("HUBSPOT_STAGE_BOOKED", "appointmentscheduled") : env("HUBSPOT_STAGE_QUALIFIED", "qualifiedtobuy");
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/deals", {
    properties: {
      dealname: dealName(c),
      pipeline: env("HUBSPOT_PIPELINE", "default"),
      dealstage: stage,
      ...(c.booking_start ? { closedate: c.booking_start } : {}),
      description: `Score ${c.score ?? "-"}/100 (${effectiveStatus(c)}). Source: ${c.source ?? "unknown"}. Dashboard: ${appBaseUrl()}/calls/${c.id}`,
    },
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
  });
  // Note on the deal with the details Nikhil cares about (no transcript).
  await hs("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: [
        `<b>Score:</b> ${c.score ?? "-"}/100 · ${effectiveStatus(c)}${c.flags.length ? ` · flags: ${c.flags.join(", ")}` : ""}`,
        `<b>Source:</b> ${c.source ?? "unknown"}`,
        `<b>Consultation:</b> ${c.booking_start ? formatIst(c.booking_start) : "not booked yet"}`,
        `<b>Scope:</b> ${c.scope ?? "-"} · ${c.carpet_sqft ? `${c.carpet_sqft} sq ft` : "size n/a"}`,
        `<b>Dashboard:</b> <a href="${appBaseUrl()}/calls/${c.id}">${appBaseUrl()}/calls/${c.id}</a>`,
      ].join("<br/>"),
    },
    associations: [{ to: { id: r.id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }],
  });
  return r.id;
}

export async function updateDealStage(dealId: string, stage: string) {
  await hs("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: stage } });
}

/** Contact + deal for a qualified/borderline lead. Reuses the existing deal on re-send. */
export async function syncToHubspot(c: CallRow): Promise<{ contactId: string | null; dealId: string | null; mock: boolean }> {
  if (!env("HUBSPOT_TOKEN")) {
    mockLog("hubspot", "contact + deal (dry run)", { contact: { name: c.caller_name, email: c.email, phone: c.phone }, deal: dealName(c), score: c.score, booking: c.booking_start });
    return { contactId: null, dealId: null, mock: true };
  }
  const contactId = await upsertContact(c);
  const dealId = c.hubspot_deal_id ?? (await createDeal(c, contactId));
  return { contactId, dealId, mock: false };
}
