// app/api/dashboard/route.ts
// Endpoint agregado para cargar todo el dashboard en un solo request.

import { NextResponse } from "next/server";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getCollateralDataFromDB } from "@/lib/db/collateral";
import { getHistoricalDataFromDB } from "@/lib/db/history";
import { getRendimientoDataFromDB } from "@/lib/db/rendimiento";

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

export async function GET(): Promise<NextResponse> {
  try {
    const [supplyData, collateralData, rendimiento] = await Promise.all([
      getTotalSupply(),
      getCollateralDataFromDB(),
      getRendimientoDataFromDB(),
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
      return NextResponse.json(
        {
          success: false,
          error:
            "No hay datos de colateral en la base de datos. Importá desde el sheet o cargá líneas en Data.",
        },
        { status: 404 }
      );
    }

    const historicalData = await getHistoricalDataFromDB(365, supplyData.total);

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
        error: error instanceof Error ? error.message : "Error al cargar dashboard",
      },
      { status: 500 }
    );
  }
}
