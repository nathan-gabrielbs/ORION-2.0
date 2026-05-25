import type Database from "better-sqlite3";
import type { AuthModule } from "../auth/index.js";
import { makePasswordHash } from "../auth/password.js";
import type { AuthProvider } from "../../shared/types/auth.js";
import { sanitizeText } from "../../shared/utils/sanitize.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService(deps: { db: Database.Database; auth: AuthModule }) {
  const { db, auth } = deps;

  const upsertOperation = (name: string, logoUrl?: string | null): string | null => {
    const operationName = sanitizeText(name, 120);
    if (!operationName) return null;

    const normalizedLogoUrl = sanitizeText(logoUrl ?? null, 500);
    const current = db
      .prepare("SELECT name, logo_url FROM operations WHERE name = ?")
      .get(operationName) as { name: string; logo_url: string | null } | undefined;

    if (!current) {
      db.prepare(
        `
        INSERT INTO operations (name, logo_url)
        VALUES (?, ?)
      `,
      ).run(operationName, normalizedLogoUrl);
      return operationName;
    }

    if (normalizedLogoUrl) {
      db.prepare(
        `
        UPDATE operations
        SET logo_url = ?
        WHERE name = ?
      `,
      ).run(normalizedLogoUrl, operationName);
    }

    return operationName;
  };

  const getPlateWithOperation = (plate: string) =>
    db
      .prepare(
        `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = ?
      LIMIT 1
    `,
      )
      .get(plate);

  return {
    listUsers: () =>
      db
        .prepare(
          `
      SELECT id, name, email, role, auth_provider, active, created_at, updated_at, last_login
      FROM users
      ORDER BY datetime(created_at) DESC
    `,
        )
        .all(),

    createUser: (input: {
      name: string;
      email: string;
      role: "ADMIN" | "USER";
      active: boolean;
      authProvider: AuthProvider;
      password: string;
    }) => {
      const email = auth.normalizeEmail(input.email);
      const active = input.active ? 1 : 0;

      if (input.authProvider === "LOCAL" && input.password.length < 8) {
        return { ok: false as const, status: 400, error: "Senha deve ter no mínimo 8 caracteres." };
      }

      try {
        db.prepare(
          `
      INSERT INTO users (name, email, password_hash, role, auth_provider, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
        ).run(
          input.name,
          email,
          input.authProvider === "LOCAL" ? makePasswordHash(input.password) : null,
          input.role,
          input.authProvider,
          active,
        );

        return { ok: true as const, status: 201 };
      } catch {
        return { ok: false as const, status: 409, error: "Usuário já existe." };
      }
    },

    updateUser: (id: number, input: { name: string; role: "ADMIN" | "USER"; active: boolean }) => {
      if (!id) {
        return { ok: false as const, status: 400, error: "Dados inválidos." };
      }

      const active = input.active === false ? 0 : 1;
      db.prepare(
        `
    UPDATE users
    SET name = ?, role = ?, active = ?
    WHERE id = ?
  `,
      ).run(input.name, input.role, active, id);

      return { ok: true as const };
    },

    resetUserPassword: (id: number, password: string) => {
      if (!id) {
        return { ok: false as const, status: 400, error: "Senha mínima de 8 caracteres." };
      }

      db.prepare(
        `
    UPDATE users
    SET password_hash = ?, auth_provider = 'LOCAL'
    WHERE id = ?
  `,
      ).run(makePasswordHash(password), id);

      db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(id);

      return { ok: true as const };
    },

    listOperations: () =>
      db
        .prepare(
          `
      SELECT name, logo_url, created_at, updated_at
      FROM operations
      ORDER BY name ASC
    `,
        )
        .all(),

    listPlates: () =>
      db
        .prepare(
          `
      SELECT
        pr.plate,
        pr.model,
        pr.year,
        pr.operation_name,
        op.logo_url AS operation_logo_url,
        pr.created_at,
        pr.updated_at
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      ORDER BY pr.plate ASC
    `,
        )
        .all(),

    createPlate: (input: {
      plate: string;
      model: string;
      year: number;
      operationName: string;
      operationLogoUrl?: string | null;
    }) => {
      const plate = normalizePlate(input.plate);
      const model = sanitizeText(input.model, 120);
      const operationName = sanitizeText(input.operationName, 120);
      const year = Number(input.year);

      if (!plate || !model || !operationName || !Number.isFinite(year)) {
        return {
          ok: false as const,
          status: 400,
          error: "Dados inválidos para cadastro da placa.",
        };
      }

      upsertOperation(operationName, input.operationLogoUrl ?? null);

      try {
        db.prepare(
          `
        INSERT INTO plate_registry (plate, model, year, operation_name)
        VALUES (?, ?, ?, ?)
      `,
        ).run(plate, model, year, operationName);
      } catch {
        return { ok: false as const, status: 409, error: "Placa já cadastrada." };
      }

      return { ok: true as const, status: 201, plate: getPlateWithOperation(plate) };
    },

    updatePlate: (
      plateParam: string,
      input: {
        model: string;
        year: number;
        operationName: string;
        operationLogoUrl?: string | null;
      },
    ) => {
      const plate = normalizePlate(plateParam);
      const model = sanitizeText(input.model, 120);
      const operationName = sanitizeText(input.operationName, 120);
      const resolvedOperationName = operationName || "SEM OPERACAO";
      const year = Number(input.year);

      if (!plate || !model || !Number.isFinite(year)) {
        return {
          ok: false as const,
          status: 400,
          error: "Dados inválidos para atualização da placa.",
        };
      }

      const existing = db.prepare("SELECT plate FROM plate_registry WHERE plate = ?").get(plate);
      if (!existing) {
        return { ok: false as const, status: 404, error: "Placa não encontrada." };
      }

      upsertOperation(resolvedOperationName, input.operationLogoUrl ?? null);

      db.prepare(
        `
  UPDATE plate_registry
  SET model = ?,
      year = ?,
      operation_name = ?
  WHERE plate = ?
`,
      ).run(model, year, resolvedOperationName, plate);

      return { ok: true as const, plate: getPlateWithOperation(plate) };
    },

    deletePlate: (plateParam: string) => {
      const plate = normalizePlate(plateParam);
      if (!plate) {
        return { ok: false as const, status: 400, error: "Placa inválida." };
      }

      const existing = db
        .prepare("SELECT plate, operation_name FROM plate_registry WHERE plate = ?")
        .get(plate) as { plate: string; operation_name: string } | undefined;

      if (!existing) {
        return { ok: false as const, status: 404, error: "Placa não encontrada." };
      }

      db.prepare("DELETE FROM plate_registry WHERE plate = ?").run(plate);

      db.prepare(
        `
      DELETE FROM operations
      WHERE name = ?
        AND NOT EXISTS (
          SELECT 1
          FROM plate_registry
          WHERE operation_name = ?
        )
    `,
      ).run(existing.operation_name, existing.operation_name);

      return { ok: true as const };
    },
  };
}
