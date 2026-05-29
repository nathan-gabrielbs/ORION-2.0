import crypto from "crypto";
import type Database from "better-sqlite3";
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
    active: row.active as number,
  };
}

export type AuthService = {
  normalizeEmail: typeof normalizeEmail;
  sanitizeUserRow: typeof sanitizeUserRow;
  getUserByEmail: (email: string) => Record<string, unknown> | undefined;
  createSession: (userId: number) => string;
  getAuthUserFromToken: (rawToken: string | undefined) => AuthUser | null;
  revokeSession: (rawToken: string) => void;
  touchLastLogin: (userId: number) => void;
  upgradePasswordHash: (userId: number, password: string) => void;
  ensurePrincipalAdmin: () => void;
};

export function createAuthService(db: Database.Database): AuthService {
  const getUserByEmailStmt = db.prepare(`
    SELECT *
    FROM users
    WHERE lower(email) = lower(?)
    LIMIT 1
  `);

  const createSessionStmt = db.prepare(`
    INSERT INTO user_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+12 hours'))
  `);

  const getSessionStmt = db.prepare(`
    SELECT us.user_id, us.expires_at, u.id, u.name, u.email, u.role, u.auth_provider, u.active
    FROM user_sessions us
    INNER JOIN users u ON u.id = us.user_id
    WHERE us.token_hash = ?
    LIMIT 1
  `);

  const touchSessionStmt = db.prepare(`
    UPDATE user_sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE token_hash = ?
  `);

  const revokeSessionStmt = db.prepare(`
    DELETE FROM user_sessions
    WHERE token_hash = ?
  `);

  const revokeAllExpiredSessionsStmt = db.prepare(`
    DELETE FROM user_sessions
    WHERE datetime(expires_at) <= datetime('now')
  `);

  const touchLastLoginStmt = db.prepare(`
    UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
  `);

  const upgradePasswordHashStmt = db.prepare(`
    UPDATE users
    SET password_hash = ?, auth_provider = 'LOCAL'
    WHERE id = ?
  `);

  const getUserByEmail = (email: string) =>
    getUserByEmailStmt.get(email) as Record<string, unknown> | undefined;

  const createSession = (userId: number): string => {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    createSessionStmt.run(userId, tokenHash);
    return token;
  };

  const getAuthUserFromToken = (rawToken: string | undefined): AuthUser | null => {
    if (!rawToken) return null;

    revokeAllExpiredSessionsStmt.run();
    const tokenHash = sha256(rawToken);
    const row = getSessionStmt.get(tokenHash) as Record<string, unknown> | undefined;

    if (!row || !row.active) return null;

    if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
      revokeSessionStmt.run(tokenHash);
      return null;
    }

    touchSessionStmt.run(tokenHash);
    return sanitizeUserRow(row);
  };

  const revokeSession = (rawToken: string) => {
    revokeSessionStmt.run(sha256(rawToken));
  };

  const touchLastLogin = (userId: number) => {
    touchLastLoginStmt.run(userId);
  };

  const upgradePasswordHash = (userId: number, password: string) => {
    upgradePasswordHashStmt.run(makePasswordHash(password), userId);
  };

  const ensurePrincipalAdmin = () => {
    const principalEmail = BOOTSTRAP_ADMIN_EMAIL;
    const principalPassword = BOOTSTRAP_ADMIN_PASSWORD;
    const existing = getUserByEmail(principalEmail);

    if (!existing) {
      if (!principalPassword || principalPassword.length < 8) {
        throw new Error("Variável obrigatória ausente ou inválida: BOOTSTRAP_ADMIN_PASSWORD");
      }

      db.prepare(
        `
        INSERT INTO users (name, email, password_hash, role, auth_provider, active)
        VALUES (?, ?, ?, 'ADMIN', 'LOCAL', 1)
      `,
      ).run("Administrador", principalEmail, makePasswordHash(principalPassword));

      return;
    }

    if (existing.role !== "ADMIN" || !existing.active) {
      db.prepare(
        `
        UPDATE users
        SET role = 'ADMIN', active = 1
        WHERE id = ?
      `,
      ).run(existing.id);
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
