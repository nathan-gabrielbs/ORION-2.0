import type { Express } from "express";
import { sanitizeText } from "../../shared/utils/sanitize.js";
import { normalizePlate } from "../../shared/utils/plate.js";
import {
  finishMaintenanceSchema,
  maintenanceSchema,
  observationSchema,
  vehicleStatusSchema,
} from "./dto.js";
import type { VehicleService } from "./service.js";

export function registerVehicleRoutes(app: Express, vehicleService: VehicleService) {
  app.get("/api/vehicles", (_req, res) => {
    const fleet = vehicleService.listVehicles();
    res.json(fleet);
  });

  app.post("/api/vehicles/:plate/status", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = vehicleStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const result = vehicleService.updateStatus(normalizedPlate, parsed.data.status);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });

  app.put("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = maintenanceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de manutenção inválidos." });
    }

    const input = vehicleService.sanitizeMaintenanceInput(parsed.data);
    const result = vehicleService.updateMaintenanceFields(normalizedPlate, input);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });

  app.put("/api/vehicles/:plate/observation", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = observationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Observação inválida." });
    }

    const observation = sanitizeText(parsed.data.observation ?? null, 1000);

    const result = vehicleService.updateObservation(normalizedPlate, observation);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });

  app.post("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = maintenanceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de manutenção inválidos." });
    }

    const input = vehicleService.sanitizeMaintenanceInput(parsed.data);
    const result = vehicleService.enterMaintenance(normalizedPlate, input);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });

  app.delete("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const result = vehicleService.cancelMaintenance(normalizedPlate);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });

  app.post("/api/vehicles/:plate/maintenance/finish", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = finishMaintenanceSchema.safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para finalização." });
    }

    const input = vehicleService.sanitizeFinishMaintenanceInput(parsed.data);
    const result = vehicleService.finishMaintenance(normalizedPlate, input);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, vehicle: result.vehicle });
  });
}
