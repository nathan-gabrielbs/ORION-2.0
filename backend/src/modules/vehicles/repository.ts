import { query, queryOne } from "../../db/client.js";
import { VEHICLES_WITH_FORECAST_SELECT } from "./queries.js";

export type VehicleRepository = {
  getAllVehicles: () => Promise<unknown[]>;
  getVehicleByPlate: (plate: string) => Promise<unknown>;
};

export function createVehicleRepository(): VehicleRepository {
  return {
    getAllVehicles: async () => {
      const result = await query(VEHICLES_WITH_FORECAST_SELECT);
      return result.rows;
    },
    getVehicleByPlate: async (plate: string) => {
      return queryOne(
        `
        ${VEHICLES_WITH_FORECAST_SELECT}
        WHERE v.plate = $1
      `,
        [plate],
      );
    },
  };
}
