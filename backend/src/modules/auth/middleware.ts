import type express from "express";
import { SESSION_COOKIE } from "../../shared/app-config.js";
import type { AuthUser } from "../../shared/types/auth.js";
import { parseCookies } from "./cookies.js";
import type { AuthService } from "./service.js";

export type AuthMiddleware = {
  attachAuthUser: express.RequestHandler;
  requireAuth: express.RequestHandler;
  requireAdmin: express.RequestHandler;
};

export function createAuthMiddleware(auth: AuthService): AuthMiddleware {
  const attachAuthUser: express.RequestHandler = (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[SESSION_COOKIE];
    (req as express.Request & { authUser?: AuthUser | null; sessionToken?: string }).authUser =
      auth.getAuthUserFromToken(sessionToken);
    (req as express.Request & { sessionToken?: string }).sessionToken = sessionToken;
    next();
  };

  const requireAuth: express.RequestHandler = (req, res, next) => {
    const authUser = (req as express.Request & { authUser?: AuthUser | null }).authUser;
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    const authUser = (req as express.Request & { authUser?: AuthUser | null }).authUser;
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    if (authUser.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
    next();
  };

  return { attachAuthUser, requireAuth, requireAdmin };
}
