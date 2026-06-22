import {
  closeDatabase,
  initDatabase,
  query,
  queryOne,
  resetTestDatabase,
} from "../../db/client.js";

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

export async function createTestDatabase(): Promise<void> {
  await initDatabase();
  await resetTestDatabase();
}

export async function insertTestVehicle(input: TestVehicleInput = {}): Promise<string> {
  const plate = input.plate ?? "BWT-9999";

  await query(
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  `,
    [
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
    ],
  );

  return plate;
}

export async function getVehicleRow(plate: string): Promise<Record<string, unknown> | undefined> {
  return queryOne("SELECT * FROM vehicles WHERE plate = $1", [plate]);
}

export { closeDatabase, resetTestDatabase };
