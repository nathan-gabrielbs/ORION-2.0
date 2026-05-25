import { z } from "zod";

export const observationSchema = z.object({
  observation: z.string().trim().max(1000).nullable().optional(),
});

export const maintenanceSchema = z.object({
  driver: z.string().trim().max(120).nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  forecast: z.string().trim().max(80).nullable().optional(),
});

export const finishMaintenanceSchema = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
});

export const vehicleStatusSchema = z.object({
  status: z.enum([
    "EM TRÂNSITO",
    "AGUARDANDO CARREGAMENTO",
    "EFETUANDO CARREGAMENTO",
    "AGUARDANDO DESCARREGAMENTO",
    "EFETUANDO DESCARREGAMENTO",
    "VEÍCULO VAZIO",
    "EM MANUTENÇÃO",
  ]),
});
