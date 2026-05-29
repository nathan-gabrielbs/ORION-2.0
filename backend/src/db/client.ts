import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { resolveDatabaseFile } from "../shared/paths.js";
import { applyLegacyMigrations } from "./migrations.js";
import { applySchema } from "./schema.js";
import { applyTriggers } from "./triggers.js";

function ensureDatabaseDirectory(databaseFile: string): void {
  if (databaseFile === ":memory:") return;

  const dir = path.dirname(databaseFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createDatabase(databaseFile = resolveDatabaseFile()): Database.Database {
  ensureDatabaseDirectory(databaseFile);

  const db = new Database(databaseFile);
  applySchema(db);
  applyLegacyMigrations(db);
  applyTriggers(db);

  return db;
}
