import type Database from "better-sqlite3";
import { createVehicleRepository } from "./repository.js";
import { seedPlateRegistry, seedVehiclesIfNeeded } from "./seeds/index.js";

export function createVehicleModule(db: Database.Database) {
  seedVehiclesIfNeeded(db);
  seedPlateRegistry(db);

  return createVehicleRepository(db);
}

export type VehicleModule = ReturnType<typeof createVehicleModule>;
