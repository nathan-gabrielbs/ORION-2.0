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

export const MICROSOFT_ALLOWED_DOMAIN = optionalEnv(
  "MICROSOFT_ALLOWED_DOMAIN",
  "grpotencial.com.br",
).toLowerCase();
export const MICROSOFT_TENANT_ID = optionalEnv("MICROSOFT_TENANT_ID", "common");
export const MICROSOFT_CLIENT_ID = optionalEnv("MICROSOFT_CLIENT_ID");
export const MICROSOFT_CLIENT_SECRET = optionalEnv("MICROSOFT_CLIENT_SECRET");

export const SIGHRA_WEBHOOK_TOKEN = IS_PRODUCTION
  ? requireEnv("SIGHRA_WEBHOOK_TOKEN")
  : optionalEnv("SIGHRA_WEBHOOK_TOKEN");

export const BOOTSTRAP_ADMIN_EMAIL = optionalEnv(
  "BOOTSTRAP_ADMIN_EMAIL",
  "nathan.g@grpotencial.com.br",
).toLowerCase();
export const BOOTSTRAP_ADMIN_PASSWORD = optionalEnv("BOOTSTRAP_ADMIN_PASSWORD");
