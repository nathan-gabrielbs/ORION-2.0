import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyLegacyMigrations } from "./migrations.js";

const LEGACY_MICROSOFT_ONLY_DDL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
    auth_provider TEXT NOT NULL DEFAULT 'LOCAL' CHECK(auth_provider IN ('LOCAL','MICROSOFT')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
`;

const ORBITAL_AND_MICROSOFT_DDL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
    auth_provider TEXT NOT NULL DEFAULT 'LOCAL' CHECK(auth_provider IN ('LOCAL','MICROSOFT','ORBITAL')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
`;

describe("migrateUsersAuthProviderConstraint (via applyLegacyMigrations)", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function makeDb(ddl: string, seed?: () => void) {
    db = new Database(":memory:");
    db.exec(ddl);
    seed?.();
    return db;
  }

  it("adds ORBITAL to legacy MICROSOFT-only constraint", () => {
    makeDb(LEGACY_MICROSOFT_ONLY_DDL, () => {
      db.prepare(
        `INSERT INTO users (name, email, password_hash, role, auth_provider) VALUES (?, ?, ?, ?, ?)`,
      ).run("Local Admin", "admin@grpotencial.com.br", "scrypt$x$y", "ADMIN", "LOCAL");
    });

    expect(() =>
      db
        .prepare(`INSERT INTO users (name, email, auth_provider) VALUES (?, ?, ?)`)
        .run("Orbital User", "orbital@grpotencial.com.br", "ORBITAL"),
    ).toThrow();

    applyLegacyMigrations(db);

    expect(() =>
      db
        .prepare(`INSERT INTO users (name, email, auth_provider) VALUES (?, ?, ?)`)
        .run("Orbital User", "orbital@grpotencial.com.br", "ORBITAL"),
    ).not.toThrow();
  });

  it("migrates legacy MICROSOFT users to ORBITAL and drops MICROSOFT from CHECK", () => {
    makeDb(ORBITAL_AND_MICROSOFT_DDL, () => {
      db.prepare(`INSERT INTO users (name, email, auth_provider) VALUES (?, ?, ?)`).run(
        "Legacy MS",
        "legacy@grpotencial.com.br",
        "MICROSOFT",
      );
    });

    applyLegacyMigrations(db);

    const row = db
      .prepare(`SELECT auth_provider FROM users WHERE email = ?`)
      .get("legacy@grpotencial.com.br") as { auth_provider: string };
    expect(row.auth_provider).toBe("ORBITAL");

    expect(() =>
      db
        .prepare(`INSERT INTO users (name, email, auth_provider) VALUES (?, ?, ?)`)
        .run("Bad", "bad@grpotencial.com.br", "MICROSOFT"),
    ).toThrow();
  });

  it("is idempotent (running twice is a no-op)", () => {
    makeDb(LEGACY_MICROSOFT_ONLY_DDL);
    applyLegacyMigrations(db);
    expect(() => applyLegacyMigrations(db)).not.toThrow();
  });
});
