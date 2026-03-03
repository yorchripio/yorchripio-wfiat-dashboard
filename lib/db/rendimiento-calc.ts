// lib/db/rendimiento-calc.ts
// Calcula y guarda el rendimiento diario de la cartera en rendimiento_historico.
// Se llama cuando se crea/actualiza un allocation para una fecha dada.

import { prisma } from "@/lib/db";

const DEFAULT_ASSET = "wARS";

/**
 * Calcula el rendimiento diario ponderado de la cartera para una fecha dada.
 *
 * Fórmula:
 * - Para cada instrumento que genera rendimiento:
 *   return_i = (valorCuotaparte_hoy - valorCuotaparte_ayer) / valorCuotaparte_ayer
 * - rendimiento_cartera = Σ(peso_i × return_i × 100)
 *   donde peso_i = valorTotal_i / totalColateral
 *
 * Guarda el resultado en la tabla rendimiento_historico (upsert).
 */
export async function calculateAndSaveRendimiento(fecha: Date): Promise<number | null> {
  const dateKey = fecha.toISOString().slice(0, 10);

  const prevDate = new Date(fecha);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);

  // Buscar allocations para hoy y buscar la fecha anterior más cercana
  const [todayAllocations, configs] = await Promise.all([
    prisma.collateralAllocation.findMany({
      where: { asset: DEFAULT_ASSET, activo: true, fecha },
      select: { tipo: true, cantidadCuotasPartes: true, valorCuotaparte: true },
    }),
    prisma.instrumentoConfig.findMany(),
  ]);

  if (todayAllocations.length === 0) return null;

  const tiposQueRinden = new Set<string>(
    configs.filter((c) => c.generaRendimiento).map((c) => c.tipo)
  );

  // Buscar el día anterior más cercano que tenga datos (puede haber fines de semana)
  const prevDayAllocs = await prisma.collateralAllocation.findMany({
    where: {
      asset: DEFAULT_ASSET,
      activo: true,
      fecha: { lt: fecha },
    },
    orderBy: { fecha: "desc" },
    select: { tipo: true, cantidadCuotasPartes: true, valorCuotaparte: true, fecha: true },
  });

  if (prevDayAllocs.length === 0) {
    await prisma.rendimientoHistorico.upsert({
      where: { asset_fecha: { asset: DEFAULT_ASSET, fecha } },
      update: { rendimiento: 0 },
      create: { asset: DEFAULT_ASSET, fecha, rendimiento: 0 },
    });
    return 0;
  }

  // Agrupar el día anterior (primera fecha encontrada)
  const prevDateActual = prevDayAllocs[0].fecha;
  const prevAllocsByTipo = new Map<string, number>();
  for (const a of prevDayAllocs) {
    if (a.fecha.getTime() !== prevDateActual.getTime()) break;
    const precio = Number(a.valorCuotaparte);
    prevAllocsByTipo.set(a.tipo, precio);
  }

  // Calcular retorno ponderado
  let totalColateral = 0;
  const instrumentData: { tipo: string; valorTotal: number; precioHoy: number }[] = [];

  for (const a of todayAllocations) {
    const cant = Number(a.cantidadCuotasPartes);
    const precio = Number(a.valorCuotaparte);
    const valorTotal = cant * precio;
    totalColateral += valorTotal;
    instrumentData.push({ tipo: a.tipo, valorTotal, precioHoy: precio });
  }

  if (totalColateral <= 0) return null;

  let rendimientoCartera = 0;

  for (const inst of instrumentData) {
    if (!tiposQueRinden.has(inst.tipo)) continue;

    const precioAyer = prevAllocsByTipo.get(inst.tipo);
    if (!precioAyer || precioAyer <= 0) continue;

    const returnI = (inst.precioHoy - precioAyer) / precioAyer;
    const peso = inst.valorTotal / totalColateral;
    rendimientoCartera += peso * returnI * 100;
  }

  await prisma.rendimientoHistorico.upsert({
    where: { asset_fecha: { asset: DEFAULT_ASSET, fecha } },
    update: { rendimiento: rendimientoCartera },
    create: { asset: DEFAULT_ASSET, fecha, rendimiento: rendimientoCartera },
  });

  console.log(`[RendimientoCalc] ${dateKey}: ${rendimientoCartera.toFixed(4)}%`);
  return rendimientoCartera;
}
