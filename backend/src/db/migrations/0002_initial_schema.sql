CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  plate TEXT UNIQUE,
  driver TEXT,
  status TEXT,
  speed INTEGER,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  course DOUBLE PRECISION,
  last_update TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  location_name TEXT,
  eta TEXT,
  maintenance_reason TEXT,
  maintenance_type TEXT,
  maintenance_prev_date TEXT,
  maintenance_finished_at TIMESTAMPTZ,
  trip_start_time TIMESTAMPTZ,
  last_macro TEXT,
  last_macro_time TEXT,
  last_operational_macro TEXT,
  last_operational_macro_time TEXT,
  last_operational_driver TEXT,
  last_operational_location TEXT,
  last_operational_speed INTEGER,
  observation TEXT,
  route_origin TEXT,
  route_destination TEXT,
  route_progress_percent DOUBLE PRECISION,
  route_timeline_link TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_history (
  id SERIAL PRIMARY KEY,
  plate TEXT,
  driver TEXT,
  reason TEXT,
  location TEXT,
  start_date TIMESTAMPTZ,
  finish_date TIMESTAMPTZ,
  forecast_date TEXT
);

CREATE TABLE IF NOT EXISTS macros_history (
  id SERIAL PRIMARY KEY,
  plate TEXT,
  driver TEXT,
  macro_id TEXT,
  macro_description TEXT,
  macro_group TEXT,
  created_at TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city TEXT,
  state TEXT,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS fleet_efficiency_history (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  efficiency DOUBLE PRECISION NOT NULL,
  total_vehicles INTEGER NOT NULL,
  operational_vehicles INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  name TEXT PRIMARY KEY,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plate_registry (
  plate TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operation_name) REFERENCES operations (name) ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
  auth_provider TEXT NOT NULL DEFAULT 'LOCAL' CHECK (auth_provider IN ('LOCAL', 'ORBITAL')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT,
  code_verifier TEXT,
  return_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states (expires_at);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_operations_updated_at ON operations;
CREATE TRIGGER trg_operations_updated_at
  BEFORE UPDATE ON operations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_plate_registry_updated_at ON plate_registry;
CREATE TRIGGER trg_plate_registry_updated_at
  BEFORE UPDATE ON plate_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
