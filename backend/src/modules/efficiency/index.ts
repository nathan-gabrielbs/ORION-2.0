import { createEfficiencyService, isOperationalStatus } from "./service.js";
import { registerEfficiencyRoutes } from "./routes.js";

export function createEfficiencyModule() {
  return createEfficiencyService();
}

export type EfficiencyModule = ReturnType<typeof createEfficiencyModule>;

export { createEfficiencyService, registerEfficiencyRoutes, isOperationalStatus };
export type {
  EfficiencyService,
  FleetEfficiencySnapshot,
  StartOfDayEfficiency,
} from "./service.js";
