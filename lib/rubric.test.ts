import { describe, expect, it } from "vitest";
import { evaluate, matchLocation, weeksBetween } from "./rubric";
import { emptyExtraction, type Extraction } from "./schema";
import { PHONE_FIXTURES } from "./fixtures/phone";

const lead = (o: Partial<Extraction> = {}): Extraction =>
  emptyExtraction({
    conversation_happened: true, call_type: "new", project_type: "residential", scope_category: "full_home",
    execution_included: true, location_area: "Baner", timeline_flexible: true, decision_maker: "self", ...o,
  });
const at = new Date("2026-10-08T12:00:00+05:30");

describe("matchLocation", () => {
  it.each([
    ["Cybercity", "Magarpatta"],
    ["Sunderban area, Aundh", "Aundh"],
    ["Dahanukar Colony", "Kothrud"],
    ["Hinjewadi Phase 1", "Hinjewadi"],
    ["NIBM Road, Pune", "NIBM"],
    ["pimple saudagar", "Pimple Saudagar"],
    ["Kalyaninagar", "Kalyani Nagar"],
  ])("%s -> %s", (raw, area) => expect(matchLocation(raw)).toEqual({ match: "in", area }));

  it.each(["Nashik", "Talegaon Dabhade, near Pune", "Lonavala", "Andheri, Mumbai"])("%s is outside", (raw) =>
    expect(matchLocation(raw).match).toBe("outside"));

  it.each(["Wagholi", "Pune", "somewhere new", null])("%s is unclear", (raw) =>
    expect(matchLocation(raw).match).toBe("unclear"));
});

describe("gates", () => {
  it("clean lead qualifies with 100", () => {
    const r = evaluate(lead(), at);
    expect(r.status).toBe("qualified");
    expect(r.score).toBe(100);
  });
  it("advice only fails scope", () => expect(evaluate(lead({ scope_category: "advice_only" }), at).gate_fail).toBe("scope"));
  it("standalone vastu fails scope", () => expect(evaluate(lead({ scope_category: "vastu_only" }), at).gate_fail).toBe("scope"));
  it("no execution fails scope", () => expect(evaluate(lead({ execution_included: false }), at).gate_fail).toBe("scope"));
  it.each(["restaurant", "hotel", "retail", "gym"] as const)("%s is excluded and closed", (t) => {
    const r = evaluate(lead({ project_type: "commercial", commercial_subtype: t, scope_category: "office" }), at);
    expect(r).toMatchObject({ status: "unqualified", gate_fail: "scope", reengage_rating: "closed" });
  });
  it("commercial size limits", () => {
    const office = (sqft: number) => evaluate(lead({ project_type: "commercial", commercial_subtype: "office", scope_category: "office", carpet_sqft: sqft }), at);
    expect(office(499).status).toBe("unqualified");
    expect(office(500).status).toBe("qualified");
    expect(office(3000).status).toBe("qualified");
    expect(office(5000).status).toBe("unqualified");
  });
  it("big residential villas are fine", () => expect(evaluate(lead({ carpet_sqft: 5500 }), at).status).toBe("qualified"));
  it("out of area is closed", () => expect(evaluate(lead({ location_area: "Mumbai" }), at)).toMatchObject({ gate_fail: "location", reengage_rating: "closed" }));
  it("under 6 weeks fails timeline, warm, re-engage in 4 weeks", () => {
    const r = evaluate(lead({ weeks_to_target: 3, timeline_flexible: false }), at);
    expect(r).toMatchObject({ status: "unqualified", gate_fail: "timeline", reengage_rating: "warm", reengage_date: "2026-11-05" });
  });
  it("re-engage on the date the caller gave", () =>
    expect(evaluate(lead({ weeks_to_target: 2, later_start_date: "2026-11-20" }), at).reengage_date).toBe("2026-11-20"));
  it("target_date is measured from the call date", () => {
    const r = evaluate(lead({ target_date: "2026-11-12", timeline_flexible: false }), at);
    expect(r.weeks_to_target).toBe(5);
    expect(r.gate_fail).toBe("timeline");
  });
});

describe("score bands", () => {
  it("6–8 weeks is partial", () => expect(evaluate(lead({ weeks_to_target: 7 }), at).breakdown?.timeline).toBe(12));
  it("unclear area is partial, still qualified", () => {
    const r = evaluate(lead({ location_area: "Wagholi" }), at);
    expect(r.breakdown?.location).toBe(12);
    expect(r.status).toBe("qualified");
  });
  it("single room + unclear area + 6-8 weeks is borderline", () => {
    const r = evaluate(lead({ scope_category: "single_room", location_area: "Wagholi", weeks_to_target: 7 }), at);
    expect(r.score).toBe(12 + 12 + 12 + 15 + 15);
    expect(r.status).toBe("borderline");
  });
  it("research only + vague scope + unclear area -> two weak, one failed criterion", () => {
    const r = evaluate(lead({ decision_maker: "research", scope_category: "vague", location_area: null, just_exploring: true }), at);
    expect(r.breakdown?.decision_maker).toBe(0);
    expect(r.status).toBe("borderline");
  });
  it("two failed criteria is always unqualified", () => {
    const r = evaluate(lead({ decision_maker: "research", budget_inr: 250000, scope_category: "full_home" }), at);
    expect(r.status).toBe("unqualified");
  });
});

describe("budget and decision-maker", () => {
  it("unknown budget/decision-maker keeps qualified and flags", () => {
    const r = evaluate(lead({ decision_maker: null }), at);
    expect(r.status).toBe("qualified");
    expect(r.flags).toContain("unconfirmed_fields");
  });
  it("tight budget is partial", () => expect(evaluate(lead({ budget_inr: 400000 }), at).breakdown?.budget).toBe(8));
  it("plausible budget is full", () => expect(evaluate(lead({ budget_inr: 1200000 }), at).breakdown?.budget).toBe(15));
  it("₹1.5L for kitchen + room is clearly below -> cold", () =>
    expect(evaluate(lead({ scope_category: "multi_room", rooms_count: 2, budget_inr: 150000 }), at)).toMatchObject({ status: "unqualified", reengage_rating: "cold" }));
  it("represents with owners attending is 10 and flagged", () => {
    const r = evaluate(lead({ decision_maker: "represents", owners_will_attend: true }), at);
    expect(r.breakdown?.decision_maker).toBe(10);
    expect(r.flags).toContain("represented");
  });
});

describe("status routing", () => {
  it("existing client escalates without scoring", () =>
    expect(evaluate(lead({ call_type: "existing_client" }), at)).toMatchObject({ status: "escalated", score: null }));
  it("complaint escalates", () => expect(evaluate(lead({ is_complaint: true }), at).status).toBe("escalated"));
  it("missed call is incomplete", () => expect(evaluate(emptyExtraction(), at).status).toBe("incomplete"));
});

describe("weeksBetween", () => {
  it("counts weeks", () => expect(weeksBetween("2026-10-08", "2026-12-03")).toBe(8));
});

describe("phone transcripts T01–T20 (golden extractions)", () => {
  it.each(PHONE_FIXTURES.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    const r = evaluate(f.golden, new Date(f.callAt));
    expect(r.status).toBe(f.expected.status);
    if (f.expected.gate_fail) expect(r.gate_fail).toBe(f.expected.gate_fail);
    if (f.expected.reengage) expect(r.reengage_rating).toBe(f.expected.reengage);
    for (const flag of f.expected.flags ?? []) expect(r.flags).toContain(flag);
  });
});
