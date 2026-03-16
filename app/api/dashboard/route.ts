// app/api/dashboard/route.ts
// Endpoint agregado para cargar todo el dashboard en un solo request.
// Soporta ?asset=wARS (default) o ?asset=wBRL

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { type AssetSymbol } from "@/lib/blockchain/config";
import { getCollateralDataFromDB } from "@/lib/db/collateral";
import { getHistoricalDataFromDB } from "@/lib/db/history";
import { getRendimientoDataFromDB } from "@/lib/db/rendimiento";
import { type ColateralData } from "@/lib/sheets/collateral";
import { prisma } from "@/lib/db";
import { getPenBalance } from "@/lib/wpen/buda-client";

import { fetchAdcapCuotaparte } from "@/lib/cafci/client";
import { calculateAndSaveRendimiento } from "@/lib/db/rendimiento-calc";

interface DashboardPayload {
  supplyData: Awaited<ReturnType<typeof getTotalSupply>>;
  collateralData: NonNullable<Awaited<ReturnType<typeof getCollateralDataFromDB>>>;
  historicalData: Awaited<ReturnType<typeof getHistoricalDataFromDB>>;
  rendimientoData: Awaited<ReturnType<typeof getRendimientoDataFromDB>>["data"];
  tiposQueRinden: Awaited<ReturnType<typeof getRendimientoDataFromDB>>["tiposQueRinden"];
  timestamp: string;
  source: "live" | "snapshot";
  isStale: boolean;
}

/** Build ColateralData for wMXN from fund positions in DB.
 *  Extrapolates to today using Banregio's rendimientoAnual if the report is stale. */
