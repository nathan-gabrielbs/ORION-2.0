import crypto from "crypto";
import { optionalEnv, requireEnv } from "./env.js";

export const APP_PORT = Number(process.env.PORT || 3000);
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const PUBLIC_BASE_URL = optionalEnv("PUBLIC_BASE_URL", `http://localhost:${APP_PORT}`);

export const allowedOrigins = new Set(
  optionalEnv("ALLOWED_ORIGINS", `http://localhost:${APP_PORT},http://127.0.0.1:${APP_PORT}`)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

export const CORS_ALLOW_PRIVATE_LAN =
  !IS_PRODUCTION && optionalEnv("CORS_ALLOW_PRIVATE_LAN", "false") === "true";

export const SESSION_COOKIE = "orion_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

// Secret for express-session, which holds the Orbital token bundle between
// requests so the refresh middleware can rotate the OIDC tokens. In production
// it must be provided; otherwise sessions don't survive a restart.
export const SESSION_SECRET =
  optionalEnv("SESSION_SECRET") ||
  (() => {
    if (IS_PRODUCTION) {
      throw new Error("Variável obrigatória ausente: SESSION_SECRET");
    }
    console.warn(
      "⚠️  SESSION_SECRET não definido — usando valor aleatório (sessões Orbital não sobrevivem a reinícios).",
    );
    return crypto.randomBytes(32).toString("hex");
  })();

// ---------- Orbital OIDC (SSO corporativo via openid-client) ----------

export const OIDC_ISSUER = optionalEnv("OIDC_ISSUER");
export const OIDC_CLIENT_ID = optionalEnv("OIDC_CLIENT_ID");
export const OIDC_CLIENT_SECRET = optionalEnv("OIDC_CLIENT_SECRET");
export const OIDC_REDIRECT_URI = optionalEnv(
  "OIDC_REDIRECT_URI",
  `${PUBLIC_BASE_URL}/auth/callback`,
);
export const OIDC_POST_LOGOUT_REDIRECT_URI = optionalEnv(
  "OIDC_POST_LOGOUT_REDIRECT_URI",
  `${PUBLIC_BASE_URL}/login`,
);
export const OIDC_SCOPES = optionalEnv(
  "OIDC_SCOPES",
  "openid profile email offline_access orbital.roles orbital.profile orbital.microsoft orbital.permissions",
).replace(/^['"]|['"]$/g, "");
export const OIDC_REFRESH_LEEWAY_MS = Number(optionalEnv("OIDC_REFRESH_LEEWAY_MS", "60000"));

// Role key reported by Orbital that grants global admin in Orion (maps to role ADMIN).
export const ORBITAL_ADMIN_ROLE_KEY = optionalEnv("ORBITAL_ADMIN_ROLE_KEY", "admin");

export const ORBITAL_OK = Boolean(
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET && OIDC_REDIRECT_URI,
);

export const SIGHRA_WEBHOOK_TOKEN = IS_PRODUCTION
  ? requireEnv("SIGHRA_WEBHOOK_TOKEN")
  : optionalEnv("SIGHRA_WEBHOOK_TOKEN");

export const BOOTSTRAP_ADMIN_EMAIL = optionalEnv(
  "BOOTSTRAP_ADMIN_EMAIL",
  "nathan.g@grpotencial.com.br",
).toLowerCase();
export const BOOTSTRAP_ADMIN_PASSWORD = optionalEnv("BOOTSTRAP_ADMIN_PASSWORD");
