export const VEHICLES_WITH_FORECAST_SELECT = `
  SELECT 
    v.*,
    pr.model AS fleet_model,
    pr.year AS fleet_year,
    pr.operation_name AS fleet_operation_name,
    op.logo_url AS fleet_operation_logo_url,
    COALESCE(
      v.maintenance_prev_date,
      (
        SELECT mh.forecast_date
        FROM maintenance_history mh
        WHERE mh.plate = v.plate
        ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
        LIMIT 1
      )
    ) AS maintenance_forecast_date,
    (
      SELECT mh.reason
      FROM maintenance_history mh
      WHERE mh.plate = v.plate
      ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
      LIMIT 1
    ) AS maintenance_history_reason,
    (
      SELECT mh.location
      FROM maintenance_history mh
      WHERE mh.plate = v.plate
      ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
      LIMIT 1
    ) AS maintenance_history_location
  FROM vehicles v
  LEFT JOIN plate_registry pr ON pr.plate = v.plate
  LEFT JOIN operations op ON op.name = pr.operation_name
`;
