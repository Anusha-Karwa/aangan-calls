// The ONLY place the qualify decision is made. Pure, deterministic TypeScript:
// no LLM, no I/O. Thresholds come from config/rubric.json.
import rubricConfig from "@/config/rubric.json";
import type { Extraction } from "./schema";
import type { CallStatus, Flag, ReengageRating } from "./types";

export type RubricConfig = typeof rubricConfig;
export type Criterion = "scope" | "location" | "timeline" | "budget" | "decision_maker";
export type Gate = "scope" | "location" | "timeline" | "budget";
export type LocationMatch = { match: "in" | "unclear" | "outside"; area: string | null };

export interface RubricResult {
  status: CallStatus;
  score: number | null;
  breakdown: Record<Criterion, number> | null;
  failed_criteria: Criterion[];
  gate_fail: string | null;
  decline_reason: string | null;
  reengage_rating: ReengageRating | null;
  reengage_date: string | null;
  flags: Flag[];
  in_service_area: boolean | null;
  location_area: string | null;
  weeks_to_target: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const hasWord = (hay: string, needle: string) => (" " + hay + " ").includes(" " + norm(needle) + " ");

/** Fuzzy-maps what the caller said to a service area, "unclear", or "outside". */
export function matchLocation(raw: string | null, cfg: RubricConfig = rubricConfig): LocationMatch {
  if (!raw || !raw.trim()) return { match: "unclear", area: null };
  const text = norm(raw);
  // "Near Wagholi, or maybe Kharadi": if the caller also names an ambiguous area, the location is unclear.
  const hedged = cfg.location.unclear_areas.some((a) => a !== "pune" && hasWord(text, a));
  if (hedged) return { match: "unclear", area: raw.trim() };
  const aliases = Object.entries(cfg.location.aliases).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, area] of aliases) if (hasWord(text, alias)) return { match: "in", area };
  const areas = [...cfg.location.service_areas].sort((a, b) => b.length - a.length);
  for (const area of areas) if (hasWord(text, area) || hasWord(text.replace(/ /g, ""), area.replace(/ /g, ""))) return { match: "in", area };
  for (const city of cfg.location.outside) if (hasWord(text, city)) return { match: "outside", area: raw.trim() };
  return { match: "unclear", area: raw.trim() };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) of a timestamp in IST. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function weeksBetween(fromIsoDate: string, toIsoDate: string): number {
  const ms = Date.parse(toIsoDate + "T00:00:00Z") - Date.parse(fromIsoDate + "T00:00:00Z");
  return Math.round((ms / (7 * 86_400_000)) * 10) / 10;
}

function budgetThreshold(x: Extraction, cfg: RubricConfig): number {
  const t = cfg.budget.clearly_below_inr;
  switch (x.scope_category) {
    case "full_home":
      return t.full_home;
    case "single_room":
      return t.single_room;
    case "multi_room":
      return x.rooms_count !== null && x.rooms_count <= 2 ? t.two_rooms : t.multi_room;
    case "office":
      return x.carpet_sqft ? x.carpet_sqft * t.office_per_sqft : t.multi_room;
    default:
      return t.single_room;
  }
}

/**
 * Score one call.
 * @param x     validated extraction
 * @param callAt when the call happened. Timelines are measured from the call, not from "today".
 */
