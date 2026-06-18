import { query } from "../../db/client.js";
import { mapTrackerLocation, normalizeDriverName } from "../../integrations/sighra/macro-utils.js";

export async function sanitizeExistingVehicleData(): Promise<void> {
  const existingVehicles = (
    await query<{ plate: string; driver: string | null }>(`SELECT plate, driver FROM vehicles`)
  ).rows;

  for (const row of existingVehicles) {
    const normalizedDriver = normalizeDriverName(row.driver);
    if (normalizedDriver && normalizedDriver !== String(row.driver || "").trim()) {
      await query(`UPDATE vehicles SET driver = $1 WHERE plate = $2`, [
        normalizedDriver,
        row.plate,
      ]);
    }
  }

  const existingVehicleLocations = (
    await query<{
      plate: string;
      location_name: string | null;
      last_operational_location: string | null;
    }>(`
      SELECT plate, location_name, last_operational_location
      FROM vehicles
    `)
  ).rows;

  for (const row of existingVehicleLocations) {
    const mappedLocation = mapTrackerLocation(row.location_name);
    const mappedOperationalLocation = mapTrackerLocation(row.last_operational_location);

    if (
      mappedLocation !== (row.location_name || "") ||
      mappedOperationalLocation !== (row.last_operational_location || "")
    ) {
      await query(
        `
        UPDATE vehicles
        SET location_name = $1,
            last_operational_location = $2
        WHERE plate = $3
      `,
        [
          mappedLocation || row.location_name,
          mappedOperationalLocation || row.last_operational_location,
          row.plate,
        ],
      );
    }
  }
}
