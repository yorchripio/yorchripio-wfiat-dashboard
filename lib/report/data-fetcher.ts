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
// getHistoricalDataFromDB removed — was hardcoded to wARS. Ratio now built from coverage data.
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";

/** Pick ~15 key dates from a list: first, last, monthly, event dates */
function sampleDates(allDates: string[], eventDates: Set<string>): string[] {
  const sampled = new Set<string>();
  if (allDates.length === 0) return [];
  sampled.add(allDates[0]);
  sampled.add(allDates[allDates.length - 1]);
  for (const d of eventDates) { if (allDates.includes(d)) sampled.add(d); }
  for (const d of allDates) { if (d.endsWith("-01") || d.endsWith("-02")) sampled.add(d); }
  if (sampled.size < 10 && allDates.length > 10) {
    const step = Math.floor(allDates.length / 10);
    for (let i = 0; i < allDates.length; i += step) sampled.add(allDates[i]);
  }
  return Array.from(sampled).sort();
}

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

export interface PositionSnapshotRow {
  date: string;
  detail: string;
  valor: number;
  extra?: string; // e.g. rendimiento, indexador, etc.
}

export interface RendimientoRow {
  date: string;
  rendimiento: number;
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
  positionHistory: PositionSnapshotRow[];
  rendimientoHistory: RendimientoRow[];
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

  // 4. Ratio history — built from collateral snapshots + supply snapshots per asset
  //    (previously used getHistoricalDataFromDB which was hardcoded to wARS)
  const ratioHistory: { date: string; ratio: number }[] = [];
  // Ratio will be computed after coverage history (section 8) to reuse the same data

  // 5. Rendimiento (VCP-based for wARS, RendimientoHistorico for others)
  let rendimiento: ReportData["rendimiento"] = null;
  if (asset === "wARS") {
    try {
      const vcpRows = await prisma.portfolioVCP.findMany({
        where: { asset: "wARS", fecha: { gte: from, lte: to } },
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
        rendimiento = { tna, periodReturn, vcpInicial: vcpI, vcpFinal: vcpF, diasCalendario: dias };
      }
    } catch { /* ignore */ }
  } else {
    // For other assets, calculate from RendimientoHistorico
    try {
      const rh = await prisma.rendimientoHistorico.findMany({
        where: { asset, fecha: { gte: from, lte: to } },
        orderBy: { fecha: "asc" },
      });
      if (rh.length >= 2) {
        const totalReturn = rh.reduce((s, r) => s + Number(r.rendimiento), 0);
        const dias = Math.round((rh[rh.length - 1].fecha.getTime() - rh[0].fecha.getTime()) / 86400000);
        const tna = dias > 0 ? (totalReturn / dias) * 365 : 0;
        rendimiento = { tna, periodReturn: totalReturn, vcpInicial: 0, vcpFinal: 0, diasCalendario: dias };
      }
    } catch { /* ignore */ }
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

  // ═══ AUDIT SECTIONS (all assets) ═══

  // 7. Cuotaparte Events (wARS suscripciones/rescates)
  const cuotaparteEvents: CuotaparteEventRow[] = [];
  if (asset === "wARS") {
    try {
      const events = await prisma.cuotaparteEvent.findMany({
        where: { asset: "wARS", fecha: { gte: from, lte: to } },
        orderBy: { fecha: "asc" },
      });
      let cuotapartesAcum = 0;
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
    } catch { /* ignore */ }
  }

  // 8. Coverage history (collateral vs supply — ALL assets)
  const coverageHistory: CoverageRow[] = [];
  try {
    // Build collateral-by-date map depending on asset
    let collateralByDate = new Map<string, number>();

    if (asset === "wARS") {
      // Query allocations per date directly — NO carry-forward (carry-forward
      // inflates totals by keeping removed instrument types like A_la_Vista)
      const allocs = await prisma.collateralAllocation.findMany({
        where: { asset, activo: true, fecha: { gte: from, lte: to } },
        orderBy: { fecha: "asc" },
        select: { fecha: true, cantidadCuotasPartes: true, valorCuotaparte: true },
      });
      for (const a of allocs) {
        const d = a.fecha.toISOString().slice(0, 10);
        const v = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
        collateralByDate.set(d, (collateralByDate.get(d) ?? 0) + v);
      }
    } else if (asset === "wBRL") {
      // CDB positions grouped by fechaPosicao
      const positions = await prisma.wbrlCdbPosition.findMany({
        where: { esColateral: true, fechaPosicao: { gte: from, lte: to } },
        orderBy: { fechaPosicao: "asc" },
      });
      for (const p of positions) {
        const d = p.fechaPosicao.toISOString().slice(0, 10);
        collateralByDate.set(d, (collateralByDate.get(d) ?? 0) + Number(p.valorBruto));
      }
    } else if (asset === "wMXN") {
      const fundPositions = await prisma.wmxnFundPosition.findMany({
        where: { fechaReporte: { gte: from, lte: to } },
        orderBy: { fechaReporte: "asc" },
      });
      for (const fp of fundPositions) {
        collateralByDate.set(fp.fechaReporte.toISOString().slice(0, 10), Number(fp.valorCartera));
      }
    } else if (asset === "wCOP") {
      const snapshots = await prisma.wcopAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        collateralByDate.set(s.fechaCorte.toISOString().slice(0, 10), Number(s.saldoFinal));
      }
    } else if (asset === "wCLP") {
      const snapshots = await prisma.wclpAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        collateralByDate.set(s.fechaCorte.toISOString().slice(0, 10), Number(s.saldoFinal));
      }
    }
    // wPEN: no historical data — coverage comes from CollateralSnapshot if available
    if (asset === "wPEN" || collateralByDate.size === 0) {
      // Fallback: use CollateralSnapshot
      const cs = await prisma.collateralSnapshot.findMany({
        where: { asset, snapshotAt: { gte: from, lte: to } },
        orderBy: { snapshotAt: "asc" },
      });
      for (const s of cs) {
        collateralByDate.set(s.snapshotAt.toISOString().slice(0, 10), Number(s.total));
      }
    }

    // Build supply map from snapshots
    const supplyMap = new Map<string, number>();
    for (const s of supplyHistory) supplyMap.set(s.date, s.total);

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
  } catch { /* ignore */ }

