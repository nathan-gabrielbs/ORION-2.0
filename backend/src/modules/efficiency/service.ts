import type Database from "better-sqlite3";

export type FleetEfficiencySnapshot = {
  timestamp: string;
  efficiency: number;
  totalVehicles: number;
  operationalVehicles: number;
};

export type StartOfDayEfficiency = FleetEfficiencySnapshot & {
  id?: number;
  source: "history-current-day" | "history-nearest" | "fallback-current";
};

function normalizeStatus(status?: string | null): string {
  return String(status || "")
    .trim()
    .toUpperCase();
}

export function isOperationalStatus(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return (
    normalized === "EM TRÂNSITO" ||
    normalized === "AGUARDANDO CARREGAMENTO" ||
    normalized === "EFETUANDO CARREGAMENTO" ||
    normalized === "AGUARDANDO DESCARREGAMENTO" ||
    normalized === "EFETUANDO DESCARREGAMENTO"
  );
}

export type EfficiencyService = ReturnType<typeof createEfficiencyService>;

export function createEfficiencyService(deps: { db: Database.Database }) {
  const { db } = deps;

  const listVehicleStatusesStmt = db.prepare("SELECT status FROM vehicles");
  const insertSnapshotStmt = db.prepare(`
    INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
    VALUES (?, ?, ?, ?)
  `);

  const getCurrentDayRecordStmt = db.prepare(`
    SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
    FROM fleet_efficiency_history
    WHERE timestamp >= ? AND timestamp < ?
    ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
    LIMIT 1
  `);

  const getNearestRecordStmt = db.prepare(`
    SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
    FROM fleet_efficiency_history
    ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
    LIMIT 1
  `);

  const calculateFleetEfficiency = (): FleetEfficiencySnapshot => {
    const vehicles = listVehicleStatusesStmt.all() as Array<{ status?: string | null }>;
    const totalVehicles = vehicles.length;
    const operationalVehicles = vehicles.filter((vehicle) =>
      isOperationalStatus(vehicle.status),
    ).length;
    const efficiency = totalVehicles
      ? Number(((operationalVehicles / totalVehicles) * 100).toFixed(1))
      : 0;

    return {
      timestamp: new Date().toISOString(),
      efficiency,
      totalVehicles,
      operationalVehicles,
    };
  };

  const saveSnapshot = (): FleetEfficiencySnapshot => {
    const snapshot = calculateFleetEfficiency();

    insertSnapshotStmt.run(
      snapshot.timestamp,
      snapshot.efficiency,
      snapshot.totalVehicles,
      snapshot.operationalVehicles,
    );

    return snapshot;
  };

  const getStartOfDayEfficiency = (): StartOfDayEfficiency => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    const currentDayRecord = getCurrentDayRecordStmt.get(startIso, endIso, startIso) as
      | {
          id: number;
          timestamp: string;
          efficiency: number;
          total_vehicles: number;
          operational_vehicles: number;
        }
      | undefined;

    const closestRecord =
      currentDayRecord ||
      (getNearestRecordStmt.get(startIso) as
        | {
            id: number;
            timestamp: string;
            efficiency: number;
            total_vehicles: number;
            operational_vehicles: number;
          }
        | undefined);

    if (!closestRecord) {
      const snapshot = calculateFleetEfficiency();
      return {
        ...snapshot,
        source: "fallback-current",
      };
    }

    return {
      id: closestRecord.id,
      timestamp: closestRecord.timestamp,
      efficiency: Number(closestRecord.efficiency),
      totalVehicles: Number(closestRecord.total_vehicles),
      operationalVehicles: Number(closestRecord.operational_vehicles),
      source: currentDayRecord ? "history-current-day" : "history-nearest",
    };
  };

  return {
    calculateFleetEfficiency,
    saveSnapshot,
    getStartOfDayEfficiency,
  };
}
