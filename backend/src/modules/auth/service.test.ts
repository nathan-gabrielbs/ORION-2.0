import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  createTestDatabase,
  resetTestDatabase,
} from "../../test/helpers/database.js";
import { query } from "../../db/client.js";
import { createAuthService, normalizeEmail } from "./service.js";

describe("createAuthService", () => {
  beforeEach(async () => {
    await createTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
  });

  async function insertUser(email: string) {
    await query(
      `
      INSERT INTO users (name, email, role, auth_provider, active)
      VALUES ($1, $2, 'USER', 'ORBITAL', TRUE)
    `,
      ["Test User", email],
    );
  }

  it("normalizes email to lowercase trimmed value", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalizeEmail("")).toBe("");
  });

  it("sanitizes user row without password hash", async () => {
    const auth = createAuthService();
    await insertUser("user@test.com");

    const row = await auth.getUserByEmail("user@test.com");
    expect(row).toBeDefined();

    const sanitized = auth.sanitizeUserRow(row!);
    expect(sanitized).toEqual({
      id: row!.id,
      name: "Test User",
      email: "user@test.com",
      role: "USER",
      auth_provider: "ORBITAL",
      active: 1,
    });
    expect(sanitized).not.toHaveProperty("password_hash");
  });

  it("creates session and resolves auth user from token", async () => {
    const auth = createAuthService();
    await insertUser("user@test.com");

    const row = (await auth.getUserByEmail("user@test.com"))!;
    const token = await auth.createSession(row.id as number);

    const authUser = await auth.getAuthUserFromToken(token);
    expect(authUser).toMatchObject({
      email: "user@test.com",
      role: "USER",
      auth_provider: "ORBITAL",
      active: 1,
    });
  });

  it("returns null for revoked or unknown session token", async () => {
    const auth = createAuthService();
    await insertUser("user@test.com");

    const row = (await auth.getUserByEmail("user@test.com"))!;
    const token = await auth.createSession(row.id as number);

    await auth.revokeSession(token);
    expect(await auth.getAuthUserFromToken(token)).toBeNull();
    expect(await auth.getAuthUserFromToken("invalid-token")).toBeNull();
  });

  it("updates last login timestamp on touchLastLogin", async () => {
    const auth = createAuthService();
    await insertUser("user@test.com");

    const row = (await auth.getUserByEmail("user@test.com"))!;
    expect(row.last_login).toBeNull();

    await auth.touchLastLogin(row.id as number);

    const updated = await auth.getUserByEmail("user@test.com");
    expect(updated!.last_login).not.toBeNull();
  });
});
