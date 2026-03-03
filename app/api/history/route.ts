// app/api/history/route.ts
// Historial combinado (ratio): colateral por fecha desde allocations; supply desde snapshots o query.

import { NextResponse } from "next/server";
import { getHistoricalDataFromDB } from "@/lib/db/history";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const supplyTotalParam = searchParams.get("supplyTotal");
    const currentSupplyFallback =
      supplyTotalParam != null ? parseFloat(supplyTotalParam) : undefined;
    const validFallback =
      typeof currentSupplyFallback === "number" &&
      !Number.isNaN(currentSupplyFallback) &&
      currentSupplyFallback > 0
        ? currentSupplyFallback
        : undefined;

    const historicalData = await getHistoricalDataFromDB(365, validFallback);
    return NextResponse.json({
      success: true,
      data: historicalData,
    });
  } catch (error) {
    console.error("[API /history] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al cargar histórico",
      },
      { status: 500 }
    );
  }
}
