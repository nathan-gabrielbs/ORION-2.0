import { createVehicleRepository } from "./repository.js";
import { registerVehicleRoutes } from "./routes.js";
import { createVehicleService } from "./service.js";
import { seedPlateRegistry, seedVehiclesIfNeeded } from "./seeds/index.js";
import { query } from "../../db/client.js";

async function synchronizeVehiclesWithPlateRegistry() {
  await query(`
    INSERT INTO vehicles (id, plate, driver, status, speed)
    SELECT pr.plate, pr.plate, 'SEM MOTORISTA', 'VEÍCULO VAZIO', 0
    FROM plate_registry pr
    WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.plate = pr.plate)
  `);

  await query(`
    DELETE FROM vehicles v
    WHERE NOT EXISTS (SELECT 1 FROM plate_registry pr WHERE pr.plate = v.plate)
  `);
}

export async function createVehicleModule() {
  await seedVehiclesIfNeeded();
  await seedPlateRegistry();
  await synchronizeVehiclesWithPlateRegistry();

  return createVehicleRepository();
}

export type VehicleModule = Awaited<ReturnType<typeof createVehicleModule>>;

export { createVehicleService, registerVehicleRoutes };
export type { VehicleRepository } from "./repository.js";
export type { VehicleService } from "./service.js";
