// 4b. Simulated-caller role-play. Gemini plays the caller; a second Gemini call plays the
// agent using prompts/vaani_agent.md + prompts/knowledge_base.md in text mode.
//   npm run roleplay                 all scenarios
//   npm run roleplay -- price nashik only scenarios whose key matches
// Needs GEMINI_API_KEY. Each transcript is then piped through extract -> rubric (4a).
import fs from "node:fs";
import path from "node:path";
import { extract } from "../lib/extract";
import { generateText } from "../lib/gemini";
import { evaluate } from "../lib/rubric";
import { table, writeResultsSection } from "./lib";

type Ending = "booked" | "declined" | "escalated";
interface Scenario {
  key: string;
  persona: string;
  expectEnding: Ending;
  expectStatus: string[];
}

const SCENARIOS: Scenario[] = [
  { key: "clean-kothrud", expectEnding: "booked", expectStatus: ["qualified"], persona: "You are Meera Joshi. You own a 3BHK (about 1,250 sq ft carpet, builder finish) in Kothrud. You want the full home done: kitchen, wardrobes, living room, three bedrooms. You'd like it finished by April next year. You and your husband decide; he's fine with you booking. Found the studio on Instagram. Email meera.joshi@gmail.com, phone 98220 14567. Prefer a site visit on a weekday morning." },
  { key: "price-pusher", expectEnding: "booked", expectStatus: ["qualified"], persona: "You are Rahul Mehta, 2BHK in Baner, 900 sq ft, lived-in, want kitchen + both bedrooms + living redone by March. You keep asking for a price: per sq ft rate, a ballpark, 'just a range', 'what did the last 2BHK cost'. Push at least three times before agreeing to book. Email rahul.m@outlook.com, phone 99700 22113. Studio visit is fine." },
  { key: "nashik", expectEnding: "declined", expectStatus: ["unqualified"], persona: "You are Suresh Patil. Your bungalow is in Nashik (Gangapur Road). You want full interiors. Ask if they can still do it since Nashik isn't far. Be polite." },
  { key: "advice-only", expectEnding: "declined", expectStatus: ["unqualified"], persona: "You are Kavita, living in Aundh. You only want someone to come and suggest colours and furniture arrangement for your living room. You will do the work yourself. You are not interested in a full project." },
  { key: "diwali-3-weeks", expectEnding: "declined", expectStatus: ["unqualified"], persona: "You are Amit, 2BHK in Wakad. You want the living room and kitchen redone and finished before Diwali, which is in 3 weeks. Insist it must be done before Diwali. If they offer to note you for later, say maybe." },
  { key: "angry-client", expectEnding: "escalated", expectStatus: ["escalated"], persona: "You are Sheetal Deshpande, an EXISTING client. Your 2BHK in Viman Nagar project has been running three months and your designer Aryan hasn't replied in five days. You are angry and want to speak to Nikhil or someone senior right now. Your number is 98900 55621." },
  { key: "low-budget", expectEnding: "declined", expectStatus: ["unqualified"], persona: "You are Pooja, 1BHK in Kharadi, 550 sq ft. You want the kitchen and one bedroom done, and early in the call you say your budget is ₹1.5 lakh maximum for everything, and you won't go above it." },
  { key: "son-for-parents", expectEnding: "booked", expectStatus: ["qualified", "borderline"], persona: "You are Karan, calling for your parents' new 3BHK in Hadapsar (bare, just got possession, around 1,100 sq ft). They want the full home designed, no hurry, maybe by May. Your parents will decide and both will attend the consultation. You'll book a site visit on Saturday. Email karan.s@yahoo.com, phone 97300 88001. Heard via Google." },
  { key: "restaurant", expectEnding: "declined", expectStatus: ["unqualified"], persona: "You are Farhan, opening a 1,800 sq ft restaurant in Koregaon Park in four months. You loved the studio's Instagram and want them to design the interiors." },
  { key: "rude-hinglish", expectEnding: "booked", expectStatus: ["qualified", "borderline"], persona: "You speak in Hinglish (mix Hindi and English) and you're curt and a bit rude ('jaldi bolo yaar', 'time waste mat karo'). You are Vikas, 3BHK flat in Pimple Saudagar, 1,100 sq ft, poora ghar karwana hai including kitchen, done by February. You decide. Email vikas.k@gmail.com, phone 98811 70011. Studio visit." },
  { key: "grey-area", expectEnding: "booked", expectStatus: ["qualified", "borderline"], persona: "You are Neha. You're unsure about everything: maybe the living room, maybe also the bedroom; the flat is 'somewhere near Wagholi, or maybe Kharadi side'; you don't know the size; timeline 'sometime next year probably'; you'd need to check with your husband. Answer vaguely but eventually agree to book a studio visit. Email neha.p@gmail.com, phone 90110 34567." },
];