async function getWmxnCollateralData(): Promise<ColateralData | null> {
  const latest = await prisma.wmxnFundPosition.findFirst({
    orderBy: { fechaReporte: "desc" },
  });
  if (!latest) return null;

  const valorCartera = Number(latest.valorCartera);
  const rendAnual = latest.rendimientoAnual ? Number(latest.rendimientoAnual) / 100 : 0; // 5.85 → 0.0585
  const dailyRate = rendAnual > 0 ? Math.pow(1 + rendAnual, 1 / 365) - 1 : 0;

  // Days since last report
  const fechaReporte = latest.fechaReporte.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const daysSince = Math.max(0, Math.round(
    (new Date(today + "T00:00:00Z").getTime() - new Date(fechaReporte + "T00:00:00Z").getTime()) / 86400000
  ));

  // Estimated current value using compound daily rate
  const valorEstimado = daysSince > 0 && dailyRate > 0
    ? valorCartera * Math.pow(1 + dailyRate, daysSince)
    : valorCartera;

  const isEstimated = daysSince > 0 && dailyRate > 0;
  const rendDiario = dailyRate * 100;
  const label = isEstimated
    ? `Fondo REGIO1 Serie ${latest.serie} (est. +${daysSince}d)`
    : `Fondo REGIO1 Serie ${latest.serie}`;

  return {
    fecha: today,
    instrumentos: [
      {
        id: "fondo-regio1",
        nombre: label,
        tipo: "FCI" as const,
        entidad: "Banregio",
        valorTotal: valorEstimado,
        porcentaje: 100,
        rendimientoDiario: rendDiario,
        activo: true,
      },
    ],
    total: valorEstimado,
    totalFormatted: `$ ${valorEstimado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}

/** Build ColateralData for wCOP from account snapshots in DB.
 *  Also includes ETH+Base supply as additional collateral (minted 2026-02-26)
 *  with estimated interest from Finandina account rate. */
async function getWcopCollateralData(): Promise<ColateralData | null> {
  const latest = await prisma.wcopAccountSnapshot.findFirst({
    orderBy: { fechaCorte: "desc" },
  });
  if (!latest) return null;

  const capitalWcop = Number(latest.capitalWcop);
  const rendimientos = Number(latest.rendimientos);
  // Capital + rendimientos proporcionales = colateral real del wCOP (World Chain)
  const colateralWC = capitalWcop + rendimientos;

  // ETH+Base supply was minted on 2026-02-26 and is also backed by Finandina funds.
  // Query on-chain supply for those chains to get the exact amount.
  let ethBaseCapital = 0;
  let ethBaseInterest = 0;
  const MINT_DATE = "2026-02-26";
  try {
    const supplyData = await getTotalSupply("wCOP");
    const ethSupply = supplyData.chains.ethereum.success ? supplyData.chains.ethereum.supply : 0;
    const baseSupply = supplyData.chains.base.success ? supplyData.chains.base.supply : 0;
    ethBaseCapital = ethSupply + baseSupply;

    if (ethBaseCapital > 0) {
      // Finandina account TNA (approx 9.13% from Feb 2026 monthly breakdown)
      const tna = 0.0913;
      const dailyRate = Math.pow(1 + tna, 1 / 365) - 1;
      const today = new Date().toISOString().slice(0, 10);
      const daysSinceMint = Math.max(0, Math.round(
        (new Date(today + "T00:00:00Z").getTime() - new Date(MINT_DATE + "T00:00:00Z").getTime()) / 86400000
      ));
      ethBaseInterest = ethBaseCapital * (Math.pow(1 + dailyRate, daysSinceMint) - 1);
    }
  } catch (err) {
    console.error("[wCOP collateral] Error fetching ETH+Base supply for collateral:", err);
  }

  const colateralTotal = colateralWC + ethBaseCapital + ethBaseInterest;
  const rendDiario = capitalWcop > 0 ? ((rendimientos / capitalWcop) / 30) * 100 : 0;

  const instrumentos = [
    {
      id: "cuenta-ahorro-finandina",
      nombre: "Cta. Remunerada (World Chain)",
      tipo: "Cuenta_Remunerada" as const,
      entidad: "Finandina",
      valorTotal: colateralWC,
      porcentaje: colateralTotal > 0 ? (colateralWC / colateralTotal) * 100 : 100,
      rendimientoDiario: rendDiario,
      activo: true,
    },
  ];

  if (ethBaseCapital > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const daysSinceMint = Math.max(0, Math.round(
      (new Date(today + "T00:00:00Z").getTime() - new Date(MINT_DATE + "T00:00:00Z").getTime()) / 86400000
    ));
    instrumentos.push({
      id: "finandina-eth-base",
      nombre: `Cta. Remunerada (ETH+Base)`,
      tipo: "Cuenta_Remunerada" as const,
      entidad: "Finandina",
      valorTotal: ethBaseCapital + ethBaseInterest,
      porcentaje: colateralTotal > 0 ? ((ethBaseCapital + ethBaseInterest) / colateralTotal) * 100 : 0,
      rendimientoDiario: rendDiario,
      activo: true,
    });
  }

  return {
    fecha: latest.fechaCorte.toISOString().slice(0, 10),
    instrumentos,
    total: colateralTotal,
    totalFormatted: `$ ${Math.round(colateralTotal).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}

/** Build ColateralData for wPEN from Buda.com balance (no yield) */
async function getWpenCollateralData(): Promise<ColateralData | null> {
  try {
    const balance = await getPenBalance();
    if (balance.amount <= 0) return null;

    const today = new Date().toISOString().slice(0, 10);
    return {
      fecha: today,
      instrumentos: [
        {
          id: "buda-pen",
          nombre: "Balance Buda.com (a la vista)",
          tipo: "A_la_Vista" as const,
          entidad: "Buda.com",
          valorTotal: balance.amount,
          porcentaje: 100,
          rendimientoDiario: 0,
          activo: true,
        },
      ],
      total: balance.amount,
      totalFormatted: `S/ ${balance.amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
      timestamp: new Date().toISOString(),
      rendimientoCartera: 0,
    };
  } catch (err) {
    console.error("[wPEN collateral] Error fetching Buda balance:", err);
    return null;
  }
}

/** Build ColateralData for wCLP from BCI account snapshot (DB) */
async function getWclpCollateralData(): Promise<ColateralData | null> {
  try {
    const bciSnapshot = await prisma.wclpAccountSnapshot.findFirst({
      orderBy: { fechaCorte: "desc" },
    });
    if (!bciSnapshot) return null;

    const total = Number(bciSnapshot.saldoFinal);
    const fecha = bciSnapshot.fechaCorte.toISOString().slice(0, 10);

    return {
      fecha,
      instrumentos: [
        {
          id: "bci-cta-cte",
          nombre: "Cuenta Corriente BCI",
          tipo: "A_la_Vista" as const,
          entidad: "BCI",
          valorTotal: total,
          porcentaje: 100,
          rendimientoDiario: 0,
          activo: true,
        },
      ],
      total,
      totalFormatted: `$ ${Math.round(total).toLocaleString("es-CL")}`,
      timestamp: new Date().toISOString(),
      rendimientoCartera: 0,
    };
  } catch (err) {
    console.error("[wCLP collateral] Error:", err);
    return null;
  }
}

/** Build ColateralData for wBRL from CDB positions in DB */
async function getWbrlCollateralData(): Promise<ColateralData | null> {
  const latestPos = await prisma.wbrlCdbPosition.findFirst({
    where: { esColateral: true },
    orderBy: { fechaPosicao: "desc" },
    select: { fechaPosicao: true },
  });
  if (!latestPos) return null;

  const positions = await prisma.wbrlCdbPosition.findMany({
    where: { fechaPosicao: latestPos.fechaPosicao, esColateral: true },
    orderBy: { capitalInicial: "desc" },
  });

  const totalBruto = positions.reduce((s, p) => s + Number(p.valorBruto), 0);
  const totalLiquido = positions.reduce((s, p) => s + Number(p.valorLiquido), 0);
  const totalCapital = positions.reduce((s, p) => s + Number(p.capitalInicial), 0);
  const rendDiario = totalCapital > 0 ? (((totalBruto / totalCapital) - 1) / 365) * 100 : 0;

  const fecha = latestPos.fechaPosicao.toISOString().slice(0, 10);

  return {
    fecha,
    instrumentos: [
      {
        id: "cdb-cdi-99",
        nombre: `CDB 99% CDI CETIP (${positions.length} pos.)`,
        tipo: "CDB" as const,
        entidad: positions[0]?.emisor ?? "BANCO GENIAL S.A.",
        valorTotal: totalBruto,
        porcentaje: 100,
        rendimientoDiario: rendDiario,
        activo: true,
      },
    ],
    total: totalBruto,
    totalFormatted: `R$ ${totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}

/**
 * Auto-update FCI cuotaparte from CAFCI. Creates allocations for:
 * 1. The latest CAFCI date (real vcp)
 * 2. Each day between CAFCI date and today (estimated vcp using daily compound rate)
 */
async function tryUpdateCafci(): Promise<void> {
  const latestFci = await prisma.collateralAllocation.findFirst({
    where: { asset: "wARS", tipo: "FCI", activo: true },
    orderBy: { fecha: "desc" },
  });
  if (!latestFci) return;

  const today = new Date().toISOString().slice(0, 10);
  const latestDate = latestFci.fecha.toISOString().slice(0, 10);

  // Already updated today → skip
  if (latestDate === today) return;

  const cafci = await fetchAdcapCuotaparte();
  if (!cafci) return;

  // Get all allocations from latest date (supports multiple FCI lines)
  const allLatest = await prisma.collateralAllocation.findMany({
    where: { asset: "wARS", fecha: latestFci.fecha, activo: true },
  });

  // Calculate daily rate from previous vcp → CAFCI vcp
  const prevVcp = Number(latestFci.valorCuotaparte);
  const cafciDate = new Date(cafci.fecha + "T00:00:00.000Z");
  const prevDate = latestFci.fecha;
  const daysBetween = Math.max(1, Math.round(
    (cafciDate.getTime() - prevDate.getTime()) / 86400000
  ));
  const dailyRate = prevVcp > 0 ? Math.pow(cafci.vcp / prevVcp, 1 / daysBetween) - 1 : 0;

  // Build list of dates to create: CAFCI date + each day until today
  const todayDate = new Date(today + "T00:00:00.000Z");
  const datesToCreate: { fecha: Date; vcp: number; estimated: boolean }[] = [];

  // Add CAFCI date with real vcp
  if (cafci.fecha !== latestDate) {
    datesToCreate.push({ fecha: cafciDate, vcp: cafci.vcp, estimated: false });
  }

  // Add estimated days from CAFCI date+1 to today
  if (dailyRate > 0) {
    const d = new Date(cafciDate);
    d.setUTCDate(d.getUTCDate() + 1);
    let daysFromCafci = 1;
    while (d <= todayDate) {
      const estVcp = cafci.vcp * Math.pow(1 + dailyRate, daysFromCafci);
      datesToCreate.push({
        fecha: new Date(d.getTime()),
        vcp: estVcp,
        estimated: true,
      });
      d.setUTCDate(d.getUTCDate() + 1);
      daysFromCafci++;
    }
  }

  if (datesToCreate.length === 0) return;

  // Create allocations for each date, copying all lines from latest
  for (const { fecha, vcp } of datesToCreate) {
    // Get existing allocations for this date to avoid duplicates
    const existingForDate = await prisma.collateralAllocation.findMany({
      where: { asset: "wARS", fecha, activo: true },
    });
    const existingIds = new Set(
      existingForDate.map((e) => `${e.tipo}:${Number(e.cantidadCuotasPartes).toFixed(6)}`)
    );

    for (const alloc of allLatest) {
      const isFci = alloc.tipo === "FCI";
      const newVcp = isFci ? vcp : Number(alloc.valorCuotaparte);
      const allocKey = `${alloc.tipo}:${Number(alloc.cantidadCuotasPartes).toFixed(6)}`;

      if (existingIds.has(allocKey)) {
        // Update vcp if it's FCI and value changed
        if (isFci) {
          const existing = existingForDate.find(
            (e) => e.tipo === "FCI" &&
              Math.abs(Number(e.cantidadCuotasPartes) - Number(alloc.cantidadCuotasPartes)) < 0.01
          );
          if (existing && Math.abs(Number(existing.valorCuotaparte) - newVcp) > 0.001) {
            await prisma.collateralAllocation.update({
              where: { id: existing.id },
              data: { valorCuotaparte: newVcp },
            });
          }
        }
      } else {
        await prisma.collateralAllocation.create({
          data: {
            asset: "wARS",
            tipo: alloc.tipo,
            nombre: alloc.nombre,
            entidad: alloc.entidad,
            cantidadCuotasPartes: Number(alloc.cantidadCuotasPartes),
            valorCuotaparte: newVcp,
            fecha,
            activo: true,
          },
        });
      }
    }

    try {
      await calculateAndSaveRendimiento(fecha);
    } catch (err) {
      console.warn("[CAFCI auto-update] rendimiento calc error:", err);
    }
  }

  console.log(
    `[CAFCI auto-update] Updated wARS: CAFCI vcp=${cafci.vcp} (${cafci.fecha}), ` +
    `${datesToCreate.length} dates created/updated through ${today}`
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const asset = (request.nextUrl.searchParams.get("asset") || "wARS") as AssetSymbol;

    // Auto-update cuotaparte from CAFCI for wARS (best-effort, don't block)
    if (asset === "wARS") {
      try {
        await tryUpdateCafci();
      } catch (err) {
        console.error("[dashboard] CAFCI auto-update error (non-blocking):", err);
      }
    }

    const getCollateral = () => {
      switch (asset) {
        case "wBRL": return getWbrlCollateralData();
        case "wMXN": return getWmxnCollateralData();
        case "wCOP": return getWcopCollateralData();
        case "wPEN": return getWpenCollateralData();
        case "wCLP": return getWclpCollateralData();
        default: return getCollateralDataFromDB();
      }
    };

    const [supplyData, collateralData, rendimiento] = await Promise.all([
      getTotalSupply(asset),
      getCollateral(),
      asset === "wARS" ? getRendimientoDataFromDB() : Promise.resolve({ data: [], tiposQueRinden: [] }),
    ]);

    if (!supplyData.allSuccessful) {
      const failed = (["ethereum", "worldchain", "base"] as const).filter(
        (chain) => !supplyData.chains[chain].success
      );
      return NextResponse.json(
        {
          success: false,
          error: `Supply incompleto: fallaron ${failed.join(", ")}. No usar total parcial.`,
        },
        { status: 503 }
      );
    }

    if (!collateralData) {
      const msgs: Record<string, string> = {
        wBRL: "No hay posiciones CDB de wBRL cargadas. Subí el PDF de Renda Fixa en Colateral.",
        wMXN: "No hay posiciones wMXN cargadas. Subí el Estado de Cuenta de Banregio en Colateral.",
        wCOP: "No hay snapshots wCOP cargados. Subí el CSV de Finandina en Colateral.",
        wPEN: "No se pudo obtener el balance de Buda.com. Verificá las API keys.",
        wCLP: "No hay snapshots wCLP cargados. Subí el extracto BCI (MOVCTACTE) en Colateral.",
      };
      return NextResponse.json(
        {
          success: false,
          error: msgs[asset] ?? "No hay datos de colateral en la base de datos. Importá desde el sheet o cargá líneas en Data.",
        },
        { status: 404 }
      );
    }

    const historicalData = asset === "wARS"
      ? await getHistoricalDataFromDB(365, supplyData.total)
      : [];

    const payload: DashboardPayload = {
      supplyData,
      collateralData,
      historicalData,
      rendimientoData: rendimiento.data,
      tiposQueRinden: rendimiento.tiposQueRinden,
      timestamp: new Date().toISOString(),
      source: "live",
      isStale: false,
    };

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("[API /dashboard] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al cargar dashboard",
      },
      { status: 500 }
    );
  }
}
