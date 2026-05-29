import type Database from "better-sqlite3";
import type { Server } from "socket.io";
import { resolveVehicleStatusWithoutOperationalMacro } from "../../integrations/sighra/macro-utils.js";
import { sanitizeText } from "../../shared/utils/sanitize.js";
import type { VehicleRepository } from "./repository.js";

type VehicleRow = Record<string, unknown>;

export type VehicleService = ReturnType<typeof createVehicleService>;

export function createVehicleService(deps: {
  db: Database.Database;
  vehicleRepo: VehicleRepository;
  io: Server;
}) {
  const { db, vehicleRepo, io } = deps;

  const getVehicleByPlateStmt = db.prepare("SELECT * FROM vehicles WHERE plate = ?");

  const clearStaleMaintenanceFinishedAtStmt = db.prepare(`
    UPDATE vehicles
    SET maintenance_finished_at = NULL
    WHERE maintenance_finished_at IS NOT NULL
      AND datetime(maintenance_finished_at) < datetime('now', '-24 hours')
  `);

  const emitVehicleUpdated = (plate: string) => {
    const updated = vehicleRepo.getVehicleByPlate(plate);
    if (updated) {
      io.emit("vehicle:updated", updated);
    }
    return updated;
  };

  const getVehicleRow = (plate: string): VehicleRow | undefined =>
    getVehicleByPlateStmt.get(plate) as VehicleRow | undefined;

  return {
    clearStaleMaintenanceFinishedAt: () => {
      clearStaleMaintenanceFinishedAtStmt.run();
    },

    listVehicles: () => {
      clearStaleMaintenanceFinishedAtStmt.run();
      return vehicleRepo.getAllVehicles();
    },

    updateStatus: (plate: string, status: string) => {
      const vehicle = getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      const tripStartTime = status === "EM TRÂNSITO" ? new Date().toISOString() : null;

      db.prepare(
        `
        UPDATE vehicles
        SET status = ?,
            trip_start_time = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(status, tripStartTime, plate);

      const updated = emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    updateMaintenanceFields: (
      plate: string,
      input: {
        driver: string | null;
        reason: string | null;
        location: string | null;
        forecast: string | null;
      },
    ) => {
      const vehicle = getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      db.prepare(
        `
        UPDATE vehicles
        SET driver = COALESCE(?, driver),
            maintenance_reason = COALESCE(?, maintenance_reason),
            location_name = COALESCE(?, location_name),
            maintenance_prev_date = COALESCE(?, maintenance_prev_date),
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(input.driver, input.reason, input.location, input.forecast, plate);

      const updated = emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    updateObservation: (plate: string, observation: string | null) => {
      const vehicle = getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      db.prepare(
        `
        UPDATE vehicles
        SET observation = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(observation, plate);

      const updated = emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    enterMaintenance: (
      plate: string,
      input: {
        driver: string | null;
        reason: string | null;
        location: string | null;
        forecast: string | null;
      },
    ) => {
      const current = getVehicleRow(plate);
      if (!current) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      db.prepare(
        `
        UPDATE vehicles
        SET status = 'EM MANUTENÇÃO',
            driver = ?,
            maintenance_reason = ?,
            location_name = ?,
            maintenance_prev_date = ?,
            maintenance_finished_at = NULL,
            trip_start_time = NULL,
            last_operational_driver = COALESCE(last_operational_driver, ?),
            last_operational_location = COALESCE(last_operational_location, ?),
            last_operational_speed = COALESCE(last_operational_speed, ?),
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(
        input.driver,
        input.reason,
        input.location,
        input.forecast,
        current.driver,
        current.location_name,
        current.speed,
        plate,
      );

      const updated = emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    cancelMaintenance: (plate: string) => {
      const vehicle = getVehicleRow(plate);
      if (!vehicle) {
        return { ok: false as const, status: 404, error: "Vehicle not found" };
      }

      const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);
      const tripStartTime =
        fallbackStatus === "EM TRÂNSITO"
          ? (vehicle.trip_start_time as string | null) || new Date().toISOString()
          : null;

      db.prepare(
        `
        UPDATE vehicles
        SET status = ?,
            driver = COALESCE(last_operational_driver, driver),
            location_name = COALESCE(last_operational_location, location_name),
            speed = COALESCE(last_operational_speed, speed),
            maintenance_reason = NULL,
            maintenance_type = NULL,
            maintenance_prev_date = NULL,
            maintenance_finished_at = NULL,
            trip_start_time = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(fallbackStatus, tripStartTime, plate);

      const updated = emitVehicleUpdated(plate);
      return { ok: true as const, vehicle: updated };
    },

    finishMaintenance: (
      plate: string,
      input: { reason: string | null; location: string | null },
    ) => {
      const vehicle = getVehicleRow(plate);
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

      db.prepare(
        `
        UPDATE vehicles
        SET status = ?,
            driver = COALESCE(last_operational_driver, driver),
            location_name = COALESCE(last_operational_location, location_name),
            speed = COALESCE(last_operational_speed, speed),
            maintenance_finished_at = ?,
            maintenance_reason = NULL,
            maintenance_type = NULL,
            maintenance_prev_date = NULL,
            trip_start_time = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `,
      ).run(fallbackStatus, finishedAt, tripStartTime, plate);

      const historyReason = input.reason || (vehicle.maintenance_reason as string | null);
      const historyLocation = input.location || (vehicle.location_name as string | null);
      const historyForecast = new Date(
        finishedAtDate.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      db.prepare(
        `
        INSERT INTO maintenance_history (plate, driver, reason, location, start_date, finish_date, forecast_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        vehicle.plate,
        vehicle.driver,
        historyReason,
        historyLocation,
        vehicle.last_update,
        finishedAt,
        historyForecast,
      );

      const updated = emitVehicleUpdated(plate);
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
