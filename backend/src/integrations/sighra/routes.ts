import type Database from "better-sqlite3";
import type { Express, RequestHandler } from "express";
import { getTodayMacros } from "./macro-history.js";
import type { SighraSyncService } from "./sync.service.js";

export function registerSighraRoutes(
  app: Express,
  deps: {
    sighraSync: SighraSyncService;
    db: Database.Database;
    webhookHandler: RequestHandler;
  },
) {
  const { sighraSync, db, webhookHandler } = deps;

  app.get("/api/sync/status", (_req, res) => {
    res.json(sighraSync.getSyncStatus());
  });

  app.get("/api/macros/status", (_req, res) => {
    res.json(sighraSync.getMacrosStatus());
  });

  app.get("/api/macros/today", (_req, res) => {
    res.json(getTodayMacros(db));
  });

  app.post("/api/sighra/webhook", webhookHandler);
}
