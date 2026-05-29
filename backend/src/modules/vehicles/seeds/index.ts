import type Database from "better-sqlite3";
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

export function seedVehiclesIfNeeded(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM vehicles").get() as { count: number };

  if (
    count.count !== 0 &&
    !(
      db.prepare("SELECT plate FROM vehicles LIMIT 1").get() as { plate?: string } | undefined
    )?.plate?.startsWith("BWT-")
  ) {
    return;
  }

  db.prepare("DELETE FROM vehicles").run();

  const insert = db.prepare(`
    INSERT INTO vehicles(
      id, plate, driver, status, speed, lat, lng, course, location_name, eta, trip_start_time,
      last_macro, last_macro_time, last_operational_macro, last_operational_macro_time,
      last_operational_driver, last_operational_location, last_operational_speed, observation,
      route_origin, route_destination, route_progress_percent, route_timeline_link
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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

    insert.run(
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
    );
  }
}

export function seedPlateRegistry(db: Database.Database): void {
  const rows = INITIAL_PLATE_REGISTRY_TSV.trim()
    .split("\n")
    .map((line) => line.split("\t").map((item) => item.trim()))
    .filter((parts) => parts.length === 4);

  const insertOperation = db.prepare(`
    INSERT OR IGNORE INTO operations (name, logo_url)
    VALUES (?, NULL)
  `);

  const insertPlate = db.prepare(`
    INSERT OR IGNORE INTO plate_registry (plate, model, year, operation_name)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const [plateRaw, model, yearRaw, operationName] of rows) {
      const plate = normalizePlate(plateRaw);
      if (!plate) continue;
      const year = Number(yearRaw);
      if (!Number.isFinite(year)) continue;

      insertOperation.run(operationName);
      insertPlate.run(plate, model, year, operationName);
    }
  });

  transaction();
}
