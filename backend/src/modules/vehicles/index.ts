import type Database from "better-sqlite3";
import { createVehicleRepository } from "./repository.js";
import { registerVehicleRoutes } from "./routes.js";
import { createVehicleService } from "./service.js";
import { seedPlateRegistry, seedVehiclesIfNeeded } from "./seeds/index.js";

export function createVehicleModule(db: Database.Database) {
  seedVehiclesIfNeeded(db);
  seedPlateRegistry(db);

  return createVehicleRepository(db);
}

export type VehicleModule = ReturnType<typeof createVehicleModule>;

export { createVehicleService, registerVehicleRoutes };
export type { VehicleRepository } from "./repository.js";
export type { VehicleService } from "./service.js";
