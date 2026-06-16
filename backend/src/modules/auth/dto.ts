import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(200),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(150),
  role: z.enum(["ADMIN", "USER"]).optional(),
  active: z.boolean().optional(),
  auth_provider: z.enum(["LOCAL", "ORBITAL"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(["ADMIN", "USER"]).optional(),
  active: z.boolean().optional(),
});
