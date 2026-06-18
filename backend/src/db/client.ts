import pg from "pg";
import { requireEnv } from "../shared/env.js";
import { runVersionedMigrations } from "./migration-runner.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

const POOL_CONFIG: pg.PoolConfig = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export function resolveDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseUrl(),
      ...POOL_CONFIG,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | undefined> {
  const result = await query<T>(text, params);
  return result.rows[0];
}

export async function initDatabase(): Promise<pg.Pool> {
  const activePool = getPool();
  await runVersionedMigrations(activePool);
  return activePool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

const TRUNCATE_TABLES = [
  "user_sessions",
  "oauth_states",
  "maintenance_history",
  "macros_history",
  "fleet_efficiency_history",
  "vehicles",
  "plate_registry",
  "operations",
  "users",
];

export async function resetTestDatabase(): Promise<void> {
  const tables = TRUNCATE_TABLES.join(", ");
  await query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
