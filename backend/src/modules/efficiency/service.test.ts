import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase, insertTestVehicle } from "../../test/helpers/database.js";
import { createEfficiencyService, isOperationalStatus } from "./service.js";

describe("createEfficiencyService", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function createService() {
    db = createTestDatabase();
    return createEfficiencyService({ db });
  }

  it("detects operational vehicle statuses", () => {
    expect(isOperationalStatus("EM TRÂNSITO")).toBe(true);
    expect(isOperationalStatus("efetuando carregamento")).toBe(true);
    expect(isOperationalStatus("VEÍCULO VAZIO")).toBe(false);
    expect(isOperationalStatus("MANUTENÇÃO")).toBe(false);
  });

  it("returns zero efficiency when fleet is empty", () => {
    const efficiencyService = createService();
    const snapshot = efficiencyService.calculateFleetEfficiency();

    expect(snapshot).toMatchObject({
      efficiency: 0,
      totalVehicles: 0,
      operationalVehicles: 0,
    });
  });

  it("calculates operational percentage from vehicle statuses", () => {
    const efficiencyService = createService();

    insertTestVehicle(db, { plate: "AAA-1111", status: "EM TRÂNSITO" });
    insertTestVehicle(db, { plate: "BBB-2222", status: "EFETUANDO CARREGAMENTO" });
    insertTestVehicle(db, { plate: "CCC-3333", status: "VEÍCULO VAZIO" });

    const snapshot = efficiencyService.calculateFleetEfficiency();

    expect(snapshot.totalVehicles).toBe(3);
    expect(snapshot.operationalVehicles).toBe(2);
    expect(snapshot.efficiency).toBe(66.7);
  });

  it("persists snapshot in fleet_efficiency_history", () => {
    const efficiencyService = createService();
    insertTestVehicle(db, { plate: "AAA-1111", status: "EM TRÂNSITO" });

    const snapshot = efficiencyService.saveSnapshot();

    const row = db
      .prepare(
        `
        SELECT efficiency, total_vehicles, operational_vehicles
        FROM fleet_efficiency_history
        WHERE timestamp = ?
      `,
      )
      .get(snapshot.timestamp) as
      | { efficiency: number; total_vehicles: number; operational_vehicles: number }
      | undefined;

    expect(row).toMatchObject({
      efficiency: 100,
      total_vehicles: 1,
      operational_vehicles: 1,
    });
  });

  it("returns start-of-day record from history when available", () => {
    const efficiencyService = createService();
    const startOfDay = new Date();
    startOfDay.setHours(8, 0, 0, 0);

    db.prepare(
      `
      INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
      VALUES (?, ?, ?, ?)
    `,
    ).run(startOfDay.toISOString(), 75.5, 4, 3);

    const snapshot = efficiencyService.getStartOfDayEfficiency();

    expect(snapshot.source).toBe("history-current-day");
    expect(snapshot.efficiency).toBe(75.5);
    expect(snapshot.totalVehicles).toBe(4);
    expect(snapshot.operationalVehicles).toBe(3);
  });
});
