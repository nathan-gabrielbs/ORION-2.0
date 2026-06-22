import type { Express } from "express";
import type { EfficiencyService } from "./service.js";

export function registerEfficiencyRoutes(app: Express, efficiencyService: EfficiencyService) {
  app.get("/api/efficiency/current", async (_req, res) => {
    const snapshot = await efficiencyService.calculateFleetEfficiency();

    res.json({
      timestamp: snapshot.timestamp,
      efficiency: snapshot.efficiency,
      totalVehicles: snapshot.totalVehicles,
      operationalVehicles: snapshot.operationalVehicles,
    });
  });

  app.get("/api/efficiency/start-of-day", async (_req, res) => {
    const snapshot = await efficiencyService.getStartOfDayEfficiency();

    res.json({
      ...(snapshot.id !== undefined ? { id: snapshot.id } : {}),
      timestamp: snapshot.timestamp,
      efficiency: snapshot.efficiency,
      totalVehicles: snapshot.totalVehicles,
      operationalVehicles: snapshot.operationalVehicles,
      source: snapshot.source,
    });
  });
}
