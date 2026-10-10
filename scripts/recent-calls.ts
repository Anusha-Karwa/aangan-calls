// Prints the most recent real (non-simulated) calls with their transcripts. Usage: npx tsx scripts/recent-calls.ts [n]
import "./lib";
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
  const n = Number(process.argv[2] ?? 3);
  const rows = await sql`select id, vaani_call_id, created_at, duration_sec, status, score, transcript, raw->>'event' as event from calls where vaani_call_id not like 'sim-%' order by created_at desc limit ${n}`;
  console.log(`${rows.length} real call(s)`);
  for (const r of rows) {
    console.log(`\n===== ${r.vaani_call_id} · ${r.created_at.toISOString()} · ${r.duration_sec ?? "?"}s · ${r.status ?? "processing"} ${r.score ?? ""}`);
    console.log(r.transcript ?? "(no transcript)");
  }
  await sql.end();
}
main();
