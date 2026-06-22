import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type pg from "pg";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

function listMigrationFiles(): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export async function runVersionedMigrations(pool: pg.Pool): Promise<void> {
  const files = listMigrationFiles();
  if (files.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    for (const filename of files) {
      const applied = await isMigrationApplied(client, filename);
      if (applied) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [filename],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function isMigrationApplied(client: pg.PoolClient, filename: string): Promise<boolean> {
  try {
    const result = await client.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
      [filename],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") {
      return false;
    }
    throw error;
  }
}
