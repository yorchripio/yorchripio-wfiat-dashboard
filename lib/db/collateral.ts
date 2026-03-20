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
 * Construye ColateralData desde la DB (allocations).
 * Para cada tipo de instrumento, toma la allocation más reciente (activa).
 * Esto permite que distintos tipos tengan fechas distintas sin perder datos.
 */
export async function getCollateralDataFromDB(
  asset: string = DEFAULT_ASSET,
  fechaPedida?: Date
): Promise<ColateralData | null> {
  let allocations;

  if (fechaPedida) {
    // Fecha específica: solo allocations de ese día
    allocations = await prisma.collateralAllocation.findMany({
      where: { asset, fecha: fechaPedida, activo: true },
      orderBy: { tipo: "asc" },
    });
  } else {
    // Sin fecha: tomar la fecha más reciente y traer sus allocations.
    // Cada fecha representa un snapshot completo de todas las posiciones.
    const fecha = await getLatestAllocationDate(asset);
    if (!fecha) return null;
    allocations = await prisma.collateralAllocation.findMany({
      where: { asset, fecha, activo: true },
      orderBy: { tipo: "asc" },
    });
  }

  if (allocations.length === 0) return null;

  const total = allocations.reduce((sum, r) => {
    const v = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    return sum + v;
  }, 0);

  if (total === 0) return null;

  // Fecha de las allocations (todas comparten la misma fecha)
  const fecha = allocations[0].fecha;

  // Para rendimiento diario: comparar valorCuotaparte (VCP) del día anterior vs hoy.
  // Usar VCP en vez de patrimonio total para que aportes de capital nuevos
  // no inflen el rendimiento (100M nuevos != 12% de rendimiento).
  // Buscar la fecha MÁS RECIENTE anterior (no asumir "ayer" exacto — puede ser finde/feriado).
  const prevAllocationRow = await prisma.collateralAllocation.findFirst({
    where: { asset, fecha: { lt: fecha }, activo: true },
    orderBy: { fecha: "desc" },
    select: { fecha: true },
  });
  const vcpAyerByTipo = new Map<string, number>();
  if (prevAllocationRow) {
    const prevAllocations = await prisma.collateralAllocation.findMany({
      where: { asset, fecha: prevAllocationRow.fecha, activo: true },
      select: { tipo: true, valorCuotaparte: true },
    });
    for (const r of prevAllocations) {
      const vcp = Number(r.valorCuotaparte);
      if (vcp > 0 && !vcpAyerByTipo.has(r.tipo)) {
        vcpAyerByTipo.set(r.tipo, vcp);
      }
    }
  }

  const instrumentos: InstrumentoColateral[] = allocations.map((r) => {
    const valorTotal = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
    const porcentaje = total > 0 ? (valorTotal / total) * 100 : 0;
    const vcpHoy = Number(r.valorCuotaparte);
    const vcpAyer = vcpAyerByTipo.get(r.tipo) ?? 0;
    // Rendimiento = cambio en valor cuotaparte (no en patrimonio total)
    const rendimientoDiario =
      vcpAyer > 0 ? ((vcpHoy - vcpAyer) / vcpAyer) * 100 : (r.rendimientoDiario != null ? Number(r.rendimientoDiario) : 0);
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
 * Total colateral por fecha — para cada día, suma el valor más reciente de cada tipo.
 *
 * Ejemplo: si FCI tiene datos hasta el 19/03 y Cuenta_Remunerada se agrega el 20/03,
 * para el 20/03 se suma el FCI del 19/03 + Cuenta_Remunerada del 20/03.
 * Esto evita que el total caiga cuando un tipo nuevo se agrega con fecha distinta.
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
  fromDate.setUTCDate(fromDate.getUTCDate() - (limit + 30));

  const rows = await prisma.collateralAllocation.findMany({
    where: {
      asset,
      activo: true,
      fecha: { gte: fromDate },
    },
    orderBy: { fecha: "asc" },
    select: { fecha: true, tipo: true, cantidadCuotasPartes: true, valorCuotaparte: true },
  });

  // 1. Collect all unique dates and tipos
  const allDates = new Set<string>();
  // tipo → date → value
  const tipoByDate = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const dateKey = r.fecha.toISOString().slice(0, 10);
    allDates.add(dateKey);
    const v = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);

    if (!tipoByDate.has(r.tipo)) {
      tipoByDate.set(r.tipo, new Map());
    }
    const dateMap = tipoByDate.get(r.tipo)!;
    dateMap.set(dateKey, (dateMap.get(dateKey) ?? 0) + v);
  }

  // 2. For each date, sum the latest known value per tipo (carry forward)
  const sortedDates = Array.from(allDates).sort();
  const byDate = new Map<string, number>();
  const latestValueByTipo = new Map<string, number>();

  for (const dateKey of sortedDates) {
    // Update latest known value for each tipo that has data on this date
    for (const [tipo, dateMap] of tipoByDate) {
      if (dateMap.has(dateKey)) {
        latestValueByTipo.set(tipo, dateMap.get(dateKey)!);
      }
    }
    // Sum all latest values
    let total = 0;
    for (const v of latestValueByTipo.values()) {
      total += v;
    }
    byDate.set(dateKey, total);
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const limited = sorted.slice(-limit);
  return new Map(limited);
}
