import type Database from "better-sqlite3";
import { VEHICLES_WITH_FORECAST_SELECT } from "./queries.js";

export type VehicleRepository = {
  getAllVehicles: () => unknown[];
  getVehicleByPlate: (plate: string) => unknown;
};

export function createVehicleRepository(db: Database.Database): VehicleRepository {
  const listStmt = db.prepare(VEHICLES_WITH_FORECAST_SELECT);
  const byPlateStmt = db.prepare(`
    ${VEHICLES_WITH_FORECAST_SELECT}
    WHERE v.plate = ?
  `);

  return {
    getAllVehicles: () => listStmt.all(),
    getVehicleByPlate: (plate: string) => byPlateStmt.get(plate),
  };
}
