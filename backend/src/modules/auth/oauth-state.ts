import crypto from "crypto";
import type Database from "better-sqlite3";

export type OAuthStateService = {
  createOAuthState: () => string;
  consumeOAuthState: (state: string) => boolean;
};

export function createOAuthStateService(db: Database.Database): OAuthStateService {
  const insertOAuthStateStmt = db.prepare(`
    INSERT INTO oauth_states (state, expires_at)
    VALUES (?, datetime('now', '+10 minutes'))
  `);

  const consumeOAuthStateStmt = db.prepare(`
    DELETE FROM oauth_states
    WHERE state = ?
    RETURNING state, created_at, expires_at
  `);

  const purgeExpiredOAuthStatesStmt = db.prepare(`
    DELETE FROM oauth_states
    WHERE expires_at <= CURRENT_TIMESTAMP
  `);

  const createOAuthState = () => {
    const state = crypto.randomBytes(16).toString("hex");
    insertOAuthStateStmt.run(state);
    return state;
  };

  const consumeOAuthState = (state: string): boolean => {
    if (!state) return false;

    try {
      purgeExpiredOAuthStatesStmt.run();
    } catch {
      // Don't let cleanup failures block login.
    }

    const row = consumeOAuthStateStmt.get(state) as
      | { state: string; created_at: string; expires_at: string }
      | undefined;
    if (!row) return false;

    const expiresAt = new Date(row.expires_at + "Z").getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  };

  return { createOAuthState, consumeOAuthState };
}
