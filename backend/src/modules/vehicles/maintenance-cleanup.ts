import { query } from "../../db/client.js";

export async function cleanupFinishedMaintenanceByForecast(): Promise<void> {
  await query(`
    UPDATE vehicles
    SET maintenance_finished_at = NULL
    WHERE maintenance_finished_at IS NOT NULL
      AND (
        SELECT mh.forecast_date::timestamptz
        FROM maintenance_history mh
        WHERE mh.plate = vehicles.plate
        ORDER BY mh.finish_date DESC NULLS LAST, mh.id DESC
        LIMIT 1
      ) <= NOW()
  `);
}