const AGENT_TEXT_MODE = `

TEXT-MODE TEST HARNESS (not part of the real deployment):
- This is a text simulation of a phone call. Reply with ONLY what you would say aloud.
- You have no live calendar. When booking, offer these slots: tomorrow 11:00 am, tomorrow 4:00 pm, day after 12:00 pm (IST). When the caller picks one and details are confirmed, say the booking is done.
- Call transfer is NOT available (it is outside office hours).
- When the call is over, end your final message with the token [END].`;

const CALLER_RULES = `You are role-playing a person phoning an interior design studio. Stay in character. Reply with ONLY what you say aloud, 1–2 short sentences, like a real phone call. Do not narrate actions. Don't volunteer every detail at once; answer what you are asked. If the assistant says goodbye, say bye and add [END].`;

// Any price figure from the agent is an automatic FAIL.
const PRICE_RE = /(₹|rs\.?|inr|rupees?)\s?\d|\d[\d,.]*\s?(lakh|lac|lakhs|crore|k\b|thousand|per\s?sq|\/\s?sq|rupees)|starts? (at|from)|ballpark (is|of)|per square f(oo|ee)t (is|costs?)/i;

function analyse(turns: { who: "Agent" | "Caller"; text: string }[]) {
  const agent = turns.filter((t) => t.who === "Agent").map((t) => t.text);
  const all = agent.join("\n").toLowerCase();
  const priceHits = agent.filter((t) => PRICE_RE.test(t));
  const multiQ = agent.filter((t) => (t.match(/\?/g) ?? []).length > 1);
  const ending: Ending | "unclear" =
    /senior|call you back within 15|callback|call you back/.test(all) && /sorry|apolog/.test(all) && !/booked|calendar invite/.test(all) ? "escalated"
      : /calendar invite|is booked|booked (you|your|it)|confirmed for|have booked/.test(all) ? "booked"
      : /right fit|not be able|unable to take|outside (our|the) (service )?area|don't (do|take|offer)|do not (do|take)|can't take|cannot take/.test(all) ? "declined"
      : "unclear";
  const spelledEmail = agent.some((t) => /\b[a-z](\s?[-–.]\s?|\s)[a-z](\s?[-–.]\s?|\s)[a-z]\b/i.test(t) || /dot com|at gmail|at the rate/i.test(t));
  const readBack = agent.some((t) => /(tomorrow|day after|\d{1,2}(:\d{2})?\s?(am|pm))/i.test(t) && /(confirm|so that's|to recap|just to|read back|summar)/i.test(t));
  return { priceHits, multiQ: multiQ.length, agentTurns: agent.length, ending, spelledEmail, readBack };
}

async function runScenario(s: Scenario, agentSystem: string) {
  const turns: { who: "Agent" | "Caller"; text: string }[] = [];
  const render = () => turns.map((t) => `${t.who}: ${t.text}`).join("\n");
  turns.push({ who: "Agent", text: "Hi, this is Aangan Studio's assistant. This call is recorded so our designer has your details. May I know your name?" });

  for (let i = 0; i < 22; i++) {
    const caller = await generateText({ system: `${CALLER_RULES}\n\nYOUR CHARACTER:\n${s.persona}`, prompt: `Conversation so far (you are "Caller"):\n${render()}\n\nCaller:`, temperature: 0.8 });
    turns.push({ who: "Caller", text: caller.replace(/^caller:\s*/i, "") });
    if (/\[END\]/.test(caller)) break;
    const agent = await generateText({ system: agentSystem, prompt: `Conversation so far (you are "Agent"):\n${render()}\n\nAgent:`, temperature: 0.4 });
    turns.push({ who: "Agent", text: agent.replace(/^agent:\s*/i, "") });
    if (/\[END\]/.test(agent)) break;
  }
  const clean = turns.map((t) => ({ ...t, text: t.text.replace(/\s*\[END\]\s*/g, "").trim() }));
  return clean;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    const msg = "Role-play needs GEMINI_API_KEY (Gemini plays both caller and agent). Add it to .env.local and run `npm run roleplay`.";
    console.log(msg);
    writeResultsSection("roleplay", "4b. Simulated-caller role-play", `_Pending: ${msg}_\n\nScenarios: ${SCENARIOS.map((s) => s.key).join(", ")}`);
    return;
  }
  const filter = process.argv.slice(2);
  const scenarios = filter.length ? SCENARIOS.filter((s) => filter.some((f) => s.key.includes(f))) : SCENARIOS;
  const agentSystem = fs.readFileSync("prompts/vaani_agent.md", "utf8") + "\n\nKNOWLEDGE BASE:\n" + fs.readFileSync("prompts/knowledge_base.md", "utf8") + AGENT_TEXT_MODE;
  const outDir = path.join("scripts", "out", "roleplay");
  fs.mkdirSync(outDir, { recursive: true });

  const rows: (string | number)[][] = [];
  let fails = 0;
  for (const s of scenarios) {
    process.stdout.write(`${s.key} … `);
    const turns = await runScenario(s, agentSystem);
    const transcript = turns.map((t) => `${t.who === "Caller" ? "Caller" : "Agent"}: ${t.text}`).join("\n");
    fs.writeFileSync(path.join(outDir, `${s.key}.txt`), transcript + "\n");
    const a = analyse(turns);
    const ex = await extract(transcript, new Date());
    const r = evaluate(ex.extraction, new Date());
    const status = ex.ok ? r.status : "incomplete";

    const problems: string[] = [];
    if (a.priceHits.length) problems.push(`PRICE SPOKEN: "${a.priceHits[0].slice(0, 80)}"`);
    if (a.ending !== s.expectEnding) problems.push(`ending ${a.ending}≠${s.expectEnding}`);
    if (!s.expectStatus.includes(status)) problems.push(`status ${status}∉${s.expectStatus.join("/")}`);
    if (s.expectEnding === "booked" && !a.spelledEmail) problems.push("email not spelled back");
    if (s.expectEnding === "booked" && !a.readBack) problems.push("no read-back");
    if (a.multiQ > 1) problems.push(`${a.multiQ} turns with >1 question`);
    if (problems.length) fails++;
    console.log(problems.length ? `❌ ${problems.join("; ")}` : "✅");

    rows.push([
      s.key, a.ending, s.expectEnding, status, r.score ?? "-", a.priceHits.length ? "❌ FAIL" : "✅ none",
      `${a.agentTurns - a.multiQ}/${a.agentTurns}`, a.spelledEmail ? "yes" : "no", a.readBack ? "yes" : "no", problems.length ? `❌ ${problems.join("; ")}` : "✅",
    ]);
  }
  const body = `**Passed:** ${scenarios.length - fails}/${scenarios.length}. Transcripts in \`scripts/out/roleplay/\`.\n\n` +
    table(["scenario", "ending", "expected", "status (4a)", "score", "price spoken", "1-question turns", "email spelled", "read-back", "result"], rows);
  writeResultsSection("roleplay", "4b. Simulated-caller role-play", body);
  console.log(`\n${scenarios.length - fails}/${scenarios.length} passed. Wrote eval-results.md`);
  if (fails) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
