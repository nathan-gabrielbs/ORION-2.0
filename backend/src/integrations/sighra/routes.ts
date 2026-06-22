import type { Express, RequestHandler } from "express";
import { getTodayMacros } from "./macro-history.js";
import type { SighraSyncService } from "./sync.service.js";

export function registerSighraRoutes(
  app: Express,
  deps: {
    sighraSync: SighraSyncService;
    webhookHandler: RequestHandler;
  },
) {
  const { sighraSync, webhookHandler } = deps;

  app.get("/api/sync/status", (_req, res) => {
    res.json(sighraSync.getSyncStatus());
  });

  app.get("/api/macros/status", (_req, res) => {
    res.json(sighraSync.getMacrosStatus());
  });

  app.get("/api/macros/today", async (_req, res) => {
    res.json(await getTodayMacros());
  });

  app.post("/api/sighra/webhook", webhookHandler);
}
