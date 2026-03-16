// app/api/wmxn/confirm/route.ts
// POST: Guarda la posición del fondo wMXN confirmada por el usuario.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

interface PositionInput {
  periodoInicio: string;
  periodoFin: string;
  fondo: string;
  serie: string;
  titulosInicio: number;
  titulosCierre: number;
  precioValuacion: number;
  valorCartera: number;
  movimientosNetos: number;
  plusvalia: number;
  rendimientoAnual: number | null;
  rendimientoMensual: number | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!hasMinRole(session.user.role as "ADMIN" | "TRADER" | "VIEWER", "TRADER")) {
      return NextResponse.json({ success: false, error: "Solo TRADER o ADMIN" }, { status: 403 });
    }

    const body = await request.json();
    const pos: PositionInput = body.position;
    if (!pos || !pos.periodoFin) {
      return NextResponse.json({ success: false, error: "Datos de posición incompletos" }, { status: 400 });
    }

    const fechaReporte = new Date(pos.periodoFin + "T00:00:00Z");

    // Replace existing position for the same fechaReporte
    await prisma.wmxnFundPosition.deleteMany({ where: { fechaReporte } });

    const created = await prisma.wmxnFundPosition.create({
      data: {
        fechaReporte,
        periodoInicio: new Date(pos.periodoInicio + "T00:00:00Z"),
        periodoFin: new Date(pos.periodoFin + "T00:00:00Z"),
        fondo: pos.fondo || "REGIO1",
        serie: pos.serie || "M",
        titulosInicio: pos.titulosInicio,
        titulosCierre: pos.titulosCierre,
        precioValuacion: pos.precioValuacion,
        valorCartera: pos.valorCartera,
        movimientosNetos: pos.movimientosNetos,
        plusvalia: pos.plusvalia,
        rendimientoAnual: pos.rendimientoAnual,
        rendimientoMensual: pos.rendimientoMensual,
      },
    });

    // Calculate and save daily return in RendimientoHistorico
    const prevPosition = await prisma.wmxnFundPosition.findFirst({
      where: { fechaReporte: { lt: fechaReporte } },
      orderBy: { fechaReporte: "desc" },
    });

    if (prevPosition && Number(prevPosition.valorCartera) > 0) {
      const prevVal = Number(prevPosition.valorCartera);
      const currVal = pos.valorCartera;
      const rendPeriodo = ((currVal - prevVal) / prevVal) * 100;

      await prisma.rendimientoHistorico.upsert({
        where: { asset_fecha: { asset: "wMXN", fecha: fechaReporte } },
        update: { rendimiento: rendPeriodo },
        create: { asset: "wMXN", fecha: fechaReporte, rendimiento: rendPeriodo },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        fechaReporte: pos.periodoFin,
        valorCartera: pos.valorCartera,
        plusvalia: pos.plusvalia,
      },
    });
  } catch (error) {
    console.error("[wMXN confirm]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error guardando datos" },
      { status: 500 }
    );
  }
}
