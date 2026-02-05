// app/api/collateral/route.ts
// Endpoint que retorna el colateral desde Google Sheets

import { NextResponse } from "next/server";
import { getCollateralData } from "@/lib/sheets/collateral";

export async function GET() {
  try {
    console.log("[API /collateral] Consultando Google Sheets...");

    const collateralData = await getCollateralData();

    console.log("[API /collateral] Colateral obtenido:", {
      total: collateralData.total,
      fecha: collateralData.fecha,
      instrumentos: collateralData.instrumentos.length,
    });

    return NextResponse.json({
      success: true,
      data: collateralData,
    });

  } catch (error) {
    console.error("[API /collateral] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}