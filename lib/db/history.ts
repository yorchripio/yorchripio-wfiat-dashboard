// lib/db/history.ts
// Historial para gráfico de ratio: colateral por fecha (suma de allocations por día) + supply (snapshots o último conocido).

import { getSupplyHistory } from "@/lib/db/snapshots";
import { getCollateralTotalsByDate } from "@/lib/db/collateral";
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
 * Historial para el gráfico de ratio: por cada día con colateral (suma de allocations activos por fecha),
 * se arma un punto. Supply: del snapshot de ese día o del último anterior; si no hay snapshots, se usa currentSupplyFallback.
 */
export async function getHistoricalDataFromDB(
  limit: number = 365,
  currentSupplyFallback?: number
): Promise<HistoricalDataPoint[]> {
  const [supplyHistory, collateralByDate] = await Promise.all([
    getSupplyHistory("wARS", limit * 2),
    getCollateralTotalsByDate("wARS", limit),
  ]);

  const supplySortedByDate = supplyHistory
    .map((r) => ({ dateKey: r.snapshotAt.slice(0, 10), total: r.total }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const result: HistoricalDataPoint[] = [];
  const dateKeys = Array.from(collateralByDate.keys()).sort();
  let supplyIdx = 0;
  let latestSupplyOnOrBeforeDate = 0;
  let lastMatchedSnapshotDate = "";

  // Build a set of dates that have actual snapshots for gap detection
  const snapshotDateSet = new Set(supplySortedByDate.map((s) => s.dateKey));

  for (const dateKey of dateKeys) {
    const colateralTotal = collateralByDate.get(dateKey) ?? 0;
    if (colateralTotal <= 0) continue;

    while (
      supplyIdx < supplySortedByDate.length &&
      supplySortedByDate[supplyIdx].dateKey <= dateKey
    ) {
      latestSupplyOnOrBeforeDate = supplySortedByDate[supplyIdx].total;
      lastMatchedSnapshotDate = supplySortedByDate[supplyIdx].dateKey;
      supplyIdx += 1;
    }

    let supplyTotal = latestSupplyOnOrBeforeDate;

    // Detect snapshot gap: if we're more than 2 days from the last snapshot
    // AND we have a fallback, use it (stale snapshot supply inflates the ratio)
    if (currentSupplyFallback != null && currentSupplyFallback > 0) {
      if (supplyTotal <= 0) {
        supplyTotal = currentSupplyFallback;
      } else if (lastMatchedSnapshotDate && !snapshotDateSet.has(dateKey)) {
        const gapMs = dateKeyToTimestamp(dateKey) - dateKeyToTimestamp(lastMatchedSnapshotDate);
        const gapDays = gapMs / 86400000;
        if (gapDays > 2) {
          supplyTotal = currentSupplyFallback;
        }
      }
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
