import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../test/helpers/database.js";
import { makePasswordHash } from "./password.js";
import { createAuthService, normalizeEmail } from "./service.js";

describe("createAuthService", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function createService() {
    db = createTestDatabase();
    return createAuthService(db);
  }

  function insertLocalUser(email: string, password: string) {
    db.prepare(
      `
      INSERT INTO users (name, email, password_hash, role, auth_provider, active)
      VALUES (?, ?, ?, 'USER', 'LOCAL', 1)
    `,
    ).run("Test User", email, makePasswordHash(password));
  }

  it("normalizes email to lowercase trimmed value", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalizeEmail("")).toBe("");
  });

  it("sanitizes user row without password hash", () => {
    const auth = createService();
    insertLocalUser("user@test.com", "password123");

    const row = auth.getUserByEmail("user@test.com");
    expect(row).toBeDefined();

    const sanitized = auth.sanitizeUserRow(row!);
    expect(sanitized).toEqual({
      id: row!.id,
      name: "Test User",
      email: "user@test.com",
      role: "USER",
      auth_provider: "LOCAL",
      active: 1,
    });
    expect(sanitized).not.toHaveProperty("password_hash");
  });

  it("creates session and resolves auth user from token", () => {
    const auth = createService();
    insertLocalUser("user@test.com", "password123");

    const row = auth.getUserByEmail("user@test.com")!;
    const token = auth.createSession(row.id as number);

    const authUser = auth.getAuthUserFromToken(token);
    expect(authUser).toMatchObject({
      email: "user@test.com",
      role: "USER",
      auth_provider: "LOCAL",
      active: 1,
    });
  });

  it("returns null for revoked or unknown session token", () => {
    const auth = createService();
    insertLocalUser("user@test.com", "password123");

    const row = auth.getUserByEmail("user@test.com")!;
    const token = auth.createSession(row.id as number);

    auth.revokeSession(token);
    expect(auth.getAuthUserFromToken(token)).toBeNull();
    expect(auth.getAuthUserFromToken("invalid-token")).toBeNull();
  });

  it("updates last login timestamp on touchLastLogin", () => {
    const auth = createService();
    insertLocalUser("user@test.com", "password123");

    const row = auth.getUserByEmail("user@test.com")!;
    expect(row.last_login).toBeNull();

    auth.touchLastLogin(row.id as number);

    const updated = auth.getUserByEmail("user@test.com")!;
    expect(updated.last_login).not.toBeNull();
  });
});
