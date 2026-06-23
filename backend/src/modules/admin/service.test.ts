import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthModule } from "../auth/index.js";
import { createAdminService } from "./service.js";
import {
  closeDatabase,
  createTestDatabase,
  resetTestDatabase,
} from "../../test/helpers/database.js";

describe("createAdminService", () => {
  beforeEach(async () => {
    await createTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
  });

  function createService() {
    const auth = createAuthModule();
    return createAdminService({ auth });
  }

  it("creates and lists a plate registry entry", async () => {
    const adminService = createService();

    const result = await adminService.createPlate({
      plate: "ABC1D23",
      model: "Volvo FH",
      year: 2022,
      operationName: "BWT Sul",
      operationLogoUrl: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plate).toMatchObject({
        plate: "ABC1D23",
        model: "Volvo FH",
        operation_name: "BWT Sul",
      });
    }

    const plates = (await adminService.listPlates()) as Array<{ plate: string }>;
    expect(plates.some((item) => item.plate === "ABC1D23")).toBe(true);
  });

  it("rejects duplicate plate registration", async () => {
    const adminService = createService();

    await adminService.createPlate({
      plate: "ABC1D23",
      model: "Volvo FH",
      year: 2022,
      operationName: "BWT Sul",
    });

    const duplicate = await adminService.createPlate({
      plate: "ABC1D23",
      model: "Scania R",
      year: 2023,
      operationName: "BWT Sul",
    });

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.status).toBe(409);
    }
  });

  it("deletes plate and orphan operation when no plates remain", async () => {
    const adminService = createService();

    await adminService.createPlate({
      plate: "ABC1D23",
      model: "Volvo FH",
      year: 2022,
      operationName: "Operacao Unica",
    });

    const deleted = await adminService.deletePlate("ABC1D23");
    expect(deleted.ok).toBe(true);

    const operations = (await adminService.listOperations()) as Array<{ name: string }>;
    expect(operations.some((item) => item.name === "Operacao Unica")).toBe(false);
  });
});
