// Transcript -> structured fields + designer summary, via Gemini JSON mode.
// LLM extraction makes mistakes, so every result is: zod-validated, cross-checked
// against the transcript text, and low-confidence fields are flagged.
import rubricConfig from "@/config/rubric.json";
import { env, mockLog } from "./env";
import { generateJson } from "./gemini";
import { matchLocation } from "./rubric";
import { COMMERCIAL_TYPES, CONFIDENCE_KEYS, ExtractionSchema, SCOPE_CATEGORIES, emptyExtraction, type Extraction } from "./schema";

export interface ExtractResult {
  ok: boolean; // false => parsing failed twice; caller marks the call `incomplete`
  extraction: Extraction;
  unconfirmed: string[]; // fields that failed a cross-check or had low confidence
  mode: "gemini" | "heuristic";
  error?: string;
}

export const EXTRACT_SYSTEM = `You read phone-call transcripts for Aangan Studio, an interior design studio in Pune, and fill a JSON record for the designer who will run the consultation.

RULES
- Extract ONLY what the caller actually said (or confirmed when the agent read it back). If something was not said, return null. Never guess.
- NEVER infer a budget. budget_volunteered/budget_inr are set only if the caller themself stated an amount. "1 to 1.5 lakh" -> budget_inr 150000 (use the upper bound). 1 lakh = 100000, 1 crore = 10000000.
- The call date is given. weeks_to_target = weeks from the call date until the caller needs the work COMPLETED (not possession, not start). If the conversation itself states a duration ("Diwali is about three weeks away", "in a month"), use that number. target_date = that completion date as YYYY-MM-DD if a month/date was said ("by March" -> last day of the next March after the call date).
- timeline_flexible = true if the caller says no rush / flexible / no deadline / whenever.
- later_start_date: if a later start was discussed (e.g. "after Diwali", "November start"), that date as YYYY-MM-DD; else null.
- scope_category:
  full_home = whole home, or kitchen + wardrobes + living etc. (3+ spaces), or a full floor;
  multi_room = exactly 2 rooms/spaces (rooms_count = 2), or a home office + study etc.;
  single_room = one room only; office = office/clinic/studio/coworking/any commercial fitout;
  advice_only / decor_only = ideas, colours, styling, rearranging, no execution; furniture_only = only buying/sourcing furniture; vastu_only = only Vastu advice;
  vague = they want "interiors" but did not say what.
- execution_included = false only if the caller says they don't want execution / will execute themselves / just ideas.
- commercial_subtype only for commercial projects (restaurant, cafe, hotel, retail, gym, office, clinic, coworking ...).
- decision_maker: self = owner/decides; authorised = spouse/partner/boss told them to go ahead; represents = calling for someone else (parents, landlord, company) who decides; research = just collecting info for someone else with no plan for them to attend; unknown = not discussed.
- owners_will_attend = true if the real decision-makers will come to the consultation.
- call_type existing_client = they already have a project with the studio. is_complaint = complaining about service on an existing project.
- conversation_happened = false for missed calls, voicemail, silence, or a line that dropped before the caller said what they want.
- asked_price = true if the caller asked about cost, rates, price, a ballpark or a range, in any language.
- vip_referral = referred by a friend/relative of the founder Nikhil or by someone the caller names as close to the studio.
- frustrated = caller is annoyed/angry (e.g. no reply earlier). wants_human = asked for a person/manager.
- booking_confirmed_on_call = the agent confirmed a booked slot. booking_type site_visit or studio, booking_time_text as said.
- source = how they heard about the studio (Instagram, Google, referral by <name>, LinkedIn ...).
- language = the language(s) the caller used.
- summary = exactly 5 short lines separated by "\\n", for the designer: who + property, what they want, area/size/state, timeline + decision-maker, anything to watch (price question, frustration, budget). No prices of our own.
- confidence: 0..1 for each key, how sure you are the value is correct (1 if clearly stated, 0.5 if implied, use 1 for a correct null).`;

