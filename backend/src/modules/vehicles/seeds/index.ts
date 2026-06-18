import { query, queryOne } from "../../../db/client.js";
import { normalizePlate } from "../../../shared/utils/plate.js";
import { FLEET_PLATES } from "./fleet-plates.js";
import { INITIAL_PLATE_REGISTRY_TSV } from "./plate-registry-data.js";

const VEHICLE_STATUSES = [
  "EM TRÂNSITO",
  "AGUARDANDO CARREGAMENTO",
  "EFETUANDO CARREGAMENTO",
  "AGUARDANDO DESCARREGAMENTO",
  "EFETUANDO DESCARREGAMENTO",
  "VEÍCULO VAZIO",
];

export async function seedVehiclesIfNeeded(): Promise<void> {
  const countRow = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM vehicles",
  );
  const count = Number(countRow?.count ?? 0);

  const sample = await queryOne<{ plate?: string }>("SELECT plate FROM vehicles LIMIT 1");

  if (count !== 0 && !sample?.plate?.startsWith("BWT-")) {
    return;
  }

  await query("DELETE FROM vehicles");

  for (const plate of FLEET_PLATES) {
    const driver = "SEM MOTORISTA";
    const status = VEHICLE_STATUSES[Math.floor(Math.random() * VEHICLE_STATUSES.length)];
    const speed = status === "EM TRÂNSITO" ? Math.floor(Math.random() * 40) + 40 : 0;
    const lat = -25.429 + (Math.random() - 0.5) * 0.2;
    const lng = -49.2671 + (Math.random() - 0.5) * 0.2;
    const location = "Curitiba, PR";
    const eta = status === "EM TRÂNSITO" ? "18:30" : null;
    const tripStartTime =
      status === "EM TRÂNSITO"
        ? new Date(Date.now() - Math.floor(Math.random() * 12 * 3600000)).toISOString()
        : null;
    const course = Math.floor(Math.random() * 360);

    await query(
      `
      INSERT INTO vehicles(
        id, plate, driver, status, speed, lat, lng, course, location_name, eta, trip_start_time,
        last_macro, last_macro_time, last_operational_macro, last_operational_macro_time,
        last_operational_driver, last_operational_location, last_operational_speed, observation,
        route_origin, route_destination, route_progress_percent, route_timeline_link
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `,
      [
        plate,
        plate,
        driver,
        status,
        speed,
        lat,
        lng,
        course,
        location,
        eta,
        tripStartTime,
        null,
        null,
        null,
        null,
        driver,
        location,
        speed,
        null,
        null,
        null,
        null,
        null,
      ],
    );
  }
}

export async function seedPlateRegistry(): Promise<void> {
  const rows = INITIAL_PLATE_REGISTRY_TSV.trim()
    .split("\n")
    .map((line) => line.split("\t").map((item) => item.trim()))
    .filter((parts) => parts.length === 4);

  for (const [plateRaw, model, yearRaw, operationName] of rows) {
    const plate = normalizePlate(plateRaw);
    if (!plate) continue;
    const year = Number(yearRaw);
    if (!Number.isFinite(year)) continue;

    await query(
      `
      INSERT INTO operations (name, logo_url)
      VALUES ($1, NULL)
      ON CONFLICT (name) DO NOTHING
    `,
      [operationName],
    );

    await query(
      `
      INSERT INTO plate_registry (plate, model, year, operation_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (plate) DO NOTHING
    `,
      [plate, model, year, operationName],
    );
  }
}
