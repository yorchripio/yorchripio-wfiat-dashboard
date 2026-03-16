// app/api/wmxn/positions/route.ts
// GET: Devuelve todas las posiciones wMXN guardadas.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const positions = await prisma.wmxnFundPosition.findMany({
      orderBy: { fechaReporte: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: positions.map((p) => ({
        id: p.id,
        fechaReporte: p.fechaReporte.toISOString().slice(0, 10),
        periodoInicio: p.periodoInicio.toISOString().slice(0, 10),
        periodoFin: p.periodoFin.toISOString().slice(0, 10),
        fondo: p.fondo,
        serie: p.serie,
        titulosInicio: p.titulosInicio,
        titulosCierre: p.titulosCierre,
        precioValuacion: Number(p.precioValuacion),
        valorCartera: Number(p.valorCartera),
        movimientosNetos: Number(p.movimientosNetos),
        plusvalia: Number(p.plusvalia),
        rendimientoAnual: p.rendimientoAnual ? Number(p.rendimientoAnual) : null,
        rendimientoMensual: p.rendimientoMensual ? Number(p.rendimientoMensual) : null,
      })),
    });
  } catch (error) {
    console.error("[wMXN positions]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}