export function evaluate(x: Extraction, callAt: Date = new Date(), cfg: RubricConfig = rubricConfig): RubricResult {
  const P = cfg.points;
  const flags = new Set<Flag>();
  if (x.vip_referral) flags.add("vip");
  if (x.frustrated) flags.add("frustrated");
  if (x.wants_human) flags.add("wants_human");
  if (x.transferred) flags.add("transferred");

  const loc = matchLocation(x.location_area, cfg);
  const callDate = istDate(callAt);
  const weeks =
    x.weeks_to_target ?? (x.target_date ? weeksBetween(callDate, x.target_date) : null);

  const base = {
    in_service_area: loc.match === "in" ? true : loc.match === "outside" ? false : null,
    location_area: loc.area ?? x.location_area,
    weeks_to_target: weeks,
  };

  // 1. Nothing was said: missed call, dropped line, silence.
  if (!x.conversation_happened) {
    return {
      ...base, status: "incomplete", score: null, breakdown: null, failed_criteria: [], gate_fail: null,
      decline_reason: "No conversation (missed or dropped call)", reengage_rating: null, reengage_date: null,
      flags: [...flags],
    };
  }

  // 2. Existing client or complaint: escalate, never score.
  if (x.call_type === "existing_client" || x.is_complaint) {
    flags.add("existing_client");
    return {
      ...base, status: "escalated", score: null, breakdown: null, failed_criteria: [], gate_fail: null,
      decline_reason: null, reengage_rating: null, reengage_date: null, flags: [...flags],
    };
  }

  const gates: Gate[] = [];
  const reasons: string[] = [];

  // --- Scope (25) ---
  let scope: number;
  const excludedType =
    x.project_type === "commercial" && x.commercial_subtype !== null &&
    cfg.scope.excluded_commercial_types.includes(x.commercial_subtype);
  const commercialSize =
    x.project_type === "commercial" && x.carpet_sqft !== null &&
    (x.carpet_sqft < cfg.scope.commercial_min_sqft || x.carpet_sqft > cfg.scope.commercial_max_sqft);
  const excludedScope =
    (x.scope_category !== null && cfg.scope.excluded_scope_categories.includes(x.scope_category)) ||
    x.execution_included === false;
  if (excludedType) {
    scope = P.scope.zero; gates.push("scope"); reasons.push(`Excluded project type (${x.commercial_subtype})`);
  } else if (commercialSize) {
    scope = P.scope.zero; gates.push("scope");
    reasons.push(`Commercial space of ${x.carpet_sqft} sq ft is outside ${cfg.scope.commercial_min_sqft}–${cfg.scope.commercial_max_sqft} sq ft`);
  } else if (excludedScope) {
    scope = P.scope.zero; gates.push("scope");
    reasons.push(`Not a design + execution project (${x.scope_category ?? "no execution"})`);
  } else if (x.scope_category && cfg.scope.full_scope_categories.includes(x.scope_category)) {
    scope = P.scope.full;
  } else {
    scope = P.scope.partial; // single room, vague, or not stated
  }

  // --- Location (25) ---
  let location: number;
  if (loc.match === "in") location = P.location.full;
  else if (loc.match === "unclear") location = P.location.partial;
  else {
    location = P.location.zero; gates.push("location"); reasons.push(`Outside service area (${loc.area})`);
  }

  // --- Timeline (20) ---
  let timeline: number;
  if (weeks === null) timeline = x.timeline_flexible ? P.timeline.full : P.timeline.unknown;
  else if (weeks < cfg.timeline.min_weeks) {
    timeline = P.timeline.zero; gates.push("timeline");
    reasons.push(`Needs completion in ~${weeks} weeks (minimum ${cfg.timeline.min_weeks})`);
  } else if (weeks < cfg.timeline.full_weeks) timeline = P.timeline.partial;
  else timeline = P.timeline.full;
  if (weeks === null && !x.timeline_flexible) flags.add("unconfirmed_fields");

  // --- Budget (15) --- only judged when the caller volunteered a number.
  let budget = P.budget.full;
  if (x.budget_inr !== null && x.budget_inr > 0) {
    const threshold = budgetThreshold(x, cfg);
    if (x.budget_inr < threshold) {
      budget = P.budget.zero;
      reasons.push(`Volunteered budget (${x.budget_volunteered ?? x.budget_inr}) clearly below the scope`);
      if (cfg.budget.clearly_below_is_disqualifying) gates.push("budget");
    } else if (x.budget_inr < threshold * cfg.budget.tight_multiplier) budget = P.budget.partial;
  }

  // --- Decision-maker (15) --- unclear never drops a lead; it adds a flag.
  let decision: number;
  switch (x.decision_maker) {
    case "self":
    case "authorised":
      decision = P.decision_maker.full;
      break;
    case "represents":
      decision = x.owners_will_attend === false ? P.decision_maker.zero : P.decision_maker.partial;
      flags.add("represented");
      if (x.owners_will_attend !== true) flags.add("unconfirmed_fields");
      break;
    case "research":
      decision = P.decision_maker.zero;
      reasons.push("Research only, no decision-maker involved");
      break;
    default:
      decision = P.decision_maker.unknown;
      flags.add("unconfirmed_fields");
  }

  const breakdown = { scope, location, timeline, budget, decision_maker: decision };
  const score = scope + location + timeline + budget + decision;
  const failed_criteria = (Object.keys(breakdown) as Criterion[]).filter((k) => breakdown[k] === 0);

  let status: CallStatus;
  if (gates.length > 0 || failed_criteria.length > cfg.status.max_failed_criteria) status = "unqualified";
  else if (score >= cfg.status.qualified_min) status = "qualified";
  else if (score >= cfg.status.borderline_min) status = "borderline";
  else status = "unqualified";

  let reengage_rating: ReengageRating | null = null;
  let reengage_date: string | null = null;
  if (status === "unqualified") {
    if (gates.includes("location") || excludedType || commercialSize) reengage_rating = "closed";
    else if (gates.includes("budget") || budget === 0) reengage_rating = "cold";
    else if (gates.includes("timeline")) {
      reengage_rating = "warm";
      reengage_date = x.later_start_date ?? addDays(callDate, cfg.reengage.timeline_weeks * 7);
    } else if (x.just_exploring || x.decision_maker === "research") {
      reengage_rating = "warm";
      reengage_date = addDays(callDate, cfg.reengage.exploring_weeks * 7);
    } else if (excludedScope) reengage_rating = "closed";
    else reengage_rating = "cold";
  }

  if (status === "unqualified" && reasons.length === 0) reasons.push(`Score ${score} below ${cfg.status.borderline_min}`);

  return {
    ...base,
    status,
    score,
    breakdown,
    failed_criteria,
    gate_fail: gates[0] ?? (status === "unqualified" ? failed_criteria[0] ?? null : null),
    decline_reason: status === "unqualified" ? reasons.join("; ") : null,
    reengage_rating,
    reengage_date,
    flags: [...flags],
  };
}
