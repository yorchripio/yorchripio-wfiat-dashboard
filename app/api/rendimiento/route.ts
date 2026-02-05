// app/api/rendimiento/route.ts
// Endpoint que retorna datos históricos de rendimiento de la cartera

import { NextResponse } from "next/server";
import { getRendimientoData } from "@/lib/sheets/rendimiento";

export async function GET() {
  try {
    console.log("[API /rendimiento] Consultando rendimiento histórico...");
    const data = await getRendimientoData();

    console.log("[API /rendimiento] Datos obtenidos:", data.length, "puntos");

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[API /rendimiento] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
