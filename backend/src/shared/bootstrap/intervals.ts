import type { RasterSyncService } from "../../integrations/raster/sync.service.js";
import type { SighraSyncService } from "../../integrations/sighra/sync.service.js";
import type { EfficiencyService } from "../../modules/efficiency/service.js";
import { cleanupFinishedMaintenanceByForecast } from "../../modules/vehicles/maintenance-cleanup.js";
import { cleanupOldMacrosHistory } from "../../integrations/sighra/macro-history.js";

export async function startBackgroundJobs(deps: {
  sighraSync: SighraSyncService;
  rasterSync: RasterSyncService;
  efficiencyService: EfficiencyService;
}): Promise<void> {
  const { sighraSync, rasterSync, efficiencyService } = deps;

  await cleanupOldMacrosHistory();

  await sighraSync.pollMacros(true);
  await sighraSync.pollPositions();
  await rasterSync.pollTrips();

  await efficiencyService.saveSnapshot();

  setInterval(() => {
    void efficiencyService.saveSnapshot();
  }, 300_000);

  setInterval(() => {
    void sighraSync.pollPositions();
  }, 60_000);

  setInterval(() => {
    void rasterSync.pollTrips();
  }, 120_000);

  setInterval(() => {
    void cleanupOldMacrosHistory();
    void sighraSync.pollMacros(false);
  }, 300_000);

  setInterval(() => {
    void cleanupFinishedMaintenanceByForecast();
  }, 60_000);
}
