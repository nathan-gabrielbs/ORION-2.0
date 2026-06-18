import { query, queryOne } from "../../db/client.js";

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

export function createEfficiencyService() {
  const calculateFleetEfficiency = async (): Promise<FleetEfficiencySnapshot> => {
    const result = await query<{ status?: string | null }>("SELECT status FROM vehicles");
    const vehicles = result.rows;
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

  const saveSnapshot = async (): Promise<FleetEfficiencySnapshot> => {
    const snapshot = await calculateFleetEfficiency();

    await query(
      `
      INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
      VALUES ($1, $2, $3, $4)
    `,
      [
        snapshot.timestamp,
        snapshot.efficiency,
        snapshot.totalVehicles,
        snapshot.operationalVehicles,
      ],
    );

    return snapshot;
  };

  const getStartOfDayEfficiency = async (): Promise<StartOfDayEfficiency> => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    const currentDayRecord = await queryOne<{
      id: number;
      timestamp: string;
      efficiency: number;
      total_vehicles: number;
      operational_vehicles: number;
    }>(
      `
      SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
      FROM fleet_efficiency_history
      WHERE timestamp >= $1 AND timestamp < $2
      ORDER BY ABS(EXTRACT(EPOCH FROM timestamp) - EXTRACT(EPOCH FROM $3::timestamptz)) ASC
      LIMIT 1
    `,
      [startIso, endIso, startIso],
    );

    const closestRecord =
      currentDayRecord ||
      (await queryOne<{
        id: number;
        timestamp: string;
        efficiency: number;
        total_vehicles: number;
        operational_vehicles: number;
      }>(
        `
        SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
        FROM fleet_efficiency_history
        ORDER BY ABS(EXTRACT(EPOCH FROM timestamp) - EXTRACT(EPOCH FROM $1::timestamptz)) ASC
        LIMIT 1
      `,
        [startIso],
      ));

    if (!closestRecord) {
      const snapshot = await calculateFleetEfficiency();
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
