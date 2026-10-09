import { describe, expect, it } from "vitest";
import { groupPeople } from "./people";
import type { CallRow } from "./types";

const row = (o: Partial<CallRow>): CallRow =>
  ({ id: Math.random().toString(36).slice(2), flags: [], status: "qualified", status_override: null, created_at: "2026-09-01T00:00:00Z", started_at: "2026-09-01T00:00:00Z", phone: null, email: null, caller_name: null, ...o }) as CallRow;

describe("groupPeople", () => {
  it("merges the same phone in different formats", () => {
    const people = groupPeople([
      row({ phone: "+91 98220 14567", caller_name: "Meera", started_at: "2026-09-02T10:00:00Z" }),
      row({ phone: "9822014567", started_at: "2026-09-03T10:00:00Z" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].calls).toHaveLength(2);
    expect(people[0].name).toBe("Meera");
  });
  it("headline call skips a dropped call (T17: cut off, then called back)", () => {
    const people = groupPeople([
      row({ phone: "9800000017", status: "qualified", score: 100, started_at: "2026-09-22T14:16:00Z" }),
      row({ phone: "9800000017", status: "incomplete", started_at: "2026-09-22T14:20:00Z" }),
    ]);
    expect(people[0].latest.status).toBe("qualified");
  });
  it("falls back to email, then keeps unknown callers separate", () => {
    const people = groupPeople([row({ email: "A@x.com" }), row({ email: "a@x.com" }), row({}), row({})]);
    expect(people).toHaveLength(3);
  });
});
