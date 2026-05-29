import { afterEach, describe, expect, it } from "vitest";
import { createAuthModule } from "../auth/index.js";
import { createAdminService } from "./service.js";
import { createTestDatabase } from "../../test/helpers/database.js";
import type Database from "better-sqlite3";

describe("createAdminService", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function createService() {
    db = createTestDatabase();
    const auth = createAuthModule(db);
    return createAdminService({ db, auth });
  }

  it("creates and lists a plate registry entry", () => {
    const adminService = createService();

    const result = adminService.createPlate({
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

    const plates = adminService.listPlates() as Array<{ plate: string }>;
    expect(plates.some((item) => item.plate === "ABC1D23")).toBe(true);
  });

  it("rejects duplicate plate registration", () => {
    const adminService = createService();

    adminService.createPlate({
      plate: "ABC1D23",
      model: "Volvo FH",
      year: 2022,
      operationName: "BWT Sul",
    });

    const duplicate = adminService.createPlate({
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

  it("deletes plate and orphan operation when no plates remain", () => {
    const adminService = createService();

    adminService.createPlate({
      plate: "ABC1D23",
      model: "Volvo FH",
      year: 2022,
      operationName: "Operacao Unica",
    });

    const deleted = adminService.deletePlate("ABC1D23");
    expect(deleted.ok).toBe(true);

    const operations = adminService.listOperations() as Array<{ name: string }>;
    expect(operations.some((item) => item.name === "Operacao Unica")).toBe(false);
  });
});
