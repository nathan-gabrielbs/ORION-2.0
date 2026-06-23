import pg from "pg";

const DEFAULT_TEST_URL = "postgresql://orion:orion_dev@localhost:5433/orion_test";

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_TEST_URL;
  process.env.DATABASE_URL = databaseUrl;

  const parsed = new URL(databaseUrl);
  const dbName = parsed.pathname.replace(/^\//, "") || "orion_test";
  parsed.pathname = "/postgres";

  const adminPool = new pg.Pool({ connectionString: parsed.toString() });
  try {
    const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if ((exists.rowCount ?? 0) === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await adminPool.end();
  }
}