// Gemini responseSchema (OpenAPI subset). Mirrors ExtractionSchema.
const S = (type: string, extra: object = {}) => ({ type, nullable: true, ...extra });
const ENUM = (values: readonly string[]) => ({ type: "STRING", nullable: true, enum: [...values] });
export const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    conversation_happened: { type: "BOOLEAN" },
    caller_name: S("STRING"),
    phone: S("STRING"),
    email: S("STRING"),
    call_type: ENUM(["new", "existing_client", "other"]),
    is_complaint: { type: "BOOLEAN" },
    project_type: ENUM(["residential", "commercial", "other"]),
    commercial_subtype: ENUM(COMMERCIAL_TYPES),
    property: S("STRING"),
    scope: S("STRING"),
    scope_category: ENUM(SCOPE_CATEGORIES),
    rooms_count: S("INTEGER"),
    execution_included: S("BOOLEAN"),
    location_area: S("STRING"),
    carpet_sqft: S("INTEGER"),
    site_state: ENUM(["bare", "builder", "lived_in", "rented", "unknown"]),
    timeline_text: S("STRING"),
    target_date: S("STRING", { description: "YYYY-MM-DD" }),
    weeks_to_target: S("NUMBER"),
    timeline_flexible: S("BOOLEAN"),
    later_start_date: S("STRING", { description: "YYYY-MM-DD" }),
    decision_maker: ENUM(["self", "authorised", "represents", "research", "unknown"]),
    owners_will_attend: S("BOOLEAN"),
    budget_volunteered: S("STRING"),
    budget_inr: S("NUMBER"),
    asked_price: { type: "BOOLEAN" },
    source: S("STRING"),
    language: S("STRING"),
    just_exploring: { type: "BOOLEAN" },
    vip_referral: { type: "BOOLEAN" },
    frustrated: { type: "BOOLEAN" },
    wants_human: { type: "BOOLEAN" },
    transferred: { type: "BOOLEAN" },
    booking_confirmed_on_call: { type: "BOOLEAN" },
    booking_type: ENUM(["site_visit", "studio"]),
    booking_time_text: S("STRING"),
    summary: { type: "STRING" },
    confidence: {
      type: "OBJECT",
      properties: Object.fromEntries(CONFIDENCE_KEYS.map((k) => [k, { type: "NUMBER" }])),
      required: [...CONFIDENCE_KEYS],
    },
  },
  required: [
    "conversation_happened", "caller_name", "phone", "email", "call_type", "is_complaint", "project_type",
    "commercial_subtype", "property", "scope", "scope_category", "rooms_count", "execution_included", "location_area",
    "carpet_sqft", "site_state", "timeline_text", "target_date", "weeks_to_target", "timeline_flexible",
    "later_start_date", "decision_maker", "owners_will_attend", "budget_volunteered", "budget_inr", "asked_price",
    "source", "language", "just_exploring", "vip_referral", "frustrated", "wants_human", "transferred",
    "booking_confirmed_on_call", "booking_type", "booking_time_text", "summary", "confidence",
  ],
};

// ---------- verification ----------

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");

/** Cross-check key fields against the transcript. Returns names of fields that don't hold up. */
export function crossCheck(x: Extraction, transcript: string): { extraction: Extraction; unconfirmed: string[] } {
  const out = { ...x };
  const bad = new Set<string>();
  const t = words(transcript);
  const tFlat = alnum(transcript.replace(/\bat the rate\b|\bat\b/gi, "@").replace(/\bdot\b/gi, "."));

  // Area: some word of the extracted area must appear in the transcript.
  if (out.location_area) {
    const tokens = words(out.location_area).split(" ").filter((w) => w.length > 2 && !["area", "near", "road", "pune", "the"].includes(w));
    if (tokens.length && !tokens.some((w) => t.includes(w))) bad.add("location_area");
  }
  // Sq ft: the number must appear (commas stripped). A number never said is dropped.
  if (out.carpet_sqft !== null) {
    const nums = transcript.replace(/(\d),(\d)/g, "$1$2").match(/\d+(\.\d+)?/g) ?? [];
    if (!nums.some((n) => Math.round(Number(n)) === out.carpet_sqft)) {
      bad.add("carpet_sqft");
      out.carpet_sqft = null;
    }
  }
  // Email: the local part must be recoverable from the transcript (voice spells it out).
  if (out.email) {
    const local = alnum(out.email.split("@")[0] ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) bad.add("email");
    else if (local && !tFlat.includes(local)) bad.add("email");
  }
  // Timeline: if there's timeline text, some of its content words should be in the transcript.
  if (out.timeline_text) {
    const tokens = words(out.timeline_text).split(" ").filter((w) => w.length > 3);
    if (tokens.length && !tokens.some((w) => t.includes(w))) bad.add("timeline");
  }
  // Budget: never inferred. Requires a money word or a number in the transcript.
  if (out.budget_inr !== null && !/(lakh|lac|crore|₹|rs\.?|rupee|\bk\b|thousand|\d)/i.test(transcript)) {
    out.budget_inr = null;
    out.budget_volunteered = null;
    bad.add("budget");
  }

  // Low confidence -> unconfirmed.
  for (const [k, v] of Object.entries(out.confidence ?? {})) {
    if (typeof v === "number" && v < rubricConfig.extraction.min_confidence) bad.add(k);
  }
  return { extraction: out, unconfirmed: [...bad] };
}

