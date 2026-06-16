import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../test/helpers/database.js";
import { createOAuthStateService } from "./oauth-state.js";

describe("createOAuthStateService (Orbital PKCE state)", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function createService() {
    db = createTestDatabase();
    return createOAuthStateService(db);
  }

  it("saves and consumes a PKCE state once (single-use)", () => {
    const oauth = createService();
    oauth.saveOAuthState({
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
      returnTo: "/dashboard",
    });

    const consumed = oauth.consumeOAuthState("state-1");
    expect(consumed).toEqual({
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
      returnTo: "/dashboard",
    });

    // Second consume returns null — the row was deleted.
    expect(oauth.consumeOAuthState("state-1")).toBeNull();
  });

  it("returns null for unknown state", () => {
    const oauth = createService();
    expect(oauth.consumeOAuthState("does-not-exist")).toBeNull();
    expect(oauth.consumeOAuthState("")).toBeNull();
  });

  it("rejects an expired state", () => {
    const oauth = createService();
    db.prepare(
      `INSERT INTO oauth_states (state, nonce, code_verifier, return_to, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '-1 minute'))`,
    ).run("expired", "n", "v", "/");

    expect(oauth.consumeOAuthState("expired")).toBeNull();
  });
});
