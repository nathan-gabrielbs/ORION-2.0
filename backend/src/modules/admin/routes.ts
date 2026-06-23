import type { Express, RequestHandler } from "express";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "../auth/dto.js";
import type { AuthProvider } from "../../shared/types/auth.js";
import { plateRegistrySchema, updatePlateRegistrySchema } from "./dto.js";
import type { AdminService } from "./service.js";

export function registerAdminRoutes(
  app: Express,
  deps: {
    adminService: AdminService;
    requireAdmin: RequestHandler;
  },
) {
  const { adminService, requireAdmin } = deps;

  app.get("/api/users", requireAdmin, async (_req, res) => {
    const users = await adminService.listUsers();
    return res.json({ users });
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const result = await adminService.createUser({
      name: body.name,
      email: body.email,
      role: body.role === "ADMIN" ? "ADMIN" : "USER",
      active: body.active !== false,
      authProvider: (body.auth_provider === "ORBITAL" ? "ORBITAL" : "LOCAL") as AuthProvider,
      password: body.password || "",
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json({ success: true });
  });

  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const result = await adminService.updateUser(id, {
      name: body.name,
      role: body.role === "ADMIN" ? "ADMIN" : "USER",
      active: body.active !== false,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ success: true });
  });

  app.put("/api/users/:id/reset-password", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Senha mínima de 8 caracteres." });
    }

    const result = await adminService.resetUserPassword(id, parsed.data.password);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ success: true });
  });

  app.get("/api/admin/operations", requireAdmin, async (_req, res) => {
    const operations = await adminService.listOperations();
    return res.json({ operations });
  });

  app.get("/api/admin/plates", requireAdmin, async (_req, res) => {
    const plates = await adminService.listPlates();
    return res.json({ plates });
  });

  app.post("/api/admin/plates", requireAdmin, async (req, res) => {
    const parsed = plateRegistrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para cadastro da placa." });
    }

    const result = await adminService.createPlate({
      plate: parsed.data.plate,
      model: parsed.data.model,
      year: parsed.data.year,
      operationName: parsed.data.operation_name,
      operationLogoUrl: parsed.data.operation_logo_url ?? null,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json({ success: true, plate: result.plate });
  });

  app.put("/api/admin/plates/:plate", requireAdmin, async (req, res) => {
    const parsed = updatePlateRegistrySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para atualização da placa." });
    }

    const result = await adminService.updatePlate(req.params.plate, {
      model: String(parsed.data.model ?? ""),
      year: Number(parsed.data.year),
      operationName: String(parsed.data.operation_name ?? "SEM OPERACAO"),
      operationLogoUrl: parsed.data.operation_logo_url ?? null,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ success: true, plate: result.plate });
  });

  app.delete("/api/admin/plates/:plate", requireAdmin, async (req, res) => {
    const result = await adminService.deletePlate(req.params.plate);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ success: true });
  });
}
