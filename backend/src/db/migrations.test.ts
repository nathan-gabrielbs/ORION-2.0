import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getPool, initDatabase } from "./client.js";
import { runVersionedMigrations } from "./migration-runner.js";

describe("runVersionedMigrations", () => {
  beforeEach(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || "postgresql://orion:orion_dev@localhost:5433/orion_test";
    await initDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it("creates schema_migrations and core tables", async () => {
    const pool = getPool();

    const migrations = await pool.query(
      "SELECT filename FROM schema_migrations ORDER BY filename ASC",
    );
    expect(migrations.rows.map((row) => row.filename)).toEqual([
      "0001_schema_migrations.sql",
      "0002_initial_schema.sql",
    ]);

    const tables = await pool.query<{ tablename: string }>(
      `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('users', 'vehicles', 'oauth_states')
      ORDER BY tablename ASC
    `,
    );
    expect(tables.rows.map((row) => row.tablename)).toEqual(["oauth_states", "users", "vehicles"]);
  });

  it("does not re-apply migrations on second run", async () => {
    const pool = getPool();
    const before = await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
    await runVersionedMigrations(pool);
    const after = await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
