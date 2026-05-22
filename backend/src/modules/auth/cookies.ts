import type express from "express";
import { IS_PRODUCTION, SESSION_COOKIE, SESSION_TTL_MS } from "../../shared/app-config.js";

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce(
    (acc, part) => {
      const [rawKey, ...rawValue] = part.trim().split("=");
      if (!rawKey) return acc;
      acc[rawKey] = decodeURIComponent(rawValue.join("="));
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function setSessionCookie(res: express.Response, token: string) {
  const secure = IS_PRODUCTION;
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: express.Response) {
  const secure = IS_PRODUCTION;
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
