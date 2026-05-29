import type Database from "better-sqlite3";
import { createDatabase } from "../../db/client.js";

export type TestVehicleInput = {
  plate?: string;
  driver?: string;
  status?: string;
  speed?: number;
  lat?: number;
  lng?: number;
  course?: number;
  location_name?: string | null;
  trip_start_time?: string | null;
  last_operational_macro?: string | null;
  last_operational_driver?: string | null;
  last_operational_location?: string | null;
  last_operational_speed?: number | null;
  maintenance_finished_at?: string | null;
  maintenance_reason?: string | null;
  route_origin?: string | null;
  route_destination?: string | null;
};

export function createTestDatabase(): Database.Database {
  return createDatabase(":memory:");
}

export function insertTestVehicle(db: Database.Database, input: TestVehicleInput = {}): string {
  const plate = input.plate ?? "BWT-9999";

  db.prepare(
    `
    INSERT INTO vehicles (
      id,
      plate,
      driver,
      status,
      speed,
      lat,
      lng,
      course,
      location_name,
      trip_start_time,
      last_operational_macro,
      last_operational_driver,
      last_operational_location,
      last_operational_speed,
      maintenance_finished_at,
      maintenance_reason,
      route_origin,
      route_destination
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    plate,
    plate,
    input.driver ?? "SEM MOTORISTA",
    input.status ?? "VEÍCULO VAZIO",
    input.speed ?? 0,
    input.lat ?? -25.429,
    input.lng ?? -49.2671,
    input.course ?? 0,
    input.location_name ?? "Curitiba, PR",
    input.trip_start_time ?? null,
    input.last_operational_macro ?? null,
    input.last_operational_driver ?? null,
    input.last_operational_location ?? null,
    input.last_operational_speed ?? null,
    input.maintenance_finished_at ?? null,
    input.maintenance_reason ?? null,
    input.route_origin ?? null,
    input.route_destination ?? null,
  );

  return plate;
}

export function getVehicleRow(
  db: Database.Database,
  plate: string,
): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM vehicles WHERE plate = ?").get(plate) as
    | Record<string, unknown>
    | undefined;
}
