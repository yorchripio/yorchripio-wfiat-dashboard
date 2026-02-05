// app/api/history/route.ts
// Endpoint que retorna datos históricos desde Google Sheets

import { NextResponse } from "next/server";
import { getHistoricalData } from "@/lib/sheets/history";

export async function GET() {
  try {
    console.log("[API /history] Consultando datos históricos de Google Sheets...");

    const historicalData = await getHistoricalData();

    console.log("[API /history] Datos históricos obtenidos:", {
      puntos: historicalData.length,
      fechaInicio: historicalData[0]?.fecha,
      fechaFin: historicalData[historicalData.length - 1]?.fecha,
    });

    return NextResponse.json({
      success: true,
      data: historicalData,
    });

  } catch (error) {
    console.error("[API /history] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
