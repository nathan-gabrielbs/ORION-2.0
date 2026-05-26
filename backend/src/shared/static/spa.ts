import type { Express } from "express";
import express from "express";
import path from "path";
import type { AuthUser } from "../types/auth.js";
import { IS_PRODUCTION } from "../app-config.js";
import { resolveFrontendDistPath } from "../paths.js";

export function registerRootRedirect(app: Express): void {
  app.get("/", (req, res, next) => {
    const authUser = (req as Express.Request & { authUser?: AuthUser | null }).authUser ?? null;
    if (!authUser) {
      return res.redirect("/login");
    }
    next();
  });
}

export function registerProductionSpa(app: Express): void {
  if (!IS_PRODUCTION) return;

  const frontendDist = resolveFrontendDistPath();
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}
