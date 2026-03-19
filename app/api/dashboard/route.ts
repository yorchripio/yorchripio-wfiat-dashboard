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
import { prisma } from "@/lib/db";
import {
  getWbrlCollateralData,
  getWmxnCollateralData,
  getWcopCollateralData,
  getWpenCollateralData,
  getWclpCollateralData,
} from "@/lib/db/collateral-by-asset";

import { fetchAdcapCuotaparte } from "@/lib/cafci/client";
import { calculateAndSaveRendimiento } from "@/lib/db/rendimiento-calc";

interface DashboardPayload {
  supplyData: Awaited<ReturnType<typeof getTotalSupply>>;
  collateralData: NonNullable<Awaited<ReturnType<typeof getCollateralDataFromDB>>>;
  historicalData: Awaited<ReturnType<typeof getHistoricalDataFromDB>>;
  rendimientoData: Awaited<ReturnType<typeof getRendimientoDataFromDB>>["data"];
  tiposQueRinden: Awaited<ReturnType<typeof getRendimientoDataFromDB>>["tiposQueRinden"];
  portfolioVCP?: { fecha: string; dateKey: string; timestamp: number; vcp: number; cuotapartesTotales: number; patrimonio: number }[];
  timestamp: string;
  source: "live" | "snapshot";
  isStale: boolean;
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

    const [supplyData, collateralData, rendimiento, portfolioVCPRows] = await Promise.all([
      getTotalSupply(asset),
      getCollateral(),
      asset === "wARS" ? getRendimientoDataFromDB() : Promise.resolve({ data: [], tiposQueRinden: [] }),
      asset === "wARS"
        ? prisma.portfolioVCP.findMany({
            where: { asset: "wARS" },
            orderBy: { fecha: "asc" },
            select: { fecha: true, vcp: true, cuotapartesTotales: true, patrimonio: true },
          })
        : Promise.resolve([]),
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

    const portfolioVCP = portfolioVCPRows.map((r: { fecha: Date; vcp: unknown; cuotapartesTotales: unknown; patrimonio: unknown }) => ({
      fecha: r.fecha.toISOString().slice(0, 10),
      dateKey: r.fecha.toISOString().slice(0, 10),
      timestamp: r.fecha.getTime(),
      vcp: Number(r.vcp),
      cuotapartesTotales: Number(r.cuotapartesTotales),
      patrimonio: Number(r.patrimonio),
    }));

    const payload: DashboardPayload = {
      supplyData,
      collateralData,
      historicalData,
      rendimientoData: rendimiento.data,
      tiposQueRinden: rendimiento.tiposQueRinden,
      portfolioVCP,
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
