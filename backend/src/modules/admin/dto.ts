import { z } from "zod";

export const plateRegistrySchema = z.object({
  plate: z.string().trim().min(7).max(10),
  model: z.string().trim().min(2).max(120),
  year: z.number().int().min(1980).max(2100),
  operation_name: z.string().trim().min(2).max(120),
  operation_logo_url: z.string().trim().url().max(500).nullable().optional(),
});

export const updatePlateRegistrySchema = z.object({
  model: z
    .preprocess((val) => (typeof val === "string" ? val.trim() : val), z.string().min(2).max(120))
    .optional()
    .nullable(),
  year: z.preprocess((val) => {
    if (val === "" || val === null || typeof val === "undefined") return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") return Number(val);
    return val;
  }, z.number().int().min(1980).max(2100).optional()),

  operation_name: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(120).nullable())
    .optional()
    .nullable(),

  operation_logo_url: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(500).nullable())
    .optional()
    .nullable(),
});