// ---------- main ----------

function userPrompt(transcript: string, callAt: Date, attempt: number): string {
  const ist = new Date(callAt.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");
  return `${attempt > 1 ? "Your previous answer was not valid JSON for the schema. Return ONLY the JSON object.\n\n" : ""}Call date/time (IST): ${ist}\n\nTRANSCRIPT:\n${transcript}`;
}

export async function extract(transcript: string, callAt: Date = new Date()): Promise<ExtractResult> {
  if (!transcript || transcript.trim().length < 20) {
    return { ok: true, extraction: emptyExtraction({ summary: "No conversation captured." }), unconfirmed: [], mode: "heuristic" };
  }
  if (!env("GEMINI_API_KEY")) {
    mockLog("gemini", "extract (heuristic fallback, no GEMINI_API_KEY)", { chars: transcript.length });
    const h = heuristicExtract(transcript);
    const checked = crossCheck(h, transcript);
    return { ok: true, extraction: checked.extraction, unconfirmed: checked.unconfirmed, mode: "heuristic" };
  }

  // Bad JSON gets one retry (per the brief). API errors (rate limit, 5xx, timeouts) are
  // transient and get up to 3 retries with backoff, so a Gemini hiccup doesn't lose a lead.
  let lastError = "";
  let parseAttempts = 0;
  let apiErrors = 0;
  while (parseAttempts < 2 && apiErrors <= 3) {
    let text: string;
    try {
      text = await generateJson({ system: EXTRACT_SYSTEM, prompt: userPrompt(transcript, callAt, parseAttempts + 1), schema: GEMINI_SCHEMA });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      apiErrors++;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (apiErrors - 1)));
      continue;
    }
    parseAttempts++;
    try {
      const parsed = ExtractionSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      const checked = crossCheck(parsed.data, transcript);
      return { ok: true, extraction: checked.extraction, unconfirmed: checked.unconfirmed, mode: "gemini" };
    } catch (e) {
      lastError = `invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ok: false, extraction: emptyExtraction({ summary: "Automatic extraction failed: read the transcript." }), unconfirmed: [], mode: "gemini", error: lastError };
}

// ---------- heuristic fallback (mock mode only) ----------
// Crude keyword extraction so the whole flow can run without a Gemini key. Not used in production.

export function heuristicExtract(transcript: string): Extraction {
  const lower = transcript.toLowerCase();
  const callerText = transcript
    .split(/\n+/)
    .filter((l) => /^(caller|user|customer)\s*:/i.test(l.trim()))
    .join("\n") || transcript;
  const cl = callerText.toLowerCase();

  const name = /(?:i['’]?m|my name is|this is|name['’]?s)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(callerText)?.[1] ?? null;
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(transcript)?.[0] ?? null;
  const phone = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.exec(transcript)?.[0]?.replace(/[\s-]/g, "") ?? null;
  const sqft = /(\d[\d,]{2,5})\s*(?:sq\.?\s*ft|square feet|sqft)/i.exec(callerText)?.[1];

  let location: string | null = null;
  for (const line of callerText.split("\n")) {
    const m = matchLocation(line);
    if (m.match !== "unclear") { location = m.match === "in" ? m.area : line.match(/nashik|mumbai|talegaon|lonavala|thane/i)?.[0] ?? null; break; }
  }

  const commercialSubtype = (COMMERCIAL_TYPES as readonly string[]).find((t) => t !== "other" && t !== "studio" && new RegExp(`\\b${t}\\b`).test(cl)) as Extraction["commercial_subtype"] | undefined;
  const isCommercial = Boolean(commercialSubtype) || /\boffice space|commercial|workstations\b/.test(cl);
  const rooms = ["kitchen", "living", "bedroom", "wardrobe", "dining", "study"].filter((r) => cl.includes(r)).length;
  const scope_category: Extraction["scope_category"] =
    /\b(ideas|suggestions|advice|colours|just exploring)\b/.test(cl) ? "advice_only"
      : isCommercial ? "office"
      : /full (home|redesign|interiors)|whole (home|thing)|complete redesign|end-to-end|\d\s?bhk/.test(cl) || rooms >= 3 ? "full_home"
      : rooms === 2 ? "multi_room" : rooms === 1 ? "single_room" : null;

  const budgetM = /(\d+(?:\.\d+)?)\s*(?:to\s*(\d+(?:\.\d+)?)\s*)?(lakh|lac|crore)/i.exec(callerText);
  const budget = budgetM ? Number(budgetM[2] ?? budgetM[1]) * (/crore/i.test(budgetM[3]) ? 1e7 : 1e5) : null;

  const weeks = /(\w+)\s+weeks?\s+(?:away|from now|time)/i.exec(transcript)?.[1];
  const wordNum: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10 };

  return emptyExtraction({
    conversation_happened: !/missed call|no voicemail/i.test(lower) && callerText.length > 40,
    caller_name: name,
    email,
    phone,
    call_type: /my project|my designer|existing|complain/.test(cl) ? "existing_client" : "new",
    is_complaint: /not acceptable|complain|hasn['’]t replied/.test(cl),
    project_type: isCommercial ? "commercial" : "residential",
    commercial_subtype: commercialSubtype ?? (isCommercial ? "office" : null),
    property: /\d\s?bhk|villa|office/i.exec(callerText)?.[0] ?? null,
    scope: callerText.split("\n").find((l) => /kitchen|living|bedroom|redesign|interior|office|restaurant/i.test(l))?.replace(/^\w+:\s*/, "").slice(0, 160) ?? null,
    scope_category,
    rooms_count: rooms || null,
    execution_included: scope_category === "advice_only" ? false : null,
    location_area: location,
    carpet_sqft: sqft ? Number(sqft.replace(/,/g, "")) : null,
    site_state: /\brent(ed|al)?\b|lease/.test(cl) ? "rented" : /bare|empty|possession/.test(cl) ? "bare" : /builder/.test(cl) ? "builder" : null,
    timeline_text: callerText.split("\n").find((l) => /by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|diwali|weeks|months|no rush|flexible/i.test(l))?.replace(/^\w+:\s*/, "").slice(0, 120) ?? null,
    weeks_to_target: weeks ? wordNum[weeks.toLowerCase()] ?? (Number(weeks) || null) : null,
    timeline_flexible: /no rush|flexible|no deadline|plenty of time/.test(cl) || null,
    decision_maker: /my parents|for my (mother|father|in-laws)/.test(cl) ? "represents" : /founder|owner|myself and|husband and i|wife and i|go ahead/.test(cl) ? "self" : null,
    owners_will_attend: /they would come|will attend|both want to be/.test(cl) || null,
    budget_volunteered: budgetM?.[0] ?? null,
    budget_inr: budget,
    asked_price: /how much|cost|price|ballpark|range|rate|kitna/.test(cl),
    source: /instagram|google|linkedin|friend|referr?al|referred/i.exec(callerText)?.[0] ?? null,
    language: "English",
    just_exploring: /just exploring|exploring for now|maybe later/.test(cl),
    vip_referral: /friend of nikhil|nikhil['’]s/.test(cl),
    frustrated: /not acceptable|not a good sign|been two days|no one replied/.test(cl),
    wants_human: /speak to someone|real person|human|manager/.test(cl),
    summary: ["(Heuristic summary: Gemini key not set)", callerText.split("\n").slice(0, 4).join(" ").slice(0, 300)].join("\n"),
    confidence: { caller_name: 0.5, location_area: 0.6, scope: 0.5, timeline: 0.5, budget: 0.8, decision_maker: 0.5 },
  });
}
