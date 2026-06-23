#!/usr/bin/env tsx
/**
 * One-shot migration: copy data from legacy SQLite (bwt_fleet.db) into PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... SQLITE_FILE=backend/data/bwt_fleet.db pnpm --filter ./backend migrate:sqlite-to-postgres
 *
 * Prerequisites:
 *   - Target Postgres schema already applied (boot app once or run initDatabase)
 *   - Backup both SQLite file and pg_dump before cutover
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.resolve(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sqliteFile =
  process.env.SQLITE_FILE ||
  path.resolve(repoRoot, "backend", "data", "bwt_fleet.db");

const sqlite = new Database(sqliteFile, { readonly: true });
const pool = new pg.Pool({ connectionString: databaseUrl });

type TableSpec = {
  name: string;
  columns: string[];
  coerce?: Record<string, (value: unknown) => unknown>;
};

const TABLES: TableSpec[] = [
  { name: "operations", columns: ["name", "logo_url", "created_at", "updated_at"] },
  {
    name: "plate_registry",
    columns: ["plate", "model", "year", "operation_name", "created_at", "updated_at"],
  },
  {
    name: "users",
    columns: [
      "id",
      "name",
      "email",
      "password_hash",
      "role",
      "auth_provider",
      "active",
      "created_at",
      "updated_at",
      "last_login",
    ],
    coerce: {
      active: (value) => Boolean(value),
      auth_provider: (value) => {
        const provider = String(value || "LOCAL").toUpperCase();
        return provider === "MICROSOFT" ? "LOCAL" : provider;
      },
    },
  },
  {
    name: "user_sessions",
    columns: ["id", "user_id", "token_hash", "created_at", "expires_at", "last_seen_at"],
  },
  {
    name: "oauth_states",
    columns: ["state", "nonce", "code_verifier", "return_to", "created_at", "expires_at"],
  },
  {
    name: "vehicles",
    columns: [
      "id",
      "plate",
      "driver",
      "status",
      "speed",
      "lat",
      "lng",
      "course",
      "last_update",
      "location_name",
      "eta",
      "maintenance_reason",
      "maintenance_type",
      "maintenance_prev_date",
      "maintenance_finished_at",
      "trip_start_time",
      "last_macro",
      "last_macro_time",
      "last_operational_macro",
      "last_operational_macro_time",
      "last_operational_driver",
      "last_operational_location",
      "last_operational_speed",
      "observation",
      "route_origin",
      "route_destination",
      "route_progress_percent",
      "route_timeline_link",
    ],
  },
  {
    name: "maintenance_history",
    columns: [
      "id",
      "plate",
      "driver",
      "reason",
      "location",
      "start_date",
      "finish_date",
      "forecast_date",
    ],
  },
  {
    name: "macros_history",
    columns: [
      "id",
      "plate",
      "driver",
      "macro_id",
      "macro_description",
      "macro_group",
      "created_at",
      "latitude",
      "longitude",
      "city",
      "state",
      "raw_json",
    ],
  },
  {
    name: "fleet_efficiency_history",
    columns: ["id", "timestamp", "efficiency", "total_vehicles", "operational_vehicles"],
  },
];

async function truncateTarget(client: pg.PoolClient) {
  await client.query(`
    TRUNCATE TABLE
      user_sessions,
      oauth_states,
      maintenance_history,
      macros_history,
      fleet_efficiency_history,
      vehicles,
      plate_registry,
      operations,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function migrateTable(client: pg.PoolClient, spec: TableSpec) {
  const rows = sqlite.prepare(`SELECT * FROM ${spec.name}`).all() as Record<string, unknown>[];
  if (!rows.length) {
    console.log(`  ${spec.name}: 0 rows (skip)`);
    return;
  }

  const columns = spec.columns;
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

  for (const row of rows) {
    const values = columns.map((column) => {
      const raw = row[column];
      const coercer = spec.coerce?.[column];
      return coercer ? coercer(raw) : raw;
    });
    await client.query(
      `INSERT INTO ${spec.name} (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  const pgCount = await client.query(`SELECT COUNT(*)::int AS count FROM ${spec.name}`);
  console.log(`  ${spec.name}: ${rows.length} sqlite -> ${pgCount.rows[0].count} postgres`);
}

async function resetSequences(client: pg.PoolClient) {
  const serialTables = [
    "users",
    "user_sessions",
    "maintenance_history",
    "macros_history",
    "fleet_efficiency_history",
  ];

  for (const table of serialTables) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        (SELECT MAX(id) IS NOT NULL FROM ${table})
      )
    `);
  }
}

async function main() {
  console.log(`SQLite source: ${sqliteFile}`);
  console.log(`Postgres target: ${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await truncateTarget(client);

    for (const spec of TABLES) {
      await migrateTable(client, spec);
    }

    await resetSequences(client);
    await client.query("COMMIT");
    console.log("Migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();
