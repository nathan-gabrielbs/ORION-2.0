import type Database from "better-sqlite3";
import { cleanupOldMacrosHistory } from "../../integrations/sighra/macro-history.js";
import type { RasterSyncService } from "../../integrations/raster/sync.service.js";
import type { SighraSyncService } from "../../integrations/sighra/sync.service.js";
import type { EfficiencyService } from "../../modules/efficiency/service.js";
import { cleanupFinishedMaintenanceByForecast } from "../../modules/vehicles/maintenance-cleanup.js";

export async function startBackgroundJobs(deps: {
  db: Database.Database;
  sighraSync: SighraSyncService;
  rasterSync: RasterSyncService;
  efficiencyService: EfficiencyService;
}): Promise<void> {
  const { db, sighraSync, rasterSync, efficiencyService } = deps;

  cleanupOldMacrosHistory(db);

  await sighraSync.pollMacros(true);
  await sighraSync.pollPositions();
  await rasterSync.pollTrips();

  efficiencyService.saveSnapshot();

  setInterval(() => {
    efficiencyService.saveSnapshot();
  }, 300_000);

  setInterval(() => {
    sighraSync.pollPositions();
  }, 60_000);

  setInterval(() => {
    rasterSync.pollTrips();
  }, 120_000);

  setInterval(() => {
    cleanupOldMacrosHistory(db);
    sighraSync.pollMacros(false);
  }, 300_000);

  setInterval(() => {
    cleanupFinishedMaintenanceByForecast(db);
  }, 60_000);
}
