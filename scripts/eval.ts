// 4a. Transcript evals: every transcript -> extract -> rubric, checked against the expected outcomes.
//   npm run eval                 Gemini if GEMINI_API_KEY is set, else the heuristic mock extractor
//   npm run eval -- --fixtures   hand-labelled golden extractions (tests the rubric alone)
//   npm run eval -- T01 T07      only some transcripts
import fs from "node:fs";
import { extract } from "../lib/extract";
import { PHONE_FIXTURES } from "../lib/fixtures/phone";
import { evaluate } from "../lib/rubric";
import { headerDate, readTranscript, table, TRANSCRIPT_DIR, writeResultsSection } from "./lib";

const args = process.argv.slice(2);
const useFixtures = args.includes("--fixtures");
const only = args.filter((a) => /^[TWF]\d{2}$/.test(a));
const mode = useFixtures ? "fixtures" : process.env.GEMINI_API_KEY ? "gemini" : "heuristic";

const expectedById = new Map(PHONE_FIXTURES.map((f) => [f.id, f]));
const ids = fs
  .readdirSync(TRANSCRIPT_DIR)
  .map((f) => f.replace(".txt", ""))
  .filter((id) => (only.length ? only.includes(id) : useFixtures ? id.startsWith("T") : true))
  .sort((a, b) => "TWF".indexOf(a[0]) - "TWF".indexOf(b[0]) || a.localeCompare(b));

const GOOD = new Set(["qualified", "borderline"]);

async function main() {
  console.log(`Eval mode: ${mode} · ${ids.length} transcripts\n`);
  const rows: (string | number | null)[][] = [];
  let checked = 0, passed = 0;
  const fn: string[] = [], fp: string[] = [], mismatches: string[] = [];

  for (const id of ids) {
    const text = readTranscript(id);
    const callAt = headerDate(text);
    const fx = expectedById.get(id);
    let x, unconfirmed: string[] = [], ok = true;
    if (useFixtures) x = fx!.golden;
    else {
      const r = await extract(text.split("\n").slice(1).join("\n"), callAt);
      x = r.extraction;
      unconfirmed = r.unconfirmed;
      ok = r.ok;
    }
    const res = evaluate(x, callAt);
    const status = ok ? res.status : "incomplete";
    const flags = new Set([...res.flags, ...(unconfirmed.length ? ["unconfirmed_fields"] : [])]);

    let verdict = "";
    if (fx) {
      const e = fx.expected;
      const problems: string[] = [];
      if (status !== e.status) problems.push(`status ${status}≠${e.status}`);
      if (e.gate_fail && res.gate_fail !== e.gate_fail) problems.push(`gate ${res.gate_fail}≠${e.gate_fail}`);
      if (e.reengage && res.reengage_rating !== e.reengage) problems.push(`reengage ${res.reengage_rating}≠${e.reengage}`);
      for (const f of e.flags ?? []) if (!flags.has(f)) problems.push(`missing flag ${f}`);
      if (e.asked_price && !x.asked_price) problems.push("asked_price false");
      checked++;
      if (!problems.length) passed++;
      else mismatches.push(`${id}: ${problems.join(", ")}`);
      if (GOOD.has(e.status) && !GOOD.has(status)) fn.push(id);
      if (!GOOD.has(e.status) && GOOD.has(status)) fp.push(id);
      verdict = problems.length ? `❌ ${problems.join("; ")}` : "✅";
    }

    rows.push([
      id, status, res.score, res.gate_fail, res.reengage_rating, x.location_area, x.scope_category, res.weeks_to_target,
      x.decision_maker, x.budget_inr, x.asked_price ? "yes" : "", [...flags].join(","), verdict,
    ]);
    process.stdout.write(`${id} ${status.padEnd(11)} ${String(res.score ?? "-").padStart(3)} ${verdict}\n`);
  }

  const headers = ["id", "status", "score", "gate", "reengage", "area", "scope", "wks", "dm", "budget", "price?", "flags", "check"];
  const summary = [
    `**Mode:** ${mode}${mode === "gemini" ? ` (${process.env.GEMINI_MODEL || "default model"})` : ""}`,
    `**Phone-call match rate:** ${passed}/${checked} (${checked ? Math.round((passed / checked) * 100) : 0}%)`,
    `**False negatives** (should book, didn't): ${fn.length ? fn.join(", ") : "none"}`,
    `**False positives** (shouldn't book, would): ${fp.length ? fp.join(", ") : "none"}`,
    mismatches.length ? `\n**Mismatches**\n${mismatches.map((m) => `- ${m}`).join("\n")}` : "",
  ].join("  \n");

  console.log(`\n${summary.replace(/\*\*/g, "")}`);
  writeResultsSection(`eval-${mode}`, `4a. Transcript eval (${mode})`, `${summary}\n\n${table(headers, rows)}`);
  console.log("\nWrote eval-results.md");
  if (fn.length || fp.length || mismatches.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
