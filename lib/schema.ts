import { z } from "zod";

// The structured result of reading one call transcript. Produced by Gemini
// (lib/extract.ts), validated here, then scored by lib/rubric.ts.

const nstr = z.string().nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const SCOPE_CATEGORIES = [
  "full_home",
  "multi_room",
  "single_room",
  "office",
  "advice_only",
  "decor_only",
  "furniture_only",
  "vastu_only",
  "vague",
] as const;

export const COMMERCIAL_TYPES = [
  "office", "clinic", "studio", "coworking", "restaurant", "cafe", "bar", "hotel", "retail", "showroom", "gym", "salon", "other",
] as const;

export const CONFIDENCE_KEYS = [
  "caller_name", "phone", "email", "location_area", "carpet_sqft", "scope", "timeline", "decision_maker", "budget",
] as const;

export const ExtractionSchema = z.object({
  conversation_happened: z.boolean(),
  caller_name: nstr,
  phone: nstr,
  email: nstr,
  call_type: z.enum(["new", "existing_client", "other"]).nullable(),
  is_complaint: z.boolean(),
  project_type: z.enum(["residential", "commercial", "other"]).nullable(),
  commercial_subtype: z.enum(COMMERCIAL_TYPES).nullable(),
  property: nstr,
  scope: nstr,
  scope_category: z.enum(SCOPE_CATEGORIES).nullable(),
  rooms_count: z.number().int().nullable(),
  execution_included: z.boolean().nullable(),
  location_area: nstr,
  carpet_sqft: z.number().int().nullable(),
  site_state: z.enum(["bare", "builder", "lived_in", "rented", "unknown"]).nullable(),
  timeline_text: nstr,
  target_date: date,
  weeks_to_target: z.number().nullable(),
  timeline_flexible: z.boolean().nullable(),
  later_start_date: date,
  decision_maker: z.enum(["self", "authorised", "represents", "research", "unknown"]).nullable(),
  owners_will_attend: z.boolean().nullable(),
  budget_volunteered: nstr,
  budget_inr: z.number().nullable(),
  asked_price: z.boolean(),
  source: nstr,
  language: nstr,
  just_exploring: z.boolean(),
  vip_referral: z.boolean(),
  frustrated: z.boolean(),
  wants_human: z.boolean(),
  transferred: z.boolean(),
  booking_confirmed_on_call: z.boolean(),
  booking_type: z.enum(["site_visit", "studio"]).nullable(),
  booking_time_text: nstr,
  requested_slot: z.string().nullable().default(null),
  site_address: nstr.default(null),
  summary: z.string(),
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

/** A blank extraction: what we know when nothing was said (missed call / failed parse). */
export function emptyExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    conversation_happened: false, caller_name: null, phone: null, email: null, call_type: null, is_complaint: false,
    project_type: null, commercial_subtype: null, property: null, scope: null, scope_category: null, rooms_count: null,
    execution_included: null, location_area: null, carpet_sqft: null, site_state: null, timeline_text: null,
    target_date: null, weeks_to_target: null, timeline_flexible: null, later_start_date: null, decision_maker: null,
    owners_will_attend: null, budget_volunteered: null, budget_inr: null, asked_price: false, source: null,
    language: null, just_exploring: false, vip_referral: false, frustrated: false, wants_human: false,
    transferred: false, booking_confirmed_on_call: false, booking_type: null, booking_time_text: null, requested_slot: null, site_address: null, summary: "",
    confidence: {},
    ...overrides,
  };
}
