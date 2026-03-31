// lib/db/history.ts
// Historial para gráfico de ratio: colateral por fecha (suma de allocations por día) + supply (snapshots o último conocido).

import { prisma } from "@/lib/db";
import { getSupplyHistory } from "@/lib/db/snapshots";
import type { HistoricalDataPoint } from "@/lib/sheets/history";

function dateKeyToTimestamp(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function dateKeyToDisplay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Build collateral-by-date map for a given asset.
 * For wARS: sums CollateralAllocation per date (NO carry-forward).
 * For other assets: uses their specific position/snapshot tables.
 */
async function getCollateralByDateForAsset(
  asset: string,
  limit: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - limit);

  if (asset === "wARS") {
    const allocs = await prisma.collateralAllocation.findMany({
      where: { asset, activo: true, fecha: { gte: fromDate } },
      orderBy: { fecha: "asc" },
      select: { fecha: true, cantidadCuotasPartes: true, valorCuotaparte: true },
    });
    for (const a of allocs) {
      const d = a.fecha.toISOString().slice(0, 10);
      const v = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
      result.set(d, (result.get(d) ?? 0) + v);
    }
  } else if (asset === "wBRL") {
    const positions = await prisma.wbrlCdbPosition.findMany({
      where: { esColateral: true, fechaPosicao: { gte: fromDate } },
      orderBy: { fechaPosicao: "asc" },
    });
    for (const p of positions) {
      const d = p.fechaPosicao.toISOString().slice(0, 10);
      result.set(d, (result.get(d) ?? 0) + Number(p.valorBruto));
    }
  } else if (asset === "wMXN") {
    const fps = await prisma.wmxnFundPosition.findMany({
      where: { fechaReporte: { gte: fromDate } },
      orderBy: { fechaReporte: "asc" },
    });
    for (const fp of fps) {
      result.set(fp.fechaReporte.toISOString().slice(0, 10), Number(fp.valorCartera));
    }
  } else if (asset === "wCOP") {
    const snaps = await prisma.wcopAccountSnapshot.findMany({
      where: { fechaCorte: { gte: fromDate } },
      orderBy: { fechaCorte: "asc" },
    });
    for (const s of snaps) {
      result.set(s.fechaCorte.toISOString().slice(0, 10), Number(s.saldoFinal));
    }
  } else if (asset === "wCLP") {
    const snaps = await prisma.wclpAccountSnapshot.findMany({
      where: { fechaCorte: { gte: fromDate } },
      orderBy: { fechaCorte: "asc" },
    });
    for (const s of snaps) {
      result.set(s.fechaCorte.toISOString().slice(0, 10), Number(s.saldoFinal));
    }
  }

  // Fallback: CollateralSnapshot (wPEN and others without specific tables)
  if (result.size === 0) {
    const cs = await prisma.collateralSnapshot.findMany({
      where: { asset, snapshotAt: { gte: fromDate } },
      orderBy: { snapshotAt: "asc" },
    });
    for (const s of cs) {
      result.set(s.snapshotAt.toISOString().slice(0, 10), Number(s.total));
    }
  }

  return result;
}

/**
 * Historial para el gráfico de ratio: por cada día con colateral (suma de allocations activos por fecha),
 * se arma un punto. Supply: del snapshot de ese día o del último anterior; si no hay snapshots, se usa currentSupplyFallback.
 */
export async function getHistoricalDataFromDB(
  limit: number = 365,
  currentSupplyFallback?: number,
  asset: string = "wARS"
): Promise<HistoricalDataPoint[]> {
  const [supplyHistory, collateralByDate] = await Promise.all([
    getSupplyHistory(asset, limit * 2),
    getCollateralByDateForAsset(asset, limit),
  ]);

  const supplySortedByDate = supplyHistory
    .map((r) => ({ dateKey: r.snapshotAt.slice(0, 10), total: r.total }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const result: HistoricalDataPoint[] = [];
  const dateKeys = Array.from(collateralByDate.keys()).sort();
  let supplyIdx = 0;
  let latestSupplyOnOrBeforeDate = 0;

  for (const dateKey of dateKeys) {
    const colateralTotal = collateralByDate.get(dateKey) ?? 0;
    if (colateralTotal <= 0) continue;

    while (
      supplyIdx < supplySortedByDate.length &&
      supplySortedByDate[supplyIdx].dateKey <= dateKey
    ) {
      latestSupplyOnOrBeforeDate = supplySortedByDate[supplyIdx].total;
      supplyIdx += 1;
    }

    // Use the last known supply snapshot; only fall back to current supply
    // when there are NO snapshots at all (never overwrite historical data)
    let supplyTotal = latestSupplyOnOrBeforeDate;
    if (supplyTotal <= 0 && currentSupplyFallback != null && currentSupplyFallback > 0) {
      supplyTotal = currentSupplyFallback;
    }
    if (supplyTotal <= 0) continue;

    const ratio = (colateralTotal / supplyTotal) * 100;
    const display = dateKeyToDisplay(dateKey);
    result.push({
      fecha: display,
      fechaFormatted: display,
      timestamp: dateKeyToTimestamp(dateKey),
      colateralTotal,
      supplyTotal,
      ratio,
    });
  }

  result.sort((a, b) => a.timestamp - b.timestamp);
  return result;
}
