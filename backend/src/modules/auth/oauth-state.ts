import { query, queryOne } from "../../db/client.js";

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
  saveOAuthState: (input: OrbitalStateInput) => Promise<void>;
  consumeOAuthState: (state: string) => Promise<OrbitalStateRecord | null>;
};

export function createOAuthStateService(): OAuthStateService {
  const saveOAuthState = async (input: OrbitalStateInput) => {
    await query(
      `
      INSERT INTO oauth_states (state, nonce, code_verifier, return_to, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
    `,
      [input.state, input.nonce, input.codeVerifier, input.returnTo],
    );
  };

  const consumeOAuthState = async (state: string): Promise<OrbitalStateRecord | null> => {
    if (!state) return null;

    try {
      await query(`
        DELETE FROM oauth_states
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);
    } catch {
      // Don't let cleanup failures block login.
    }

    const row = await queryOne<{
      state: string;
      nonce: string | null;
      code_verifier: string | null;
      return_to: string | null;
      expires_at: Date;
    }>(
      `
      DELETE FROM oauth_states
      WHERE state = $1
      RETURNING state, nonce, code_verifier, return_to, expires_at
    `,
      [state],
    );

    if (!row) return null;

    const expiresAt = new Date(row.expires_at).getTime();
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
