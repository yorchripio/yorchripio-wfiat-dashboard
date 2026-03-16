// lib/types/rendimiento.ts
// Shared type for rendimiento data — extracted to avoid importing googleapis at build time.

export interface RendimientoDiario {
  fecha: string;         // DD/MM/YYYY
  dateKey: string;       // YYYY-MM-DD para ordenar
  timestamp: number;     // ms UTC
  rendimiento: number;   // rendimiento diario de la cartera (%)
  /** % alocado por tipo (ej. FCI, Cuenta_Remunerada, A_la_Vista, etc.) */
  allocation: Record<string, number>;
  /** Total colateral ese día (suma de todos los activos cargados en esa fecha) */
  totalColateral?: number;
  /** Por instrumento: valorTotal y cantidad */
  byTipoDetalle?: Record<string, { valorTotal: number; cantidad: number }>;
}
