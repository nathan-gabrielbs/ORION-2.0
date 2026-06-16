import type Database from "better-sqlite3";

// Legacy idempotent migrations kept for databases created before columns were
// added to CREATE TABLE. Target (Fase 6): versioned SQL files with a runner.
const LEGACY_MIGRATIONS = [
  "ALTER TABLE vehicles ADD COLUMN maintenance_finished_at DATETIME",
  "ALTER TABLE vehicles ADD COLUMN trip_start_time DATETIME",
  "ALTER TABLE vehicles ADD COLUMN last_macro TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_macro_time TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_operational_macro TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_operational_macro_time TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_operational_driver TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_operational_location TEXT",
  "ALTER TABLE vehicles ADD COLUMN last_operational_speed INTEGER",
  "ALTER TABLE vehicles ADD COLUMN observation TEXT",
  "ALTER TABLE vehicles ADD COLUMN course REAL",
  "ALTER TABLE vehicles ADD COLUMN route_origin TEXT",
  "ALTER TABLE vehicles ADD COLUMN route_destination TEXT",
  "ALTER TABLE vehicles ADD COLUMN route_progress_percent REAL",
  "ALTER TABLE vehicles ADD COLUMN route_timeline_link TEXT",
  // Orbital OIDC PKCE state — added to the pre-existing oauth_states table.
  "ALTER TABLE oauth_states ADD COLUMN nonce TEXT",
  "ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT",
  "ALTER TABLE oauth_states ADD COLUMN return_to TEXT",
];

const TARGET_AUTH_PROVIDER_CHECK = "CHECK(auth_provider IN ('LOCAL','ORBITAL'))";

export function applyLegacyMigrations(db: Database.Database): void {
  for (const sql of LEGACY_MIGRATIONS) {
    try {
      db.prepare(sql).run();
    } catch {
      // Column already exists — expected on fresh installs where CREATE TABLE
      // already includes the column.
    }
  }

  migrateUsersAuthProviderConstraint(db);
}

function getUsersTableDdl(db: Database.Database): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql: string | null } | undefined;
  return row?.sql ?? "";
}

function rebuildUsersTable(db: Database.Database): void {
  const foreignKeysEnabled = db.pragma("foreign_keys", { simple: true }) === 1;
  db.pragma("foreign_keys = OFF");

  try {
    const rebuild = db.transaction(() => {
      // Legacy Microsoft direct-SSO users are migrated to Orbital provider.
      db.exec(`UPDATE users SET auth_provider = 'ORBITAL' WHERE auth_provider = 'MICROSOFT'`);

      db.exec(`
        CREATE TABLE users_auth_provider_migration (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
          auth_provider TEXT NOT NULL DEFAULT 'LOCAL' ${TARGET_AUTH_PROVIDER_CHECK},
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        );

        INSERT INTO users_auth_provider_migration
          (id, name, email, password_hash, role, auth_provider, active, created_at, updated_at, last_login)
        SELECT id, name, email, password_hash, role, auth_provider, active, created_at, updated_at, last_login
        FROM users;

        DROP TABLE users;
        ALTER TABLE users_auth_provider_migration RENAME TO users;

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);
    });

    rebuild();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
  }
}

/**
 * Rebuilds the `users` table when its `auth_provider` CHECK constraint is
 * outdated. SQLite can't ALTER a CHECK constraint in place.
 *
 * Triggers rebuild when:
 *   - 'ORBITAL' is missing (pre-Orbital databases), or
 *   - 'MICROSOFT' is still accepted (legacy direct Entra SSO, removed in favor
 *     of Orbital OIDC).
 *
 * Idempotent: skips when the stored DDL already matches LOCAL + ORBITAL only.
 */
function migrateUsersAuthProviderConstraint(db: Database.Database): void {
  const ddl = getUsersTableDdl(db);
  if (!ddl || !ddl.includes("auth_provider")) return;

  const hasOrbital = ddl.includes("'ORBITAL'");
  const hasMicrosoft = ddl.includes("'MICROSOFT'");
  if (hasOrbital && !hasMicrosoft) return;

  rebuildUsersTable(db);
}
