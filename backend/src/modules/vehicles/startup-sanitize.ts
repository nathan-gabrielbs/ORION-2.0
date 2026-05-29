import type Database from "better-sqlite3";
import { mapTrackerLocation, normalizeDriverName } from "../../integrations/sighra/macro-utils.js";

export function sanitizeExistingVehicleData(db: Database.Database): void {
  const sanitizeDriverStmt = db.prepare(`
    UPDATE vehicles
    SET driver = ?
    WHERE plate = ?
  `);

  const existingVehicles = db.prepare(`SELECT plate, driver FROM vehicles`).all() as Array<{
    plate: string;
    driver: string | null;
  }>;

  for (const row of existingVehicles) {
    const normalizedDriver = normalizeDriverName(row.driver);
    if (normalizedDriver && normalizedDriver !== String(row.driver || "").trim()) {
      sanitizeDriverStmt.run(normalizedDriver, row.plate);
    }
  }

  const sanitizeLocationStmt = db.prepare(`
    UPDATE vehicles
    SET location_name = ?,
        last_operational_location = ?
    WHERE plate = ?
  `);

  const existingVehicleLocations = db
    .prepare(
      `
    SELECT plate, location_name, last_operational_location
    FROM vehicles
  `,
    )
    .all() as Array<{
    plate: string;
    location_name: string | null;
    last_operational_location: string | null;
  }>;

  for (const row of existingVehicleLocations) {
    const mappedLocation = mapTrackerLocation(row.location_name);
    const mappedOperationalLocation = mapTrackerLocation(row.last_operational_location);

    if (
      mappedLocation !== (row.location_name || "") ||
      mappedOperationalLocation !== (row.last_operational_location || "")
    ) {
      sanitizeLocationStmt.run(
        mappedLocation || row.location_name,
        mappedOperationalLocation || row.last_operational_location,
        row.plate,
      );
    }
  }
}
