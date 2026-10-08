// Posts transcripts to the webhook as fake Vaani "call.completed" events (signed if a secret is set).
// Usage:
//   npx tsx scripts/simulate-call.ts T01 T09 T10        (files in knowledge/transcripts)
//   npx tsx scripts/simulate-call.ts --all-phone
//   BASE=https://your-app.vercel.app npx tsx scripts/simulate-call.ts T01
import { config } from "dotenv";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

const BASE = process.env.BASE ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
const DIR = path.join(process.cwd(), "knowledge", "transcripts");

function callMeta(text: string) {
  // Header looks like: "T05 · Phone · 5 September · 10:52am · 6 min 44 sec"
  const head = text.split("\n")[0];
  const d = /(\d{1,2}) (September|October)/.exec(head);
  const t = /(\d{1,2}):(\d{2})(am|pm)/.exec(head);
  const m = /(\d+) min (\d+) sec/.exec(head);
  const day = d ? Number(d[1]) : 1;
  const month = d?.[2] === "October" ? 10 : 9;
  let hour = t ? Number(t[1]) % 12 : 11;
  if (t?.[3] === "pm") hour += 12;
  const iso = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${t?.[2] ?? "00"}:00+05:30`;
  return { startedAt: iso, durationSec: m ? Number(m[1]) * 60 + Number(m[2]) : 0 };
}

async function send(id: string) {
  const text = fs.readFileSync(path.join(DIR, `${id}.txt`), "utf8");
  const meta = callMeta(text);
  const body = JSON.stringify({
    id: `evt_sim_${id}_${Date.now()}`,
    type: "call.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      call_id: `sim-${id}`,
      started_at: meta.startedAt,
      duration_sec: meta.durationSec,
      transcript: text.split("\n").slice(1).join("\n").trim(),
      recording_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      caller_phone: "+9198" + String(Math.abs(hash(id))).padStart(8, "0").slice(0, 8),
    },
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (secret) headers["X-VaaniVoice-Signature"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(`${BASE}/api/vaani/webhook?sync=1`, { method: "POST", headers, body });
  console.log(id.padEnd(4), res.status, await res.text());
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

async function main() {
  let ids = process.argv.slice(2);
  if (ids.includes("--all-phone")) ids = Array.from({ length: 20 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
  if (!ids.length) ids = ["T01"];
  for (const id of ids) await send(id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
