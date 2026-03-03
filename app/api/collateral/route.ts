// app/api/collateral/route.ts
// Retorna el colateral desde la base de datos (allocations).
// Misma forma que antes (ColateralData) para el dashboard y página Colateral.

import { NextResponse } from "next/server";
import { getCollateralDataFromDB } from "@/lib/db/collateral";

export async function GET(): Promise<NextResponse> {
  try {
    const collateralData = await getCollateralDataFromDB();
    if (!collateralData) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay datos de colateral en la base de datos. Importá desde el sheet o cargá líneas en Data.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: collateralData,
    });
  } catch (error) {
    console.error("[API /collateral] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al cargar colateral",
      },
      { status: 500 }
    );
  }
}
