// lib/report/data-fetcher.ts
// Aggregates all data needed for a PDF report for a given asset

import { type AssetSymbol, TOKEN_CONFIGS } from "@/lib/blockchain/config";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getCollateralDataFromDB, getCollateralTotalsByDate } from "@/lib/db/collateral";
import {
  getWbrlCollateralData,
  getWmxnCollateralData,
  getWcopCollateralData,
  getWpenCollateralData,
  getWclpCollateralData,
} from "@/lib/db/collateral-by-asset";
import { type ColateralData } from "@/lib/sheets/collateral";
import { prisma } from "@/lib/db";
import { getHistoricalDataFromDB } from "@/lib/db/history";
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

export interface CuotaparteEventRow {
  fecha: string;
  tipo: string;
  montoARS: number;
  vcpFCI: number;
  cuotapartes: number;
  descripcion: string;
  cuotapartesAcum: number;
}

export interface CoverageRow {
  date: string;
  collateral: number;
  supply: number;
  ratio: number;
}

export interface CollateralBreakdownRow {
  date: string;
  items: { tipo: string; nombre: string; valor: number }[];
  total: number;
}

export interface VCPRow {
  date: string;
  vcp: number;
  patrimonio: number;
  cuotapartes: number;
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
  // Audit sections
  cuotaparteEvents: CuotaparteEventRow[];
  coverageHistory: CoverageRow[];
  collateralBreakdown: CollateralBreakdownRow[];
  vcpHistory: VCPRow[];
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

