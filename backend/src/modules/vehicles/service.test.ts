import { afterEach, describe, expect, it } from "vitest";
import { createVehicleRepository } from "./repository.js";
import { createVehicleService } from "./service.js";
import {
  createTestDatabase,
  getVehicleRow,
  insertTestVehicle,
} from "../../test/helpers/database.js";
import { createMockIo } from "../../test/helpers/socket.js";
import type Database from "better-sqlite3";

describe("createVehicleService", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function createService() {
    db = createTestDatabase();
    const vehicleRepo = createVehicleRepository(db);
    const { io, emit } = createMockIo();
    const service = createVehicleService({ db, vehicleRepo, io });

    return { service, emit };
  }

  it("returns 404 when vehicle does not exist", () => {
    const { service } = createService();

    const result = service.updateStatus("BWT-0000", "EM TRÂNSITO");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("updates status and sets trip_start_time for EM TRÂNSITO", () => {
    const plate = "BWT-1001";
    const { service, emit } = createService();
    insertTestVehicle(db, { plate, status: "VEÍCULO VAZIO" });

    const result = service.updateStatus(plate, "EM TRÂNSITO");

    expect(result.ok).toBe(true);
    const row = getVehicleRow(db, plate);
    expect(row?.status).toBe("EM TRÂNSITO");
    expect(row?.trip_start_time).toBeTruthy();
    expect(emit).toHaveBeenCalledWith("vehicle:updated", expect.objectContaining({ plate }));
  });

  it("enters maintenance and clears trip_start_time", () => {
    const plate = "BWT-1002";
    const { service } = createService();
    insertTestVehicle(db, {
      plate,
      status: "EM TRÂNSITO",
      trip_start_time: new Date().toISOString(),
    });

    const result = service.enterMaintenance(plate, {
      driver: "Motorista Teste",
      reason: "Pneu",
      location: "Oficina",
      forecast: "2026-05-26",
    });

    expect(result.ok).toBe(true);
    const row = getVehicleRow(db, plate);
    expect(row?.status).toBe("EM MANUTENÇÃO");
    expect(row?.maintenance_reason).toBe("Pneu");
    expect(row?.trip_start_time).toBeNull();
  });

  it("cancels maintenance using fallback status from operational macro", () => {
    const plate = "BWT-1003";
    const { service } = createService();
    insertTestVehicle(db, {
      plate,
      status: "EM MANUTENÇÃO",
      last_operational_macro: "AGUARD. CARREGA",
      last_operational_driver: "João",
      last_operational_location: "Paranaguá, PR",
      last_operational_speed: 55,
    });

    const result = service.cancelMaintenance(plate);

    expect(result.ok).toBe(true);
    const row = getVehicleRow(db, plate);
    expect(row?.status).toBe("AGUARDANDO CARREGAMENTO");
    expect(row?.driver).toBe("João");
    expect(row?.maintenance_reason).toBeNull();
  });

  it("finishes maintenance and writes maintenance_history", () => {
    const plate = "BWT-1004";
    const { service } = createService();
    insertTestVehicle(db, {
      plate,
      status: "EM MANUTENÇÃO",
      maintenance_reason: "Freio",
      location_name: "Oficina Central",
    });

    const result = service.finishMaintenance(plate, {
      reason: "Freio trocado",
      location: "Oficina Central",
    });

    expect(result.ok).toBe(true);

    const row = getVehicleRow(db, plate);
    expect(row?.status).toBe("VEÍCULO VAZIO");
    expect(row?.maintenance_finished_at).toBeTruthy();

    const historyCount = db
      .prepare("SELECT COUNT(*) as count FROM maintenance_history WHERE plate = ?")
      .get(plate) as { count: number };
    expect(historyCount.count).toBe(1);
  });

  it("clears stale maintenance_finished_at when listing vehicles", () => {
    const plate = "BWT-1005";
    const { service } = createService();
    insertTestVehicle(db, { plate });

    db.prepare(
      `
      UPDATE vehicles
      SET maintenance_finished_at = datetime('now', '-25 hours')
      WHERE plate = ?
    `,
    ).run(plate);

    service.listVehicles();

    const row = getVehicleRow(db, plate);
    expect(row?.maintenance_finished_at).toBeNull();
  });
});