  // 8b. Build ratioHistory from coverageHistory (works for ALL assets)
  for (const c of coverageHistory) {
    ratioHistory.push({ date: c.date, ratio: c.ratio });
  }

  // 9. Collateral breakdown by date — ALL assets
  const collateralBreakdown: CollateralBreakdownRow[] = [];
  try {
    if (asset === "wARS") {
      const allocs = await prisma.collateralAllocation.findMany({
        where: { asset, activo: true, fecha: { gte: from, lte: to } },
        orderBy: { fecha: "asc" },
        select: { fecha: true, tipo: true, nombre: true, cantidadCuotasPartes: true, valorCuotaparte: true },
      });
      const byDate = new Map<string, typeof allocs>();
      for (const a of allocs) {
        const d = a.fecha.toISOString().slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(a);
      }
      const eventDates = new Set(cuotaparteEvents.map((e) => e.fecha));
      const allDates = Array.from(byDate.keys()).sort();
      const sampledDates = sampleDates(allDates, eventDates);
      for (const d of sampledDates) {
        const dayAllocs = byDate.get(d);
        if (!dayAllocs) continue;
        const items = dayAllocs.map((a) => ({
          tipo: a.tipo, nombre: a.nombre,
          valor: Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte),
        }));
        collateralBreakdown.push({ date: d, items, total: items.reduce((s, i) => s + i.valor, 0) });
      }
    } else if (asset === "wBRL") {
      // Group CDB positions by fechaPosicao
      const positions = await prisma.wbrlCdbPosition.findMany({
        where: { esColateral: true, fechaPosicao: { gte: from, lte: to } },
        orderBy: [{ fechaPosicao: "asc" }, { capitalInicial: "desc" }],
      });
      const byDate = new Map<string, typeof positions>();
      for (const p of positions) {
        const d = p.fechaPosicao.toISOString().slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(p);
      }
      for (const [d, poss] of Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const items = poss.map((p) => ({
          tipo: "CDB",
          nombre: `CDB ${p.pctIndexador}% ${p.indexador} — vcto ${p.fechaVencimento.toISOString().slice(0, 10)}`,
          valor: Number(p.valorBruto),
        }));
        collateralBreakdown.push({ date: d, items, total: items.reduce((s, i) => s + i.valor, 0) });
      }
    } else if (asset === "wMXN") {
      const fundPositions = await prisma.wmxnFundPosition.findMany({
        where: { fechaReporte: { gte: from, lte: to } },
        orderBy: { fechaReporte: "asc" },
      });
      for (const fp of fundPositions) {
        collateralBreakdown.push({
          date: fp.fechaReporte.toISOString().slice(0, 10),
          items: [{
            tipo: "FCI",
            nombre: `${fp.fondo} Serie ${fp.serie} — ${fp.titulosCierre} títulos @ $${Number(fp.precioValuacion).toFixed(6)}`,
            valor: Number(fp.valorCartera),
          }],
          total: Number(fp.valorCartera),
        });
      }
    } else if (asset === "wCOP") {
      const snapshots = await prisma.wcopAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        collateralBreakdown.push({
          date: s.fechaCorte.toISOString().slice(0, 10),
          items: [
            { tipo: "Cuenta_Remunerada", nombre: `Capital wCOP`, valor: Number(s.capitalWcop) },
            { tipo: "Rendimiento", nombre: `Rendimientos acumulados`, valor: Number(s.rendimientos) },
          ],
          total: Number(s.saldoFinal),
        });
      }
    } else if (asset === "wCLP") {
      const snapshots = await prisma.wclpAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        collateralBreakdown.push({
          date: s.fechaCorte.toISOString().slice(0, 10),
          items: [
            { tipo: "A_la_Vista", nombre: `Cuenta Corriente BCI`, valor: Number(s.saldoFinal) },
          ],
          total: Number(s.saldoFinal),
        });
      }
    }
  } catch { /* ignore */ }

  // 10. VCP history (wARS) or position history (other assets)
  const vcpHistory: VCPRow[] = [];
  const positionHistory: PositionSnapshotRow[] = [];
  if (asset === "wARS") {
    try {
      const vcpRows = await prisma.portfolioVCP.findMany({
        where: { asset: "wARS", fecha: { gte: from, lte: to } },
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
    } catch { /* ignore */ }
  } else if (asset === "wBRL") {
    // Individual CDB positions evolution
    try {
      const positions = await prisma.wbrlCdbPosition.findMany({
        where: { esColateral: true, fechaPosicao: { gte: from, lte: to } },
        orderBy: [{ fechaPosicao: "asc" }, { capitalInicial: "desc" }],
      });
      for (const p of positions) {
        const ganancia = Number(p.valorBruto) - Number(p.capitalInicial);
        positionHistory.push({
          date: p.fechaPosicao.toISOString().slice(0, 10),
          detail: `CDB ${p.pctIndexador}% ${p.indexador} (${p.emisor})`,
          valor: Number(p.valorBruto),
          extra: `Capital: R$ ${Number(p.capitalInicial).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Ganancia: R$ ${ganancia.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | IR: R$ ${Number(p.ir).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Líquido: R$ ${Number(p.valorLiquido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        });
      }
    } catch { /* ignore */ }
  } else if (asset === "wMXN") {
    try {
      const fundPositions = await prisma.wmxnFundPosition.findMany({
        where: { fechaReporte: { gte: from, lte: to } },
        orderBy: { fechaReporte: "asc" },
      });
      for (const fp of fundPositions) {
        positionHistory.push({
          date: fp.fechaReporte.toISOString().slice(0, 10),
          detail: `${fp.fondo} Serie ${fp.serie}`,
          valor: Number(fp.valorCartera),
          extra: `Títulos: ${fp.titulosCierre} | Precio: $${Number(fp.precioValuacion).toFixed(6)} | Plusvalía: $${Number(fp.plusvalia).toLocaleString("es-MX", { minimumFractionDigits: 2 })} | Mov. netos: $${Number(fp.movimientosNetos).toLocaleString("es-MX", { minimumFractionDigits: 2 })} | Rend. anual: ${fp.rendimientoAnual ? Number(fp.rendimientoAnual).toFixed(2) + "%" : "N/A"}`,
        });
      }
    } catch { /* ignore */ }
  } else if (asset === "wCOP") {
    try {
      const snapshots = await prisma.wcopAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        positionHistory.push({
          date: s.fechaCorte.toISOString().slice(0, 10),
          detail: "Cuenta Ahorro Finandina",
          valor: Number(s.saldoFinal),
          extra: `Capital wCOP: $${Number(s.capitalWcop).toLocaleString("es-CO")} | Rendimientos: $${Number(s.rendimientos).toLocaleString("es-CO")} | Retiros MM: $${Number(s.retirosMM).toLocaleString("es-CO")} | Depósitos MM: $${Number(s.depositosMM).toLocaleString("es-CO")} | Impuestos: $${Number(s.impuestos).toLocaleString("es-CO")}`,
        });
      }
    } catch { /* ignore */ }
  } else if (asset === "wCLP") {
    try {
      const snapshots = await prisma.wclpAccountSnapshot.findMany({
        where: { fechaCorte: { gte: from, lte: to } },
        orderBy: { fechaCorte: "asc" },
      });
      for (const s of snapshots) {
        positionHistory.push({
          date: s.fechaCorte.toISOString().slice(0, 10),
          detail: "Cuenta Corriente BCI",
          valor: Number(s.saldoFinal),
          extra: `Abonos: $${Number(s.totalAbonos).toLocaleString("es-CL")} | Cargos: $${Number(s.totalCargos).toLocaleString("es-CL")}`,
        });
      }
    } catch { /* ignore */ }
  }

  // 11. Rendimiento history (all assets from RendimientoHistorico)
  const rendimientoHistory: RendimientoRow[] = [];
  try {
    const rh = await prisma.rendimientoHistorico.findMany({
      where: { asset, fecha: { gte: from, lte: to } },
      orderBy: { fecha: "asc" },
    });
    for (const r of rh) {
      rendimientoHistory.push({
        date: r.fecha.toISOString().slice(0, 10),
        rendimiento: Number(r.rendimiento),
      });
    }
  } catch { /* ignore */ }

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
    positionHistory,
    rendimientoHistory,
  };
}
