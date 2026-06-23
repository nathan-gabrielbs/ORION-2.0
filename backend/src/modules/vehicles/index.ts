import { createVehicleRepository } from "./repository.js";
import { registerVehicleRoutes } from "./routes.js";
import { createVehicleService } from "./service.js";
import { seedPlateRegistry, seedVehiclesIfNeeded } from "./seeds/index.js";

export async function createVehicleModule() {
  await seedVehiclesIfNeeded();
  await seedPlateRegistry();

  return createVehicleRepository();
}

export type VehicleModule = Awaited<ReturnType<typeof createVehicleModule>>;

export { createVehicleService, registerVehicleRoutes };
export type { VehicleRepository } from "./repository.js";
export type { VehicleService } from "./service.js";
