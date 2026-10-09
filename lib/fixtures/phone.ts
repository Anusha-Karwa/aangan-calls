// Hand-labelled "ideal extraction" for the 20 phone transcripts (knowledge/transcripts/T*.txt)
// plus the outcomes the brief expects. Used by:
//  - lib/rubric.test.ts: proves the rubric is right independent of the LLM;
//  - scripts/eval.ts --fixtures: offline eval without a Gemini key;
//  - scripts/eval.ts (live): field-by-field diff of Gemini's output against these labels.
import { emptyExtraction, type Extraction } from "../schema";
import type { CallStatus, Flag } from "../types";

export interface Expected {
  status: CallStatus;
  gate_fail?: string;
  reengage?: "warm" | "cold" | "closed";
  flags?: Flag[];
  asked_price?: boolean;
}

export interface PhoneFixture {
  id: string;
  callAt: string; // ISO, IST
  expected: Expected;
  golden: Extraction;
}

const g = (o: Partial<Extraction>): Extraction =>
  emptyExtraction({ conversation_happened: true, call_type: "new", language: "English", ...o });

export const PHONE_FIXTURES: PhoneFixture[] = [
  {
    id: "T01", callAt: "2026-09-02T10:23:00+05:30", expected: { status: "qualified" },
    golden: g({ caller_name: "Priya", project_type: "residential", property: "3BHK apartment", scope: "Full redesign: kitchen, living room, both bedrooms", scope_category: "full_home", rooms_count: 4, execution_included: true, location_area: "Kothrud (Dahanukar Colony)", carpet_sqft: 1400, site_state: "builder", timeline_text: "Done by March, no rush", target_date: "2027-03-31", timeline_flexible: true, decision_maker: "self", source: "Referral: Shruti Joshi (past client)" }),
  },
  {
    id: "T02", callAt: "2026-09-03T14:41:00+05:30", expected: { status: "qualified", asked_price: true },
    golden: g({ project_type: "residential", property: "2BHK apartment", scope: "Full redesign: modular kitchen, wardrobes, living room, both bedrooms", scope_category: "full_home", rooms_count: 4, execution_included: true, location_area: "Wakad", carpet_sqft: 950, timeline_text: "Move in November; design from October", target_date: "2026-11-15", asked_price: true, source: "Instagram" }),
  },
  {
    id: "T03", callAt: "2026-09-03T16:15:00+05:30", expected: { status: "unqualified", gate_fail: "location", reengage: "closed" },
    golden: g({ caller_name: "Suresh Patil", project_type: "residential", property: "Home", scope: "Home office and study", scope_category: "multi_room", rooms_count: 2, location_area: "Nashik", source: "LinkedIn" }),
  },
  {
    id: "T04", callAt: "2026-09-04T11:07:00+05:30", expected: { status: "unqualified", gate_fail: "scope" },
    golden: g({ project_type: "residential", scope: "Ideas for living room: colours, furniture arrangement", scope_category: "advice_only", rooms_count: 1, execution_included: false, just_exploring: true }),
  },
  {
    id: "T05", callAt: "2026-09-05T10:52:00+05:30", expected: { status: "qualified", flags: ["vip"] },
    golden: g({ caller_name: "Aarti Mehta", project_type: "residential", property: "4BHK apartment", scope: "Complete redesign: flooring, kitchen, all four bedrooms", scope_category: "full_home", rooms_count: 6, execution_included: true, location_area: "Koregaon Park", carpet_sqft: 2400, site_state: "lived_in", timeline_text: "Move back in by February (~4 months)", target_date: "2027-02-01", weeks_to_target: 17, decision_maker: "self", source: "Referral: Vikram Agarwal (friend of Nikhil)", vip_referral: true, booking_type: "site_visit" }),
  },
  {
    id: "T06", callAt: "2026-09-05T15:28:00+05:30", expected: { status: "qualified" },
    golden: g({ project_type: "commercial", commercial_subtype: "office", property: "Startup office", scope: "Full fitout: 20 workstations, cabin, meeting room, break area", scope_category: "office", execution_included: true, location_area: "Baner", carpet_sqft: 800, site_state: "bare", timeline_text: "Operational by December", target_date: "2026-12-01", decision_maker: "self" }),
  },
  {
    id: "T07", callAt: "2026-09-08T09:44:00+05:30", expected: { status: "unqualified", gate_fail: "timeline", reengage: "warm" },
    golden: g({ project_type: "residential", scope: "Living room and kitchen", scope_category: "multi_room", rooms_count: 2, execution_included: true, timeline_text: "Before Diwali (about 3 weeks away); might start after Diwali", weeks_to_target: 3, later_start_date: "2026-11-15" }),
  },
  {
    id: "T08", callAt: "2026-09-09T22:47:00+05:30", expected: { status: "incomplete" },
    golden: emptyExtraction({ conversation_happened: false, location_area: "Nanded City" }),
  },
  {
    id: "T09", callAt: "2026-09-10T11:32:00+05:30", expected: { status: "escalated", flags: ["existing_client"] },
    golden: g({ caller_name: "Sheetal Deshpande", call_type: "existing_client", is_complaint: true, property: "2BHK flat", location_area: "Viman Nagar", frustrated: true, wants_human: true }),
  },
  {
    id: "T10", callAt: "2026-09-11T14:04:00+05:30", expected: { status: "unqualified", gate_fail: "budget", reengage: "cold" },
    golden: g({ project_type: "residential", property: "1BHK", scope: "Kitchen and one bedroom", scope_category: "multi_room", rooms_count: 2, execution_included: true, location_area: "Kharadi", carpet_sqft: 550, budget_volunteered: "1 to 1.5 lakh maximum", budget_inr: 150000 }),
  },
  {
    id: "T11", callAt: "2026-09-12T10:18:00+05:30", expected: { status: "qualified" },
    golden: g({ project_type: "residential", property: "2BHK rented apartment", scope: "Living room, bedroom, kitchen; no structural changes", scope_category: "multi_room", rooms_count: 3, execution_included: true, location_area: "Baner", site_state: "rented", timeline_text: "No deadline given; 3-year lease", timeline_flexible: true, decision_maker: "self" }),
  },
  {
    id: "T12", callAt: "2026-09-15T10:05:00+05:30", expected: { status: "qualified" },
    golden: g({ caller_name: "Anand Sharma", project_type: "residential", property: "Villa, ground + 2 floors", scope: "Full end-to-end design", scope_category: "full_home", execution_included: true, location_area: "Kalyani Nagar", carpet_sqft: 5500, site_state: "bare", timeline_text: "Move in March next year, no rush", target_date: "2027-03-01", timeline_flexible: true, decision_maker: "self", booking_type: "site_visit" }),
  },
  {
    id: "T13", callAt: "2026-09-16T12:19:00+05:30", expected: { status: "qualified", asked_price: true },
    golden: g({ project_type: "residential", property: "3BHK flat", scope: "Kitchen, wardrobes in both bedrooms, living room", scope_category: "full_home", rooms_count: 4, execution_included: true, location_area: "Aundh", carpet_sqft: 1100, asked_price: true }),
  },
  {
    id: "T14", callAt: "2026-09-17T11:41:00+05:30", expected: { status: "qualified", flags: ["represented"] },
    golden: g({ project_type: "residential", property: "Parents' 3BHK, new possession", scope: "Proper interior design", scope_category: "full_home", execution_included: true, location_area: "Hadapsar", site_state: "bare", decision_maker: "represents", owners_will_attend: true }),
  },
  {
    id: "T15", callAt: "2026-09-18T15:12:00+05:30", expected: { status: "qualified" },
    golden: g({ caller_name: "Smita", project_type: "residential", property: "2BHK, possession in ~6 weeks", scope: "Full home: kitchen, wardrobes, living room", scope_category: "full_home", execution_included: true, location_area: "Undri", carpet_sqft: 875, site_state: "builder", timeline_text: "Possession in ~6 weeks; start design right away", timeline_flexible: true, decision_maker: "authorised" }),
  },
  {
    id: "T16", callAt: "2026-09-19T10:38:00+05:30", expected: { status: "qualified", flags: ["frustrated"] },
    golden: g({ caller_name: "Girish Nair", project_type: "residential", property: "3BHK", scope: "3BHK project (details not repeated)", scope_category: "vague", location_area: "Viman Nagar", frustrated: true }),
  },
  {
    id: "T17", callAt: "2026-09-22T14:16:00+05:30", expected: { status: "qualified" },
    golden: g({ caller_name: "Ritu Kapoor", project_type: "residential", property: "3BHK", scope: "Kitchen, wardrobes, living room", scope_category: "full_home", execution_included: true, location_area: "Pimple Saudagar", carpet_sqft: 1050, site_state: "lived_in", timeline_text: "Ideally done by March", target_date: "2027-03-31", timeline_flexible: true }),
  },
  {
    id: "T18", callAt: "2026-09-23T11:55:00+05:30", expected: { status: "unqualified", gate_fail: "scope" },
    golden: g({ project_type: "commercial", commercial_subtype: "coworking", property: "Coworking pod", scope: "Lighting, desk, storage for a pod", scope_category: "office", carpet_sqft: 180 }),
  },
  {
    id: "T19", callAt: "2026-09-24T16:02:00+05:30", expected: { status: "unqualified", gate_fail: "scope", reengage: "closed" },
    golden: g({ project_type: "commercial", commercial_subtype: "restaurant", property: "New restaurant", scope: "Restaurant interiors", scope_category: "office", location_area: "Koregaon Park" }),
  },
  {
    id: "T20", callAt: "2026-09-25T09:15:00+05:30", expected: { status: "qualified" },
    golden: g({ caller_name: "Pooja", project_type: "residential", property: "2BHK", scope: "Kitchen, both bedrooms, living room", scope_category: "full_home", rooms_count: 4, execution_included: true, location_area: "Magarpatta (Cybercity)", carpet_sqft: 900, timeline_text: "Flexible; January start for execution", timeline_flexible: true, decision_maker: "self" }),
  },
];
