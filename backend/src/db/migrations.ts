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
];

export function applyLegacyMigrations(db: Database.Database): void {
  for (const sql of LEGACY_MIGRATIONS) {
    try {
      db.prepare(sql).run();
    } catch {
      // Column already exists — expected on fresh installs where CREATE TABLE
      // already includes the column.
    }
  }
}
