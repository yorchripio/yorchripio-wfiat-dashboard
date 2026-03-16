// lib/db/rendimiento.ts
// Rendimiento diario desde rendimiento_historico (importado del Sheet) + allocations para totales.

import { prisma } from "@/lib/db";
import type { RendimientoDiario } from "@/lib/types/rendimiento";

const DEFAULT_ASSET = "wARS";

function dateKeyToDisplay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function dateKeyToTimestamp(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Construye RendimientoDiario[] combinando:
 * - rendimiento_historico: rendimiento diario % (importado del Sheet fila 37)
 * - collateral_allocations: total colateral y desglose por tipo
 *
 * También retorna tiposQueRinden desde InstrumentoConfig.
 */
export async function getRendimientoDataFromDB(
  limit: number = 365
): Promise<{ data: RendimientoDiario[]; tiposQueRinden: string[] }> {
  const latestAllocation = await prisma.collateralAllocation.findFirst({
    where: { asset: DEFAULT_ASSET, activo: true },
    orderBy: { fecha: "desc" },
    select: { fecha: true },
  });

  if (!latestAllocation) {
    const configs = await prisma.instrumentoConfig.findMany();
    const tiposQueRinden = configs
      .filter((config) => config.generaRendimiento)
      .map((config) => config.tipo);
    return { data: [], tiposQueRinden };
  }

  const fromDate = new Date(latestAllocation.fecha);
  // Buffer de 30 días para captar huecos de calendario.
  fromDate.setUTCDate(fromDate.getUTCDate() - (limit + 30));

  const [allocRows, rendRows, configs] = await Promise.all([
    prisma.collateralAllocation.findMany({
      where: {
        asset: DEFAULT_ASSET,
        activo: true,
        fecha: { gte: fromDate },
      },
      orderBy: { fecha: "asc" },
      select: {
        fecha: true,
        tipo: true,
        cantidadCuotasPartes: true,
        valorCuotaparte: true,
      },
    }),
    prisma.rendimientoHistorico.findMany({
      where: {
        asset: DEFAULT_ASSET,
        fecha: { gte: fromDate },
      },
      orderBy: { fecha: "asc" },
    }),
    prisma.instrumentoConfig.findMany(),
  ]);

  const tiposQueRinden = configs
    .filter((c) => c.generaRendimiento)
    .map((c) => c.tipo);

  // Allocations agrupadas por fecha
  const allocByDate = new Map<
    string,
    {
      total: number;
      byTipo: Record<string, { valorTotal: number; cantidad: number }>;
    }
  >();

  for (const r of allocRows) {
    const key = r.fecha.toISOString().slice(0, 10);
    const cantidad = Number(r.cantidadCuotasPartes);
    const valorTotal = cantidad * Number(r.valorCuotaparte);
    const existing = allocByDate.get(key);
    if (!existing) {
      allocByDate.set(key, {
        total: valorTotal,
        byTipo: { [r.tipo]: { valorTotal, cantidad } },
      });
    } else {
      existing.total += valorTotal;
      const prev = existing.byTipo[r.tipo];
      if (prev) {
        prev.valorTotal += valorTotal;
        prev.cantidad += cantidad;
      } else {
        existing.byTipo[r.tipo] = { valorTotal, cantidad };
      }
    }
  }

  // Rendimiento diario importado, indexado por fecha
  const rendByDate = new Map<string, number>();
  for (const r of rendRows) {
    const key = r.fecha.toISOString().slice(0, 10);
    rendByDate.set(key, Number(r.rendimiento));
  }

  // Unir ambas fuentes: usamos las fechas de allocations como base
  const sortedDates = Array.from(allocByDate.keys()).sort();
  const limited = sortedDates.slice(-limit);
  const result: RendimientoDiario[] = [];

  for (const dateKey of limited) {
    const allocData = allocByDate.get(dateKey)!;
    const total = allocData.total;
    if (total <= 0) continue;

    const rendimiento = rendByDate.get(dateKey) ?? 0;

    const allocation: Record<string, number> = {};
    for (const [tipo, v] of Object.entries(allocData.byTipo)) {
      allocation[tipo] = (v.valorTotal / total) * 100;
    }

    const byTipoDetalle: Record<string, { valorTotal: number; cantidad: number }> = {};
    for (const [tipo, v] of Object.entries(allocData.byTipo)) {
      byTipoDetalle[tipo] = { valorTotal: v.valorTotal, cantidad: v.cantidad };
    }

    result.push({
      fecha: dateKeyToDisplay(dateKey),
      dateKey,
      timestamp: dateKeyToTimestamp(dateKey),
      rendimiento,
      allocation,
      totalColateral: total,
      byTipoDetalle,
    });
  }

  return { data: result, tiposQueRinden };
}
