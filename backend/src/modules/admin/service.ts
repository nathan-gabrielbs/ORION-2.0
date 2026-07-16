import { query, queryOne } from "../../db/client.js";
import { sanitizeText } from "../../shared/utils/sanitize.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService() {
  const upsertOperation = async (name: string, logoUrl?: string | null): Promise<string | null> => {
    const operationName = sanitizeText(name, 120);
    if (!operationName) return null;

    const normalizedLogoUrl = sanitizeText(logoUrl ?? null, 500);
    const current = await queryOne<{ name: string; logo_url: string | null }>(
      "SELECT name, logo_url FROM operations WHERE name = $1",
      [operationName],
    );

    if (!current) {
      await query(
        `
        INSERT INTO operations (name, logo_url)
        VALUES ($1, $2)
      `,
        [operationName, normalizedLogoUrl],
      );
      return operationName;
    }

    if (normalizedLogoUrl) {
      await query(
        `
        UPDATE operations
        SET logo_url = $1
        WHERE name = $2
      `,
        [normalizedLogoUrl, operationName],
      );
    }

    return operationName;
  };

  const getPlateWithOperation = async (plate: string) =>
    queryOne(
      `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = $1
      LIMIT 1
    `,
      [plate],
    );

  return {
    listUsers: async () => {
      const result = await query(`
        SELECT id, name, email, role, auth_provider, active, created_at, updated_at, last_login
        FROM users
        ORDER BY created_at DESC
      `);
      return result.rows;
    },

    updateUser: async (
      id: number,
      input: { name: string; role: "ADMIN" | "USER"; active: boolean },
      actorId: number,
    ) => {
      if (!id) {
        return { ok: false as const, status: 400, error: "Dados inválidos." };
      }

      const target = await queryOne<{ id: number; role: string; active: boolean }>(
        "SELECT id, role, active FROM users WHERE id = $1",
        [id],
      );
      if (!target) {
        return { ok: false as const, status: 404, error: "Usuário não encontrado." };
      }

      const willBeActiveAdmin = input.role === "ADMIN" && input.active === true;

      // Prevent self-lockout: an admin cannot demote or deactivate their own account.
      if (id === actorId && !willBeActiveAdmin) {
        return {
          ok: false as const,
          status: 400,
          error: "Você não pode rebaixar ou desativar a sua própria conta.",
        };
      }

      // Never leave the system without an active administrator.
      if (!willBeActiveAdmin) {
        const others = await queryOne<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN' AND active = TRUE AND id <> $1",
          [id],
        );
        if (!others || Number(others.count) === 0) {
          return {
            ok: false as const,
            status: 400,
            error: "Não é possível rebaixar ou desativar o último administrador ativo.",
          };
        }
      }

      await query(
        `
        UPDATE users
        SET name = $1, role = $2, active = $3
        WHERE id = $4
      `,
        [input.name, input.role, input.active, id],
      );

      return { ok: true as const };
    },

    listOperations: async () => {
      const result = await query(`
        SELECT name, logo_url, created_at, updated_at
        FROM operations
        ORDER BY name ASC
      `);
      return result.rows;
    },

    listPlates: async () => {
      const result = await query(`
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
      `);
      return result.rows;
    },

    createPlate: async (input: {
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

      await upsertOperation(operationName, input.operationLogoUrl ?? null);

      try {
        await query(
          `
          INSERT INTO plate_registry (plate, model, year, operation_name)
          VALUES ($1, $2, $3, $4)
        `,
          [plate, model, year, operationName],
        );
      } catch {
        return { ok: false as const, status: 409, error: "Placa já cadastrada." };
      }

      return { ok: true as const, status: 201, plate: await getPlateWithOperation(plate) };
    },

    updatePlate: async (
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

      const existing = await queryOne("SELECT plate FROM plate_registry WHERE plate = $1", [plate]);
      if (!existing) {
        return { ok: false as const, status: 404, error: "Placa não encontrada." };
      }

      await upsertOperation(resolvedOperationName, input.operationLogoUrl ?? null);

      await query(
        `
        UPDATE plate_registry
        SET model = $1,
            year = $2,
            operation_name = $3
        WHERE plate = $4
      `,
        [model, year, resolvedOperationName, plate],
      );

      return { ok: true as const, plate: await getPlateWithOperation(plate) };
    },

    deletePlate: async (plateParam: string) => {
      const plate = normalizePlate(plateParam);
      if (!plate) {
        return { ok: false as const, status: 400, error: "Placa inválida." };
      }

      const existing = await queryOne<{ plate: string; operation_name: string }>(
        "SELECT plate, operation_name FROM plate_registry WHERE plate = $1",
        [plate],
      );

      if (!existing) {
        return { ok: false as const, status: 404, error: "Placa não encontrada." };
      }

      await query("DELETE FROM plate_registry WHERE plate = $1", [plate]);

      await query(
        `
        DELETE FROM operations
        WHERE name = $1
          AND NOT EXISTS (
            SELECT 1
            FROM plate_registry
            WHERE operation_name = $1
          )
      `,
        [existing.operation_name],
      );

      return { ok: true as const };
    },
  };
}
