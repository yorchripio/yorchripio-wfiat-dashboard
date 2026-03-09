// lib/validations/auth.ts
// Zod schemas for auth (password, login, 2FA)

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Al menos una mayúscula")
  .regex(/[a-z]/, "Al menos una minúscula")
  .regex(/[0-9]/, "Al menos un número")
  .regex(/[^A-Za-z0-9]/, "Al menos un carácter especial");

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Requerido"),
});

export const twoFactorSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "El código debe tener 6 dígitos").regex(/^\d+$/),
});

export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: passwordSchema,
  name: z.string().min(1, "Nombre requerido").max(200),
  role: z.enum(["VIEWER", "TRADER"]).optional().default("VIEWER"),
});

export const verify2FASchema = z.object({
  email: z.string().email("Email inválido").transform((v) => v.trim().toLowerCase()),
  code: z.string().length(6, "El código debe tener 6 dígitos").regex(/^\d{6}$/, "Solo dígitos"),
  twoFactorToken: z.string().min(1, "Token requerido"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TwoFactorInput = z.infer<typeof twoFactorSchema>;
export type Verify2FAInput = z.infer<typeof verify2FASchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
