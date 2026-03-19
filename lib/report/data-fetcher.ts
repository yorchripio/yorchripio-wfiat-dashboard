// lib/report/data-fetcher.ts
// Aggregates all data needed for a PDF report for a given asset

import { type AssetSymbol, TOKEN_CONFIGS } from "@/lib/blockchain/config";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getCollateralDataFromDB } from "@/lib/db/collateral";
import {
  getWbrlCollateralData,
  getWmxnCollateralData,
  getWcopCollateralData,
  getWpenCollateralData,
  getWclpCollateralData,
} from "@/lib/db/collateral-by-asset";
import { type ColateralData } from "@/lib/sheets/collateral";
import { prisma } from "@/lib/db";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";

export interface PoolSummary {
  label: string;
  network: string;
  reserveUsd: number;
  volume24h: number;
  priceUsd: number;
  feePercent: number;
}

export interface SupplyByChain {
  chain: string;
  supply: number;
}

export interface ReportData {
  asset: AssetSymbol;
  assetName: string;
  from: Date;
  to: Date;
  collateral: ColateralData | null;
  supplyTotal: number;
  supplyByChain: SupplyByChain[];
  supplyHistory: { date: string; total: number }[];
  ratioHistory: { date: string; ratio: number }[];
  rendimiento: {
    tna: number;
    periodReturn: number;
    vcpInicial: number;
    vcpFinal: number;
    diasCalendario: number;
  } | null;
  pools: PoolSummary[];
  currencyCode: string;
  currencySymbol: string;
}

const CURRENCY_MAP: Record<string, { code: string; symbol: string }> = {
  wARS: { code: "ARS", symbol: "$" },
  wBRL: { code: "BRL", symbol: "R$" },
  wMXN: { code: "MXN", symbol: "$" },
  wCOP: { code: "COP", symbol: "$" },
  wPEN: { code: "PEN", symbol: "S/" },
  wCLP: { code: "CLP", symbol: "$" },
};

export async function getReportData(
  asset: AssetSymbol,
  from: Date,
  to: Date
): Promise<ReportData> {
  const config = TOKEN_CONFIGS[asset];
  const currency = CURRENCY_MAP[asset] ?? { code: asset, symbol: "$" };

  // 1. Collateral
  let collateral: ColateralData | null = null;
  try {
    switch (asset) {
      case "wBRL": collateral = await getWbrlCollateralData(); break;
      case "wMXN": collateral = await getWmxnCollateralData(); break;
      case "wCOP": collateral = await getWcopCollateralData(); break;
      case "wPEN": collateral = await getWpenCollateralData(); break;
      case "wCLP": collateral = await getWclpCollateralData(); break;
      default: collateral = await getCollateralDataFromDB(); break;
    }
  } catch (err) {
    console.error(`[report] Error getting collateral for ${asset}:`, err);
  }

  // 2. Supply
  let supplyTotal = 0;
  const supplyByChain: SupplyByChain[] = [];
  try {
    const supply = await getTotalSupply(asset);
    supplyTotal = supply.total;
    for (const [chain, data] of Object.entries(supply.chains)) {
      if (data.success && data.supply > 0) {
        supplyByChain.push({ chain, supply: data.supply });
      }
    }
  } catch (err) {
    console.error(`[report] Error getting supply for ${asset}:`, err);
  }

  // 3. Supply history from snapshots
  const supplyHistory: { date: string; total: number }[] = [];
  try {
    const snapshots = await prisma.supplySnapshot.findMany({
      where: {
        asset,
        snapshotAt: { gte: from, lte: to },
      },
      orderBy: { snapshotAt: "asc" },
      select: { snapshotAt: true, total: true },
    });
    for (const s of snapshots) {
      supplyHistory.push({
        date: s.snapshotAt.toISOString().slice(0, 10),
        total: Number(s.total),
      });
    }
  } catch {
    // Table might not exist or be empty
  }

  // 4. Ratio history (collateral/supply)
  const ratioHistory: { date: string; ratio: number }[] = [];
  try {
    const collateralSnapshots = await prisma.collateralSnapshot.findMany({
      where: {
        asset,
        snapshotAt: { gte: from, lte: to },
      },
      orderBy: { snapshotAt: "asc" },
      select: { snapshotAt: true, total: true },
    });
    // Build supply map for matching
    const supplyMap = new Map(supplyHistory.map((s) => [s.date, s.total]));
    for (const cs of collateralSnapshots) {
      const dateKey = cs.snapshotAt.toISOString().slice(0, 10);
      const supplyForDate = supplyMap.get(dateKey);
      if (supplyForDate && supplyForDate > 0) {
        ratioHistory.push({
          date: dateKey,
          ratio: (Number(cs.total) / supplyForDate) * 100,
        });
      }
    }
  } catch {
    // Table might not exist
  }

  // 5. Rendimiento (wARS only for now — VCP-based)
  let rendimiento: ReportData["rendimiento"] = null;
  if (asset === "wARS") {
    try {
      const vcpRows = await prisma.portfolioVCP.findMany({
        where: {
          asset: "wARS",
          fecha: { gte: from, lte: to },
        },
        orderBy: { fecha: "asc" },
        select: { fecha: true, vcp: true },
      });
      if (vcpRows.length >= 2) {
        const first = vcpRows[0];
        const last = vcpRows[vcpRows.length - 1];
        const vcpI = Number(first.vcp);
        const vcpF = Number(last.vcp);
        const periodReturn = ((vcpF / vcpI) - 1) * 100;
        const dias = Math.round((last.fecha.getTime() - first.fecha.getTime()) / 86400000);
        const tna = dias > 0 ? (periodReturn / dias) * 365 : 0;
        rendimiento = {
          tna,
          periodReturn,
          vcpInicial: vcpI,
          vcpFinal: vcpF,
          diasCalendario: dias,
        };
      }
    } catch {
      // VCP table might not exist
    }
  }

  // 6. Pools from GeckoTerminal cache
  const pools: PoolSummary[] = [];
  try {
    const poolConfigs = FIXED_POOLS.filter((p) => p.token === asset);
    for (const pc of poolConfigs) {
      const cached = await prisma.geckoPoolCache.findUnique({
        where: { id: pc.poolAddress },
      });
      if (cached && cached.dataJson) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = cached.dataJson as any;
        const attrs = d?.attributes ?? d ?? {};
        const volObj = attrs?.volume_usd ?? {};
        pools.push({
          label: pc.label,
          network: pc.networkId,
          reserveUsd: Number(attrs?.reserve_in_usd ?? 0),
          volume24h: Number(volObj?.h24 ?? 0),
          priceUsd: Number(attrs?.base_token_price_usd ?? 0),
          feePercent: Number(attrs?.pool_fee ?? 0),
        });
      }
    }
  } catch {
    // Pool cache might be empty
  }

  return {
    asset,
    assetName: config.name,
    from,
    to,
    collateral,
    supplyTotal,
    supplyByChain,
    supplyHistory,
    ratioHistory,
    rendimiento,
    pools,
    currencyCode: currency.code,
    currencySymbol: currency.symbol,
  };
}
