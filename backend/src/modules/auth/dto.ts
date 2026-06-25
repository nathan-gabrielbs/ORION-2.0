import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(["ADMIN", "USER"]).optional(),
  active: z.boolean().optional(),
});
