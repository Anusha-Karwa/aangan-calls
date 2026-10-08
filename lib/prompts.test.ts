import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guard: nothing from the internal price guide may reach the voice agent.
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const AGENT_FILES = ["prompts/vaani_agent.md", "prompts/knowledge_base.md"];
const PRICE_FIGURES = ["1,800", "2,400", "3,500", "1,200", "2,800", "4,000", "3.5 lakh", "8 lakh", "per sq ft"];

describe("agent prompts contain no pricing", () => {
  it.each(AGENT_FILES)("%s", (file) => {
    const text = read(file).toLowerCase();
    for (const fig of PRICE_FIGURES) expect(text, `found "${fig}"`).not.toContain(fig.toLowerCase());
    // The only rupee amount allowed is the caller-side example of a too-low budget.
    const rupees = text.match(/₹\s?[\d.,–-]+\s*(lakh|crore|k)?/g) ?? [];
    expect(rupees.every((r) => r.startsWith("₹1–1.5"))).toBe(true);
  });

  it("deflection line is verbatim in both", () => {
    const line = "Pricing depends on the site, the materials you choose, and the scope";
    for (const f of AGENT_FILES) expect(read(f)).toContain(line);
  });
});