  // 4. Ratio history — use the same robust logic as the dashboard
  //    (interpolates supply to nearest known date, falls back to current supply)
  let ratioHistory: { date: string; ratio: number }[] = [];
  try {
    const daysInRange = Math.ceil((to.getTime() - from.getTime()) / 86400000);
    const historicalPoints = await getHistoricalDataFromDB(
      Math.max(daysInRange + 30, 365),
      supplyTotal > 0 ? supplyTotal : undefined
    );
    const fromTs = from.getTime();
    const toTs = to.getTime();
    ratioHistory = historicalPoints
      .filter((p) => p.timestamp >= fromTs && p.timestamp <= toTs)
      .map((p) => ({
        date: p.fecha.split("/").reverse().join("-"), // DD/MM/YYYY → YYYY-MM-DD
        ratio: p.ratio,
      }));
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

  // ═══ AUDIT SECTIONS ═══

  // 7. Cuotaparte Events (suscripciones/rescates)
  const cuotaparteEvents: CuotaparteEventRow[] = [];
  if (asset === "wARS") {
    try {
      const events = await prisma.cuotaparteEvent.findMany({
        where: {
          asset: "wARS",
          fecha: { gte: from, lte: to },
        },
        orderBy: { fecha: "asc" },
      });
      let cuotapartesAcum = 0;
      // Get initial cuotapartes (sum of events before `from`)
      const prevEvents = await prisma.cuotaparteEvent.findMany({
        where: { asset: "wARS", fecha: { lt: from } },
      });
      for (const e of prevEvents) cuotapartesAcum += Number(e.cuotapartes);

      for (const e of events) {
        cuotapartesAcum += Number(e.cuotapartes);
        cuotaparteEvents.push({
          fecha: e.fecha.toISOString().slice(0, 10),
          tipo: e.tipo,
          montoARS: Number(e.montoARS),
          vcpFCI: Number(e.vcpFCI),
          cuotapartes: Number(e.cuotapartes),
          descripcion: e.descripcion ?? "",
          cuotapartesAcum,
        });
      }
    } catch {
      // Table might not exist
    }
  }

  // 8. Coverage history (collateral vs supply day by day)
  const coverageHistory: CoverageRow[] = [];
  try {
    const collateralByDate = await getCollateralTotalsByDate(asset, 365);
    // Build supply map from snapshots
    const supplyMap = new Map<string, number>();
    for (const s of supplyHistory) {
      supplyMap.set(s.date, s.total);
    }

    // Merge dates from both sources
    const allCovDates = new Set<string>();
    for (const d of collateralByDate.keys()) allCovDates.add(d);
    for (const d of supplyMap.keys()) allCovDates.add(d);

    const sortedCovDates = Array.from(allCovDates).sort();
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    let lastSupply = 0;
    let lastCollateral = 0;

    for (const d of sortedCovDates) {
      if (supplyMap.has(d)) lastSupply = supplyMap.get(d)!;
      if (collateralByDate.has(d)) lastCollateral = collateralByDate.get(d)!;
      if (d >= fromStr && d <= toStr && lastSupply > 0 && lastCollateral > 0) {
        coverageHistory.push({
          date: d,
          collateral: lastCollateral,
          supply: lastSupply,
          ratio: (lastCollateral / lastSupply) * 100,
        });
      }
    }
  } catch {
    // ignore
  }

  // 9. Collateral breakdown by date (composition at key dates)
  const collateralBreakdown: CollateralBreakdownRow[] = [];
  if (asset === "wARS") {
    try {
      // Get all allocations in range
      const allocs = await prisma.collateralAllocation.findMany({
        where: {
          asset,
          activo: true,
          fecha: { gte: from, lte: to },
        },
        orderBy: { fecha: "asc" },
        select: { fecha: true, tipo: true, nombre: true, cantidadCuotasPartes: true, valorCuotaparte: true },
      });

      // Group by date
      const byDate = new Map<string, typeof allocs>();
      for (const a of allocs) {
        const d = a.fecha.toISOString().slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(a);
      }

      // Sample key dates (max ~15 to fit in report): first, last, monthly, and event dates
      const eventDates = new Set(cuotaparteEvents.map((e) => e.fecha));
      const allDates = Array.from(byDate.keys()).sort();
      const sampledDates = new Set<string>();

      // Always include first and last
      if (allDates.length > 0) {
        sampledDates.add(allDates[0]);
        sampledDates.add(allDates[allDates.length - 1]);
      }
      // Include event dates
      for (const d of eventDates) {
        if (byDate.has(d)) sampledDates.add(d);
      }
      // Monthly snapshots (1st of each month)
      for (const d of allDates) {
        if (d.endsWith("-01") || d.endsWith("-02")) sampledDates.add(d);
      }
      // If still < 10, add some evenly spaced
      if (sampledDates.size < 10 && allDates.length > 10) {
        const step = Math.floor(allDates.length / 10);
        for (let i = 0; i < allDates.length; i += step) sampledDates.add(allDates[i]);
      }

      for (const d of Array.from(sampledDates).sort()) {
        const dayAllocs = byDate.get(d);
        if (!dayAllocs) continue;
        const items = dayAllocs.map((a) => ({
          tipo: a.tipo,
          nombre: a.nombre,
          valor: Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte),
        }));
        const total = items.reduce((s, i) => s + i.valor, 0);
        collateralBreakdown.push({ date: d, items, total });
      }
    } catch {
      // ignore
    }
  }

  // 10. VCP history (portfolio value per cuotaparte)
  const vcpHistory: VCPRow[] = [];
  if (asset === "wARS") {
    try {
      const vcpRows = await prisma.portfolioVCP.findMany({
        where: {
          asset: "wARS",
          fecha: { gte: from, lte: to },
        },
        orderBy: { fecha: "asc" },
        select: { fecha: true, vcp: true, patrimonio: true, cuotapartesTotales: true },
      });
      for (const r of vcpRows) {
        vcpHistory.push({
          date: r.fecha.toISOString().slice(0, 10),
          vcp: Number(r.vcp),
          patrimonio: Number(r.patrimonio),
          cuotapartes: Number(r.cuotapartesTotales),
        });
      }
    } catch {
      // ignore
    }
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
    cuotaparteEvents,
    coverageHistory,
    collateralBreakdown,
    vcpHistory,
  };
}
