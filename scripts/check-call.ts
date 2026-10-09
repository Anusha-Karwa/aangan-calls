// Prints a call's key fields and its activity log. Usage: npx tsx scripts/check-call.ts <call id>
import "./lib";
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
  const id = process.argv[2];
  const [c] = await sql`select caller_name, status, score, asked_price, location_area, email_id, hubspot_deal_id from calls where id = ${id}`;
  console.log(c);
  for (const e of await sql`select type, detail from call_events where call_id = ${id} order by at`) console.log(" -", e.type, JSON.stringify(e.detail).slice(0, 140));
  await sql.end();
}
main();
