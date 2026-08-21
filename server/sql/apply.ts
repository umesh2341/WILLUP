/**
 * apply.ts — apply Supabase-specific SQL files that Prisma cannot own:
 *   01_auth_trigger.sql  — username generation trigger on auth.users
 *   02_rls_policies.sql  — Row-Level Security policies using auth.uid()
 *
 * Usage:  npx tsx sql/apply.ts
 * Requires DIRECT_URL in server/.env (port 5432, session-mode pooler)
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const SQL_DIR = path.join(__dirname);
const FILES = ["01_auth_trigger.sql", "02_rls_policies.sql", "03_grants.sql", "04_storage.sql"];


async function main() {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  console.log("Connected to Supabase via DIRECT_URL\n");

  for (const file of FILES) {
    const filePath = path.join(SQL_DIR, file);
    const sql = fs.readFileSync(filePath, "utf8");
    console.log(`--- Applying ${file} ---`);
    try {
      await client.query(sql);
      console.log(`✔ ${file} applied successfully\n`);
    } catch (err: any) {
      console.error(`✘ ${file} failed: ${err.message}\n`);
      process.exitCode = 1;
    }
  }

  await client.end();
}

main();
