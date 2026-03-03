// lib/db/snapshots.ts
// Guardar y leer snapshots de supply y colateral desde la DB

import { prisma } from "@/lib/db";
import type { TotalSupply } from "@/lib/blockchain/supply";
import type { ColateralData } from "@/lib/sheets/collateral";

const DEFAULT_ASSET = "wARS";

/**
 * Guarda un snapshot de supply en la DB.
 */
export async function saveSupplySnapshot(
  data: TotalSupply,
  asset: string = DEFAULT_ASSET
): Promise<void> {
  const snapshotAt = new Date();
  await prisma.supplySnapshot.create({
    data: {
      asset,
      total: data.total,
      chainsJson: data.chains as unknown as object,
      snapshotAt,
    },
  });
}

/**
 * Guarda un snapshot de colateral en la DB.
 */
export async function saveCollateralSnapshot(
  data: ColateralData,
  asset: string = DEFAULT_ASSET
): Promise<void> {
  const snapshotAt = new Date();
  await prisma.collateralSnapshot.create({
    data: {
      asset,
      total: data.total,
      instrumentosJson: data.instrumentos as unknown as object,
      rendimientoCartera: data.rendimientoCartera ?? undefined,
      snapshotAt,
    },
  });
}

/**
 * Historial de supply desde la DB (para gráficos).
 */
export interface SupplyHistoryPoint {
  snapshotAt: string;
  total: number;
  chains: TotalSupply["chains"];
}

export async function getSupplyHistory(
  asset: string = DEFAULT_ASSET,
  limit: number = 365
): Promise<SupplyHistoryPoint[]> {
  const rows = await prisma.supplySnapshot.findMany({
    where: { asset },
    orderBy: { snapshotAt: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    snapshotAt: r.snapshotAt.toISOString(),
    total: Number(r.total),
    chains: r.chainsJson as unknown as TotalSupply["chains"],
  }));
}

/**
 * Historial de colateral desde la DB.
 */
export interface CollateralHistoryPoint {
  snapshotAt: string;
  total: number;
  rendimientoCartera: number | null;
  instrumentos: ColateralData["instrumentos"];
}

export async function getCollateralHistory(
  asset: string = DEFAULT_ASSET,
  limit: number = 365
): Promise<CollateralHistoryPoint[]> {
  const rows = await prisma.collateralSnapshot.findMany({
    where: { asset },
    orderBy: { snapshotAt: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    snapshotAt: r.snapshotAt.toISOString(),
    total: Number(r.total),
    rendimientoCartera: r.rendimientoCartera != null ? Number(r.rendimientoCartera) : null,
    instrumentos: r.instrumentosJson as unknown as ColateralData["instrumentos"],
  }));
}
