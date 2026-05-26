import type Database from "better-sqlite3";
import { createEfficiencyService, isOperationalStatus } from "./service.js";
import { registerEfficiencyRoutes } from "./routes.js";

export function createEfficiencyModule(db: Database.Database) {
  return createEfficiencyService({ db });
}

export type EfficiencyModule = ReturnType<typeof createEfficiencyModule>;

export { createEfficiencyService, registerEfficiencyRoutes, isOperationalStatus };
export type {
  EfficiencyService,
  FleetEfficiencySnapshot,
  StartOfDayEfficiency,
} from "./service.js";
