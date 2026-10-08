// Applies db/migrations/*.sql in order. Usage: npm run migrate
import "dotenv/config";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL is not set: the app uses the local JSON store in .data/. Nothing to migrate.");
    return;
  }
  const sql = postgres(url, { ssl: "require", max: 1 });
  const dir = path.join(process.cwd(), "db", "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    console.log("applying", file);
    await sql.unsafe(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  await sql.end();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
