import type Database from "better-sqlite3";

export function cleanupFinishedMaintenanceByForecast(db: Database.Database): void {
  db.prepare(
    `
    UPDATE vehicles
    SET maintenance_finished_at = NULL
    WHERE maintenance_finished_at IS NOT NULL
      AND (
        SELECT datetime(mh.forecast_date)
        FROM maintenance_history mh
        WHERE mh.plate = vehicles.plate
        ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
        LIMIT 1
      ) <= datetime('now')
  `,
  ).run();
}
