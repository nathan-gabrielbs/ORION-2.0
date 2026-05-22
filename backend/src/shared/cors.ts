import type express from "express";
import { allowedOrigins, CORS_ALLOW_PRIVATE_LAN } from "./app-config.js";

function isPrivateLanOrigin(origin: string): boolean {
  return /^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(origin);
}

export function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true;

  if (allowedOrigins.has(origin)) return true;

  if (CORS_ALLOW_PRIVATE_LAN && isPrivateLanOrigin(origin)) return true;

  return false;
}

export function requireTrustedOrigin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const origin = req.headers.origin;

  console.log("Origin recebida:", origin);

  if (!origin) return next();

  if (!isAllowedOrigin(origin)) {
    console.log("❌ Origin bloqueada:", origin);
    return res.status(403).json({ error: "Origin não autorizada." });
  }

  next();
}
