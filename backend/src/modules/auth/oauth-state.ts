import type Database from "better-sqlite3";

export type OrbitalStateInput = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

export type OrbitalStateRecord = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

export type OAuthStateService = {
  saveOAuthState: (input: OrbitalStateInput) => void;
  consumeOAuthState: (state: string) => OrbitalStateRecord | null;
};

export function createOAuthStateService(db: Database.Database): OAuthStateService {
  const insertOAuthStateStmt = db.prepare(`
    INSERT INTO oauth_states (state, nonce, code_verifier, return_to, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'))
  `);

  const consumeOAuthStateStmt = db.prepare(`
    DELETE FROM oauth_states
    WHERE state = ?
    RETURNING state, nonce, code_verifier, return_to, expires_at
  `);

  const purgeExpiredOAuthStatesStmt = db.prepare(`
    DELETE FROM oauth_states
    WHERE expires_at <= CURRENT_TIMESTAMP
  `);

  const saveOAuthState = (input: OrbitalStateInput) => {
    insertOAuthStateStmt.run(input.state, input.nonce, input.codeVerifier, input.returnTo);
  };

  const consumeOAuthState = (state: string): OrbitalStateRecord | null => {
    if (!state) return null;

    try {
      purgeExpiredOAuthStatesStmt.run();
    } catch {
      // Don't let cleanup failures block login.
    }

    const row = consumeOAuthStateStmt.get(state) as
      | {
          state: string;
          nonce: string | null;
          code_verifier: string | null;
          return_to: string | null;
          expires_at: string;
        }
      | undefined;
    if (!row) return null;

    const expiresAt = new Date(row.expires_at + "Z").getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

    return {
      state: row.state,
      nonce: row.nonce ?? "",
      codeVerifier: row.code_verifier ?? "",
      returnTo: row.return_to ?? "/",
    };
  };

  return { saveOAuthState, consumeOAuthState };
}
