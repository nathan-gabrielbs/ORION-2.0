import type Database from "better-sqlite3";
import type { Server } from "socket.io";
import type { RasterClient } from "./client.js";
import {
  extractTripPlates,
  isConsideredRasterTrip,
  mergeStopsByCompleteness,
  scoreTripCompleteness,
  selectOriginAndDestination,
} from "./trip-utils.js";
import { resolveIbgeCityLabels, safeIBGECode } from "../external/ibge.js";
import { asArray } from "../shared/values.js";
import type { VehicleModule } from "../../modules/vehicles/index.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type RasterSyncService = ReturnType<typeof createRasterSyncService>;

export function createRasterSyncService(deps: {
  db: Database.Database;
  io: Server;
  rasterClient: RasterClient;
  vehicleRepo: VehicleModule;
  rasterLogin: string;
  rasterPassword: string;
}) {
  const { db, io, rasterClient, vehicleRepo, rasterLogin, rasterPassword } = deps;

  const pollRasterTrips = async () => {
    if (!rasterLogin || !rasterPassword) {
      console.log("Skipping Raster polling: missing RASTER_LOGIN/RASTER_PASSWORD");
      return;
    }

    try {
      const endpoint = rasterClient.getTripsEndpoint();

      console.log(`Polling Raster trips at ${endpoint} ...`);

      const resultList = (await rasterClient.fetchResultList(true)) as any[];
      const allStops = resultList.flatMap((result: any) =>
        asArray(result?.Viagens).flatMap((trip: any) => asArray(trip?.ColetasEntregas)),
      );
      const ibgeCodes = allStops
        .map((stop: any) => safeIBGECode(stop?.CodIBGECidade))
        .filter((code: number | null): code is number => code != null);
      const ibgeLabels = await resolveIbgeCityLabels(ibgeCodes);

      const totalTrips = resultList.reduce(
        (acc: number, result: any) => acc + asArray(result?.Viagens).length,
        0,
      );

      console.log(
        `Raster response received: ${resultList.length} result block(s), ${totalTrips} viagem(ns)`,
      );

      const updateRouteStmt = db.prepare(`
        UPDATE vehicles
        SET route_origin = ?,
            route_destination = ?,
            route_progress_percent = ?,
            route_timeline_link = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);
      const clearRouteStmt = db.prepare(`
        UPDATE vehicles
        SET route_origin = NULL,
            route_destination = NULL,
            route_progress_percent = NULL,
            route_timeline_link = NULL,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);

      const getVehicleStmt = db.prepare(`SELECT * FROM vehicles WHERE plate = ?`);
      const getVehiclesWithRouteStmt = db.prepare(`
        SELECT plate
        FROM vehicles
        WHERE route_origin IS NOT NULL
           OR route_destination IS NOT NULL
           OR route_progress_percent IS NOT NULL
           OR route_timeline_link IS NOT NULL
      `);

      let updatedCount = 0;
      let clearedCount = 0;
      const skippedPlates = new Set<string>();
      const bestTripByPlate = new Map<string, any>();
      const excludedTripPlates = new Set<string>();

      for (const result of resultList) {
        for (const trip of asArray(result?.Viagens)) {
          const tripPlates = extractTripPlates(trip);
          if (!tripPlates.length) continue;

          if (!isConsideredRasterTrip(trip)) {
            tripPlates.forEach((plate) => excludedTripPlates.add(plate));
            continue;
          }

          const plate = normalizePlate(trip?.PlacaVeiculo) || tripPlates[0];

          const currentBest = bestTripByPlate.get(plate);
          if (!currentBest || scoreTripCompleteness(trip) >= scoreTripCompleteness(currentBest)) {
            bestTripByPlate.set(plate, trip);
          }
        }
      }

      for (const [plate, trip] of bestTripByPlate.entries()) {
        const currentVehicle = getVehicleStmt.get(plate) as any;
        if (!currentVehicle) {
          skippedPlates.add(plate);
          continue;
        }

        const canonicalStops = mergeStopsByCompleteness(asArray(trip?.ColetasEntregas));
        const { origin, destination, progressPercent } = selectOriginAndDestination(
          canonicalStops,
          ibgeLabels,
        );
        const timelineLink = String(trip?.LinkTimeLine || "").trim() || null;

        updateRouteStmt.run(origin, destination, progressPercent, timelineLink, plate);

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          updatedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      const platesToClear = new Set<string>();

      for (const plate of excludedTripPlates) {
        if (!bestTripByPlate.has(plate)) {
          platesToClear.add(plate);
        }
      }

      const vehiclesWithRoute = getVehiclesWithRouteStmt.all() as Array<{ plate: string }>;
      for (const vehicle of vehiclesWithRoute) {
        const plate = normalizePlate(vehicle?.plate);
        if (!plate) continue;
        if (bestTripByPlate.has(plate)) continue;
        platesToClear.add(plate);
      }

      for (const plate of platesToClear) {
        const currentVehicle = getVehicleStmt.get(plate) as any;
        if (!currentVehicle) continue;

        clearRouteStmt.run(plate);

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          clearedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      console.log(
        `Raster polling completed: ${updatedCount} veículo(s) atualizado(s), ${clearedCount} rota(s) limpa(s), ${skippedPlates.size} placa(s) ignorada(s) por não encontrada(s) no cadastro.`,
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const responseBody = error?.response?.data;

      console.error("Error polling Raster trips:", error?.message || error);
      if (status) {
        console.error(`Raster HTTP status: ${status}`);
      }
      if (responseBody) {
        console.error(
          "Raster response body:",
          typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
        );
      }
    }
  };
  return {
    pollTrips: pollRasterTrips,
  };
}
