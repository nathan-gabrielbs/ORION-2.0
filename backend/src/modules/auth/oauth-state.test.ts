import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "../../db/client.js";
import {
  closeDatabase,
  createTestDatabase,
  resetTestDatabase,
} from "../../test/helpers/database.js";
import { createOAuthStateService } from "./oauth-state.js";

describe("createOAuthStateService (Orbital PKCE state)", () => {
  beforeEach(async () => {
    await createTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
  });

  it("saves and consumes a PKCE state once (single-use)", async () => {
    const oauth = createOAuthStateService();
    await oauth.saveOAuthState({
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
      returnTo: "/dashboard",
    });

    const consumed = await oauth.consumeOAuthState("state-1");
    expect(consumed).toEqual({
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
      returnTo: "/dashboard",
    });

    expect(await oauth.consumeOAuthState("state-1")).toBeNull();
  });

  it("returns null for unknown state", async () => {
    const oauth = createOAuthStateService();
    expect(await oauth.consumeOAuthState("does-not-exist")).toBeNull();
    expect(await oauth.consumeOAuthState("")).toBeNull();
  });

  it("rejects an expired state", async () => {
    const oauth = createOAuthStateService();
    await query(
      `INSERT INTO oauth_states (state, nonce, code_verifier, return_to, expires_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 minute')`,
      ["expired", "n", "v", "/"],
    );

    expect(await oauth.consumeOAuthState("expired")).toBeNull();
  });
});
