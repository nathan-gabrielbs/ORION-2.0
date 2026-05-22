import type Database from "better-sqlite3";

const USERS_UPDATED_AT_TRIGGER = `
  CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`;

const OPERATIONS_AND_PLATES_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS trg_operations_updated_at
  AFTER UPDATE ON operations
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE operations SET updated_at = CURRENT_TIMESTAMP WHERE name = NEW.name;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_plate_registry_updated_at
  AFTER UPDATE ON plate_registry
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE plate_registry SET updated_at = CURRENT_TIMESTAMP WHERE plate = NEW.plate;
  END;
`;

export function applyTriggers(db: Database.Database): void {
  try {
    db.exec(USERS_UPDATED_AT_TRIGGER);
  } catch {
    // Trigger may already exist with a different definition on legacy DBs.
  }

  try {
    db.exec(OPERATIONS_AND_PLATES_TRIGGERS);
  } catch {
    // Same as above — best-effort idempotency for legacy installs.
  }
}
