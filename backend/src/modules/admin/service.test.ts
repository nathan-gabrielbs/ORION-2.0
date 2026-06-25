import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthModule } from "../auth/index.js";
import { createAdminService } from "./service.js";
import { query, queryOne } from "../../db/client.js";
import {
  closeDatabase,
  createTestDatabase,
  resetTestDatabase,
} from "../../test/helpers/database.js";

async function insertUser(input: {
  email: string;
  role: "ADMIN" | "USER";
  active?: boolean;
}): Promise<number> {
  const result = await query<{ id: number }>(
    `
    INSERT INTO users (name, email, role, auth_provider, active)
    VALUES ($1, $2, $3, 'ORBITAL', $4)
    RETURNING id
  `,
    [input.email, input.email, input.role, input.active ?? true],
  );
  return result.rows[0].id;
}

async function getRole(id: number): Promise<string | undefined> {
  const row = await queryOne<{ role: string }>("SELECT role FROM users WHERE id = $1", [id]);
  return row?.role;
}

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

  it("promotes a USER to ADMIN", async () => {
    const adminService = createService();
    const actorId = await insertUser({ email: "actor@bwt.com.br", role: "ADMIN" });
    const targetId = await insertUser({ email: "user@bwt.com.br", role: "USER" });

    const result = await adminService.updateUser(
      targetId,
      { name: "User", role: "ADMIN", active: true },
      actorId,
    );

    expect(result.ok).toBe(true);
    expect(await getRole(targetId)).toBe("ADMIN");
  });

  it("demotes an ADMIN when another active admin remains", async () => {
    const adminService = createService();
    const actorId = await insertUser({ email: "actor@bwt.com.br", role: "ADMIN" });
    const targetId = await insertUser({ email: "other@bwt.com.br", role: "ADMIN" });

    const result = await adminService.updateUser(
      targetId,
      { name: "Other", role: "USER", active: true },
      actorId,
    );

    expect(result.ok).toBe(true);
    expect(await getRole(targetId)).toBe("USER");
  });

  it("blocks demoting the last active admin", async () => {
    const adminService = createService();
    const onlyAdminId = await insertUser({ email: "only@bwt.com.br", role: "ADMIN" });

    const result = await adminService.updateUser(
      onlyAdminId,
      { name: "Only", role: "USER", active: true },
      999,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
    expect(await getRole(onlyAdminId)).toBe("ADMIN");
  });

  it("blocks an admin from demoting their own account", async () => {
    const adminService = createService();
    const actorId = await insertUser({ email: "self@bwt.com.br", role: "ADMIN" });
    await insertUser({ email: "backup@bwt.com.br", role: "ADMIN" });

    const result = await adminService.updateUser(
      actorId,
      { name: "Self", role: "USER", active: true },
      actorId,
    );

    expect(result.ok).toBe(false);
    expect(await getRole(actorId)).toBe("ADMIN");
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
