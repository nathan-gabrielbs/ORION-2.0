import type Database from "better-sqlite3";

const CORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    plate TEXT UNIQUE,
    driver TEXT,
    status TEXT,
    speed INTEGER,
    lat REAL,
    lng REAL,
    course REAL,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_name TEXT,
    eta TEXT,
    maintenance_reason TEXT,
    maintenance_type TEXT,
    maintenance_prev_date TEXT,
    maintenance_finished_at DATETIME,
    trip_start_time DATETIME,
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
    route_progress_percent REAL,
    route_timeline_link TEXT
  );

  CREATE TABLE IF NOT EXISTS maintenance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT,
    driver TEXT,
    reason TEXT,
    location TEXT,
    start_date DATETIME,
    finish_date DATETIME,
    forecast_date TEXT
  );

  CREATE TABLE IF NOT EXISTS macros_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT,
    driver TEXT,
    macro_id TEXT,
    macro_description TEXT,
    macro_group TEXT,
    created_at TEXT,
    latitude REAL,
    longitude REAL,
    city TEXT,
    state TEXT,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS fleet_efficiency_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    efficiency REAL NOT NULL,
    total_vehicles INTEGER NOT NULL,
    operational_vehicles INTEGER NOT NULL
  );
`;

const OPERATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS operations (
    name TEXT PRIMARY KEY,
    logo_url TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plate_registry (
    plate TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    operation_name TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(operation_name) REFERENCES operations(name) ON UPDATE CASCADE
  );
`;

const AUTH_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
    auth_provider TEXT NOT NULL DEFAULT 'LOCAL' CHECK(auth_provider IN ('LOCAL','ORBITAL')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- OAuth/OIDC transient state for the Orbital SSO flow (PKCE). Lives in the DB
  -- instead of an in-memory Map / session store so that:
  --   1. A process restart between /auth/orbital/login and /auth/callback
  --      doesn't break the user's login.
  --   2. A future multi-instance deploy works without sticky sessions.
  -- Single-use: the row is deleted on callback. Expired rows are cleaned up
  -- best-effort whenever we touch the table.
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    nonce TEXT,
    code_verifier TEXT,
    return_to TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
`;

export function applySchema(db: Database.Database): void {
  db.exec(CORE_SCHEMA);
  db.exec(OPERATIONS_SCHEMA);
  db.exec(AUTH_SCHEMA);
}
