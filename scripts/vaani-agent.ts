// Creates (or updates) the Aangan agent in Vaani from prompts/*.md.
//   npx tsx scripts/vaani-agent.ts            create if VAANI_AGENT_ID is empty, else update the prompt
//   npx tsx scripts/vaani-agent.ts --dry-run  print what would be sent
import "./lib";
import fs from "node:fs";

const BASE = "https://api.vaanivoice.ai";
const GREETING = "Hi, this is Aangan Studio's assistant. This call is recorded so our designer has your details. May I know your name?";

export function buildSystemPrompt(): string {
  const agent = fs.readFileSync("prompts/vaani_agent.md", "utf8").trim();
  // Knowledge base without its "paste this" header note. Never includes pricing numbers (see lib/prompts.test.ts).
  const kb = fs.readFileSync("prompts/knowledge_base.md", "utf8").replace(/^#.*\n+(>.*\n)+/m, "").trim();
  return `${agent}\n\n=== STUDIO KNOWLEDGE BASE ===\n${kb}`;
}

async function main() {
  const key = process.env.VAANI_API_KEY;
  if (!key) throw new Error("VAANI_API_KEY not set");
  const persona = {
    identity: {
      system_prompt: buildSystemPrompt(),
      personality: { tone: "warm", style: "brief, natural, one question at a time" },
      greeting_message: { agent_message: GREETING, agent_speech_delay: 1, user_speech_delay: 1, interruptible: true, let_user_speak_first: false },
    },
    senses_capabilities: { language: "en", auto_detect: true },
  };
  const agentId = process.env.VAANI_AGENT_ID;
  const [method, url, body] = agentId
    ? ["PATCH", `${BASE}/api/agent/${agentId}/persona`, persona]
    : ["POST", `${BASE}/api/create-agent`, { agent_display_name: "Aangan Studio Assistant", config: { persona } }];
  if (process.argv.includes("--dry-run")) {
    console.log(method, url, JSON.stringify(body).length, "bytes; prompt chars:", persona.identity.system_prompt.length);
    return;
  }
  const res = await fetch(url, { method, headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vaani ${res.status}: ${text.slice(0, 400)}`);
  const j = JSON.parse(text);
  console.log(agentId ? `Updated persona of agent ${agentId}` : `Created agent ${j.agent_id} (${j.agent_name})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
