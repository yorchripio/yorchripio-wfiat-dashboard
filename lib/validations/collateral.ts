// lib/validations/collateral.ts
// Validación para allocations de colateral

import { z } from "zod";

const instrumentoTipoSchema = z.enum(["FCI", "Cuenta_Remunerada", "A_la_Vista"]);

export const createAllocationSchema = z.object({
  asset: z.string().min(1).max(20).default("wARS"),
  tipo: instrumentoTipoSchema,
  nombre: z.string().min(1).max(200),
  entidad: z.string().max(200).optional().nullable(),
  cantidadCuotasPartes: z.number().positive("Debe ser mayor a 0"),
  valorCuotaparte: z.number().nonnegative("Debe ser >= 0"),
  fecha: z.string().min(1), // ISO date o YYYY-MM-DD
  rendimientoDiario: z.number().optional().nullable(),
  activo: z.boolean().optional().default(true),
});

export const updateAllocationSchema = createAllocationSchema.partial();

export type CreateAllocationInput = z.infer<typeof createAllocationSchema>;
export type UpdateAllocationInput = z.infer<typeof updateAllocationSchema>;
