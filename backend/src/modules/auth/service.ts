import crypto from "crypto";
import { query, queryOne } from "../../db/client.js";
import { BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } from "../../shared/app-config.js";
import type { AuthUser } from "../../shared/types/auth.js";
import { makePasswordHash, sha256 } from "./password.js";

export function normalizeEmail(email: unknown): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function sanitizeUserRow(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    role: row.role as AuthUser["role"],
    auth_provider: row.auth_provider as AuthUser["auth_provider"],
    active: row.active ? 1 : 0,
  };
}

export type AuthService = {
  normalizeEmail: typeof normalizeEmail;
  sanitizeUserRow: typeof sanitizeUserRow;
  getUserByEmail: (email: string) => Promise<Record<string, unknown> | undefined>;
  createSession: (userId: number) => Promise<string>;
  getAuthUserFromToken: (rawToken: string | undefined) => Promise<AuthUser | null>;
  revokeSession: (rawToken: string) => Promise<void>;
  touchLastLogin: (userId: number) => Promise<void>;
  upgradePasswordHash: (userId: number, password: string) => Promise<void>;
  ensurePrincipalAdmin: () => Promise<void>;
};

export function createAuthService(): AuthService {
  const getUserByEmail = async (email: string) => {
    return queryOne(
      `
      SELECT *
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
      [email],
    );
  };

  const createSession = async (userId: number): Promise<string> => {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    await query(
      `
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '12 hours')
    `,
      [userId, tokenHash],
    );
    return token;
  };

  const getAuthUserFromToken = async (rawToken: string | undefined): Promise<AuthUser | null> => {
    if (!rawToken) return null;

    await query(`
      DELETE FROM user_sessions
      WHERE expires_at <= NOW()
    `);

    const tokenHash = sha256(rawToken);
    const row = await queryOne(
      `
      SELECT us.user_id, us.expires_at, u.id, u.name, u.email, u.role, u.auth_provider, u.active
      FROM user_sessions us
      INNER JOIN users u ON u.id = us.user_id
      WHERE us.token_hash = $1
      LIMIT 1
    `,
      [tokenHash],
    );

    if (!row || !row.active) return null;

    if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
      await revokeSession(rawToken);
      return null;
    }

    await query(
      `
      UPDATE user_sessions
      SET last_seen_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1
    `,
      [tokenHash],
    );

    return sanitizeUserRow(row);
  };

  const revokeSession = async (rawToken: string) => {
    await query(
      `
      DELETE FROM user_sessions
      WHERE token_hash = $1
    `,
      [sha256(rawToken)],
    );
  };

  const touchLastLogin = async (userId: number) => {
    await query(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`, [userId]);
  };

  const upgradePasswordHash = async (userId: number, password: string) => {
    await query(
      `
      UPDATE users
      SET password_hash = $1, auth_provider = 'LOCAL'
      WHERE id = $2
    `,
      [makePasswordHash(password), userId],
    );
  };

  const ensurePrincipalAdmin = async () => {
    const principalEmail = BOOTSTRAP_ADMIN_EMAIL;
    const principalPassword = BOOTSTRAP_ADMIN_PASSWORD;
    const existing = await getUserByEmail(principalEmail);

    if (!existing) {
      if (!principalPassword || principalPassword.length < 8) {
        throw new Error("Variável obrigatória ausente ou inválida: BOOTSTRAP_ADMIN_PASSWORD");
      }

      await query(
        `
        INSERT INTO users (name, email, password_hash, role, auth_provider, active)
        VALUES ($1, $2, $3, 'ADMIN', 'LOCAL', TRUE)
      `,
        ["Administrador", principalEmail, makePasswordHash(principalPassword)],
      );

      return;
    }

    if (existing.role !== "ADMIN" || !existing.active) {
      await query(
        `
        UPDATE users
        SET role = 'ADMIN', active = TRUE
        WHERE id = $1
      `,
        [existing.id],
      );
    }
  };

  return {
    normalizeEmail,
    sanitizeUserRow,
    getUserByEmail,
    createSession,
    getAuthUserFromToken,
    revokeSession,
    touchLastLogin,
    upgradePasswordHash,
    ensurePrincipalAdmin,
  };
}
