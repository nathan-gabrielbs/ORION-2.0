import type { Server } from "socket.io";
import { query, queryOne } from "../../db/client.js";
import { resolveVehicleStatusWithoutOperationalMacro } from "../../integrations/sighra/macro-utils.js";
import { sanitizeText } from "../../shared/utils/sanitize.js";
import type { VehicleRepository } from "./repository.js";

type VehicleRow = Record<string, unknown>;

export type VehicleService = ReturnType<typeof createVehicleService>;

export function createVehicleService(deps: { vehicleRepo: VehicleRepository; io: Server }) {
  const { vehicleRepo, io } = deps;

  const getVehicleRow = async (plate: string): Promise<VehicleRow | undefined> =>
    queryOne("SELECT * FROM vehicles WHERE plate = $1", [plate]);

  const clearStaleMaintenanceFinishedAt = async () => {
    await query(`
      UPDATE vehicles
      SET maintenance_finished_at = NULL
      WHERE maintenance_finished_at IS NOT NULL
        AND maintenance_finished_at < NOW() - INTERVAL '24 hours'
    `);
  };

  const emitVehicleUpdated = async (plate: string) => {
    const updated = await vehicleRepo.getVehicleByPlate(plate);
    if (updated) {
      io.emit("vehicle:updated", updated);
    }
    return updated;
  };

  return {
    clearStaleMaintenanceFinishedAt,

    listVehicles: async () => {
      await clearStaleMaintenanceFinishedAt();
      return vehicleRepo.getAllVehicles();
    },

    updateStatus: async (plate: string, status: string) => {
      const vehicle = await getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      const tripStartTime = status === "EM TRÂNSITO" ? new Date().toISOString() : null;

      await query(
        `
        UPDATE vehicles
        SET status = $1,
            trip_start_time = $2,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $3
      `,
        [status, tripStartTime, plate],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    updateMaintenanceFields: async (
      plate: string,
      input: {
        driver: string | null;
        reason: string | null;
        location: string | null;
        forecast: string | null;
      },
    ) => {
      const vehicle = await getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      await query(
        `
        UPDATE vehicles
        SET driver = COALESCE($1, driver),
            maintenance_reason = COALESCE($2, maintenance_reason),
            location_name = COALESCE($3, location_name),
            maintenance_prev_date = COALESCE($4, maintenance_prev_date),
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $5
      `,
        [input.driver, input.reason, input.location, input.forecast, plate],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    updateObservation: async (plate: string, observation: string | null) => {
      const vehicle = await getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      await query(
        `
        UPDATE vehicles
        SET observation = $1,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $2
      `,
        [observation, plate],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    enterMaintenance: async (
      plate: string,
      input: {
        driver: string | null;
        reason: string | null;
        location: string | null;
        forecast: string | null;
      },
    ) => {
      const current = await getVehicleRow(plate);
      if (!current) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      await query(
        `
        UPDATE vehicles
        SET status = 'EM MANUTENÇÃO',
            driver = $1,
            maintenance_reason = $2,
            location_name = $3,
            maintenance_prev_date = $4,
            maintenance_finished_at = NULL,
            trip_start_time = NULL,
            last_operational_driver = COALESCE(last_operational_driver, $1),
            last_operational_location = COALESCE(last_operational_location, $3),
            last_operational_speed = COALESCE(last_operational_speed, $5),
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $6
      `,
        [input.driver, input.reason, input.location, input.forecast, current.speed, plate],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    cancelMaintenance: async (plate: string) => {
      const vehicle = await getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);
      const tripStartTime =
        fallbackStatus === "EM TRÂNSITO"
          ? (vehicle.trip_start_time as string | null) || new Date().toISOString()
          : null;

      await query(
        `
        UPDATE vehicles
        SET status = $1,
            driver = COALESCE(last_operational_driver, driver),
            location_name = COALESCE(last_operational_location, location_name),
            speed = COALESCE(last_operational_speed, speed),
            maintenance_reason = NULL,
            maintenance_type = NULL,
            maintenance_prev_date = NULL,
            maintenance_finished_at = NULL,
            trip_start_time = $2,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $3
      `,
        [fallbackStatus, tripStartTime, plate],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    finishMaintenance: async (
      plate: string,
      input: { reason: string | null; location: string | null },
    ) => {
      const vehicle = await getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      const finishedAtDate = new Date();
      const finishedAt = finishedAtDate.toISOString();
      const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);
      const tripStartTime =
        fallbackStatus === "EM TRÂNSITO"
          ? (vehicle.trip_start_time as string | null) || new Date().toISOString()
          : null;

      await query(
        `
        UPDATE vehicles
        SET status = $1,
            driver = COALESCE(last_operational_driver, driver),
            location_name = COALESCE(last_operational_location, location_name),
            speed = COALESCE(last_operational_speed, speed),
            maintenance_finished_at = $2,
            maintenance_reason = NULL,
            maintenance_type = NULL,
            maintenance_prev_date = NULL,
            trip_start_time = $3,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $4
      `,
        [fallbackStatus, finishedAt, tripStartTime, plate],
      );

      const historyReason = input.reason || (vehicle.maintenance_reason as string | null);
      const historyLocation = input.location || (vehicle.location_name as string | null);
      const historyForecast = new Date(
        finishedAtDate.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      await query(
        `
        INSERT INTO maintenance_history (plate, driver, reason, location, start_date, finish_date, forecast_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          vehicle.plate,
          vehicle.driver,
          historyReason,
          historyLocation,
          vehicle.last_update,
          finishedAt,
          historyForecast,
        ],
      );

      const updated = await emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    sanitizeMaintenanceInput: (data: {
      driver?: string | null;
      reason?: string | null;
      location?: string | null;
      forecast?: string | null;
    }) => ({
      driver: sanitizeText(data.driver, 120),
      reason: sanitizeText(data.reason, 300),
      location: sanitizeText(data.location, 300),
      forecast: sanitizeText(data.forecast, 80),
    }),

    sanitizeFinishMaintenanceInput: (data: {
      reason?: string | null;
      location?: string | null;
    }) => ({
      reason: sanitizeText(data.reason, 300),
      location: sanitizeText(data.location, 300),
    }),
  };
}
