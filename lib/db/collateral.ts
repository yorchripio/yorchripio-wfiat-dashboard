// lib/db/collateral.ts
// Construir ColateralData desde allocations en la DB (reemplazo de Sheets)

import { prisma } from "@/lib/db";
import type { ColateralData, InstrumentoColateral } from "@/lib/sheets/collateral";

const DEFAULT_ASSET = "wARS";

const TIPO_TO_ID: Record<string, string> = {
  FCI: "FCI_ADCAP_SB",
  Cuenta_Remunerada: "CTA_REM_COMERCIO",
  A_la_Vista: "SALDO_VISTA",
};

/**
 * Obtiene la fecha más reciente con allocations para el asset.
 */
async function getLatestAllocationDate(asset: string): Promise<Date | null> {
  const row = await prisma.collateralAllocation.findFirst({
    where: { asset },
    orderBy: { fecha: "desc" },
    select: { fecha: true },
  });
  return row?.fecha ?? null;
}

/**
 * Construye ColateralData desde la DB (allocations) para la fecha dada o la más reciente.
 * Misma forma que getCollateralData() de Sheets para que el dashboard no cambie.
 */
export async function getCollateralDataFromDB(
  asset: string = DEFAULT_ASSET,
  fechaPedida?: Date
): Promise<ColateralData | null> {
  const fecha = fechaPedida ?? (await getLatestAllocationDate(asset));
  if (!fecha) return null;

  const allocations = await prisma.collateralAllocation.findMany({
    where: { asset, fecha, activo: true },
    orderBy: { tipo: "asc" },
  });

  if (allocations.length === 0) return null;

  const total = allocations.reduce((sum, r) => {
    const v = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    return sum + v;
  }, 0);

  if (total === 0) return null;

  const prevDay = new Date(fecha);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const prevAllocations = await prisma.collateralAllocation.findMany({
    where: { asset, fecha: prevDay, activo: true },
    select: { tipo: true, cantidadCuotasPartes: true, valorCuotaparte: true },
  });
  const valorAyerByTipo = new Map<string, number>();
  for (const r of prevAllocations) {
    const v = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    valorAyerByTipo.set(r.tipo, (valorAyerByTipo.get(r.tipo) ?? 0) + v);
  }

  const instrumentos: InstrumentoColateral[] = allocations.map((r) => {
    const valorTotal = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    const porcentaje = total > 0 ? (valorTotal / total) * 100 : 0;
    const valorAyer = valorAyerByTipo.get(r.tipo) ?? 0;
    const rendimientoDiario =
      valorAyer > 0 ? ((valorTotal - valorAyer) / valorAyer) * 100 : (r.rendimientoDiario != null ? Number(r.rendimientoDiario) : 0);
    return {
      id: TIPO_TO_ID[r.tipo] ?? r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      entidad: r.entidad ?? "",
      valorTotal,
      porcentaje,
      rendimientoDiario,
      activo: r.activo,
    };
  });

  const rendimientoCartera =
    instrumentos.reduce((acc, i) => acc + i.rendimientoDiario * (i.porcentaje / 100), 0) || 0;

  const fechaStr = fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return {
    fecha: fechaStr,
    instrumentos,
    total,
    totalFormatted: `$${total.toLocaleString("es-AR")}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera,
  };
}

/**
 * Total colateral por fecha (suma de allocations activos por día).
 * Usado para el gráfico histórico sin depender de collateral_snapshots.
 */
export async function getCollateralTotalsByDate(
  asset: string = DEFAULT_ASSET,
  limit: number = 365
): Promise<Map<string, number>> {
  const latestRow = await prisma.collateralAllocation.findFirst({
    where: { asset, activo: true },
    orderBy: { fecha: "desc" },
    select: { fecha: true },
  });
  if (!latestRow) return new Map<string, number>();

  const fromDate = new Date(latestRow.fecha);
  // Buffer de 30 días para evitar cortes por días sin data.
  fromDate.setUTCDate(fromDate.getUTCDate() - (limit + 30));

  const rows = await prisma.collateralAllocation.findMany({
    where: {
      asset,
      activo: true,
      fecha: { gte: fromDate },
    },
    orderBy: { fecha: "asc" },
    select: { fecha: true, cantidadCuotasPartes: true, valorCuotaparte: true },
  });
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const key = r.fecha.toISOString().slice(0, 10);
    const v = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    byDate.set(key, (byDate.get(key) ?? 0) + v);
  }
  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const limited = sorted.slice(-limit);
  return new Map(limited);
}
