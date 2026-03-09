// app/api/rendimiento/route.ts
// Rendimiento histórico de la cartera desde la DB (collateral_snapshots).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRendimientoDataFromDB } from "@/lib/db/rendimiento";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { data, tiposQueRinden } = await getRendimientoDataFromDB();
    return NextResponse.json({ success: true, data, tiposQueRinden });
  } catch (error) {
    console.error("[API /rendimiento] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al cargar rendimiento",
      },
      { status: 500 }
    );
  }
}
