export interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  status: string;
  speed: number;
  lat: number;
  lng: number;
  last_update: string;
  location_name: string;
  eta?: string | null;
  maintenance_reason?: string | null;
  maintenance_type?: string | null;
  maintenance_prev_date?: string | null;
  maintenance_finished_at?: string | null;
  maintenance_expires_at?: string | null;
  trip_start_time?: string | null;
  last_macro?: string | null;
  last_macro_time?: string | null;
  last_operational_macro?: string | null;
  last_operational_macro_time?: string | null;
  observation?: string | null;
  course?: number | null;
  route_origin?: string | null;
  route_destination?: string | null;
  route_progress_percent?: number | null;
  route_timeline_link?: string | null;
  maintenance_forecast_date?: string | null;
  maintenance_history_reason?: string | null;
  maintenance_history_location?: string | null;
  fleet_model?: string | null;
  fleet_year?: number | null;
  fleet_operation_name?: string | null;
  fleet_operation_logo_url?: string | null;
}

export type ViewType = "KANBAN" | "MAPA";
