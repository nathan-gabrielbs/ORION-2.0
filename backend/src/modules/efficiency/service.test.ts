import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryOne } from "../../db/client.js";
import {
  closeDatabase,
  createTestDatabase,
  insertTestVehicle,
  resetTestDatabase,
} from "../../test/helpers/database.js";
import { createEfficiencyService, isOperationalStatus } from "./service.js";

describe("createEfficiencyService", () => {
  beforeEach(async () => {
    await createTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
  });

  it("detects operational vehicle statuses", () => {
    expect(isOperationalStatus("EM TRÂNSITO")).toBe(true);
    expect(isOperationalStatus("efetuando carregamento")).toBe(true);
    expect(isOperationalStatus("VEÍCULO VAZIO")).toBe(false);
    expect(isOperationalStatus("MANUTENÇÃO")).toBe(false);
  });

  it("returns zero efficiency when fleet is empty", async () => {
    const efficiencyService = createEfficiencyService();
    const snapshot = await efficiencyService.calculateFleetEfficiency();

    expect(snapshot).toMatchObject({
      efficiency: 0,
      totalVehicles: 0,
      operationalVehicles: 0,
    });
  });

  it("calculates operational percentage from vehicle statuses", async () => {
    const efficiencyService = createEfficiencyService();

    await insertTestVehicle({ plate: "AAA-1111", status: "EM TRÂNSITO" });
    await insertTestVehicle({ plate: "BBB-2222", status: "EFETUANDO CARREGAMENTO" });
    await insertTestVehicle({ plate: "CCC-3333", status: "VEÍCULO VAZIO" });

    const snapshot = await efficiencyService.calculateFleetEfficiency();

    expect(snapshot.totalVehicles).toBe(3);
    expect(snapshot.operationalVehicles).toBe(2);
    expect(snapshot.efficiency).toBe(66.7);
  });

  it("persists snapshot in fleet_efficiency_history", async () => {
    const efficiencyService = createEfficiencyService();
    await insertTestVehicle({ plate: "AAA-1111", status: "EM TRÂNSITO" });

    const snapshot = await efficiencyService.saveSnapshot();

    const row = await queryOne<{
      efficiency: number;
      total_vehicles: number;
      operational_vehicles: number;
    }>(
      `
        SELECT efficiency, total_vehicles, operational_vehicles
        FROM fleet_efficiency_history
        WHERE timestamp = $1
      `,
      [snapshot.timestamp],
    );

    expect(row).toMatchObject({
      efficiency: 100,
      total_vehicles: 1,
      operational_vehicles: 1,
    });
  });

  it("returns start-of-day record from history when available", async () => {
    const efficiencyService = createEfficiencyService();
    const startOfDay = new Date();
    startOfDay.setHours(8, 0, 0, 0);

    const { query } = await import("../../db/client.js");
    await query(
      `
      INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
      VALUES ($1, $2, $3, $4)
    `,
      [startOfDay.toISOString(), 75.5, 4, 3],
    );

    const snapshot = await efficiencyService.getStartOfDayEfficiency();

    expect(snapshot.source).toBe("history-current-day");
    expect(snapshot.efficiency).toBe(75.5);
    expect(snapshot.totalVehicles).toBe(4);
    expect(snapshot.operationalVehicles).toBe(3);
  });
});
