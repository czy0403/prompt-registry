import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type pg from "pg";
import { loadDatabaseUrl } from "../config.js";
import { createPool } from "./pool.js";

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const migrationDir = resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const alreadyApplied = await pool.query(
      "SELECT 1 FROM schema_migration WHERE version = $1",
      [file],
    );
    if (alreadyApplied.rowCount) {
      continue;
    }

    const sql = await readFile(resolve(migrationDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migration (version) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  const pool = createPool(loadDatabaseUrl());
  try {
    await runMigrations(pool);
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
