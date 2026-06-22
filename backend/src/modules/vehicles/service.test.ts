import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "../../db/client.js";
import {
  closeDatabase,
  createTestDatabase,
  getVehicleRow,
  insertTestVehicle,
  resetTestDatabase,
} from "../../test/helpers/database.js";
import { createMockIo } from "../../test/helpers/socket.js";
import { createVehicleRepository } from "./repository.js";
import { createVehicleService } from "./service.js";

describe("createVehicleService", () => {
  beforeEach(async () => {
    await createTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
  });

  function createService() {
    const vehicleRepo = createVehicleRepository();
    const { io, emit } = createMockIo();
    const service = createVehicleService({ vehicleRepo, io });
    return { service, emit };
  }

  it("returns 404 when vehicle does not exist", async () => {
    const { service } = createService();
    const result = await service.updateStatus("BWT-0000", "EM TRÂNSITO");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("updates status and sets trip_start_time for EM TRÂNSITO", async () => {
    const plate = "BWT-1001";
    const { service, emit } = createService();
    await insertTestVehicle({ plate, status: "VEÍCULO VAZIO" });

    const result = await service.updateStatus(plate, "EM TRÂNSITO");

    expect(result.ok).toBe(true);
    const row = await getVehicleRow(plate);
    expect(row?.status).toBe("EM TRÂNSITO");
    expect(row?.trip_start_time).toBeTruthy();
    expect(emit).toHaveBeenCalledWith("vehicle:updated", expect.objectContaining({ plate }));
  });

  it("enters maintenance and clears trip_start_time", async () => {
    const plate = "BWT-1002";
    const { service } = createService();
    await insertTestVehicle({
      plate,
      status: "EM TRÂNSITO",
      trip_start_time: new Date().toISOString(),
    });

    const result = await service.enterMaintenance(plate, {
      driver: "Motorista Teste",
      reason: "Pneu",
      location: "Oficina",
      forecast: "2026-05-26",
    });

    expect(result.ok).toBe(true);
    const row = await getVehicleRow(plate);
    expect(row?.status).toBe("EM MANUTENÇÃO");
    expect(row?.maintenance_reason).toBe("Pneu");
    expect(row?.trip_start_time).toBeNull();
  });

  it("cancels maintenance using fallback status from operational macro", async () => {
    const plate = "BWT-1003";
    const { service } = createService();
    await insertTestVehicle({
      plate,
      status: "EM MANUTENÇÃO",
      last_operational_macro: "AGUARD. CARREGA",
      last_operational_driver: "João",
      last_operational_location: "Paranaguá, PR",
      last_operational_speed: 55,
    });

    const result = await service.cancelMaintenance(plate);

    expect(result.ok).toBe(true);
    const row = await getVehicleRow(plate);
    expect(row?.status).toBe("AGUARDANDO CARREGAMENTO");
    expect(row?.driver).toBe("João");
    expect(row?.maintenance_reason).toBeNull();
  });

  it("finishes maintenance and writes maintenance_history", async () => {
    const plate = "BWT-1004";
    const { service } = createService();
    await insertTestVehicle({
      plate,
      status: "EM MANUTENÇÃO",
      maintenance_reason: "Freio",
      location_name: "Oficina Central",
    });

    const result = await service.finishMaintenance(plate, {
      reason: "Freio trocado",
      location: "Oficina Central",
    });

    expect(result.ok).toBe(true);

    const row = await getVehicleRow(plate);
    expect(row?.status).toBe("VEÍCULO VAZIO");
    expect(row?.maintenance_finished_at).toBeTruthy();

    const historyCount = await queryOne<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM maintenance_history WHERE plate = $1",
      [plate],
    );
    expect(Number(historyCount?.count)).toBe(1);
  });

  it("clears stale maintenance_finished_at when listing vehicles", async () => {
    const plate = "BWT-1005";
    const { service } = createService();
    await insertTestVehicle({ plate });

    await query(
      `
      UPDATE vehicles
      SET maintenance_finished_at = NOW() - INTERVAL '25 hours'
      WHERE plate = $1
    `,
      [plate],
    );

    await service.listVehicles();

    const row = await getVehicleRow(plate);
    expect(row?.maintenance_finished_at).toBeNull();
  });
});
