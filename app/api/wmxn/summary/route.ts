// app/api/wmxn/summary/route.ts
// GET: Resumen del colateral wMXN — posición actual, totalsByDate, rendimiento.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const fechaParam = request.nextUrl.searchParams.get("fecha");

    // All available report dates
    const allPositions = await prisma.wmxnFundPosition.findMany({
      orderBy: { fechaReporte: "desc" },
    });

    const availableDates = allPositions.map((p) => p.fechaReporte.toISOString().slice(0, 10));

    if (allPositions.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        availableDates: [],
        totalsByDate: [],
        message: "No hay posiciones wMXN cargadas",
      });
    }

    // totalsByDate for client-side period calculations
    const totalsByDate = allPositions
      .map((p) => ({
        fecha: p.fechaReporte.toISOString().slice(0, 10),
        valorCartera: Number(p.valorCartera),
        plusvalia: Number(p.plusvalia),
        movimientosNetos: Number(p.movimientosNetos),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Select target position
    let target = allPositions[0]; // most recent
    if (fechaParam) {
      const found = allPositions.find((p) => p.fechaReporte.toISOString().slice(0, 10) === fechaParam);
      if (found) target = found;
    }

    const fechaReporte = target.fechaReporte.toISOString().slice(0, 10);

    // Rendimiento diario: compare with previous
    let rendimientoDiario: number | null = null;
    let tnaDiario: number | null = null;

    const idx = allPositions.findIndex((p) => p.fechaReporte.toISOString().slice(0, 10) === fechaReporte);
    if (idx >= 0 && idx < allPositions.length - 1) {
      const prev = allPositions[idx + 1]; // sorted desc
      const prevVal = Number(prev.valorCartera);
      if (prevVal > 0) {
        rendimientoDiario = ((Number(target.valorCartera) - prevVal) / prevVal) * 100;
        const daysBetween = Math.max(1, Math.round(
          (target.fechaReporte.getTime() - prev.fechaReporte.getTime()) / 86400000
        ));
        tnaDiario = (rendimientoDiario / daysBetween) * 365;
      }
    }

    // Supply for coverage
    const latestSupply = await prisma.supplySnapshot.findFirst({
      where: { asset: "wMXN" },
      orderBy: { snapshotAt: "desc" },
    });
    const supply = latestSupply ? Number(latestSupply.total) : null;

    // Capital invertido = valorCartera - plusvalía (the money actually placed)
    const firstPos = allPositions[allPositions.length - 1];
    const capitalInvertido = Number(firstPos.valorCartera) - Number(firstPos.plusvalia);

    // Earliest periodoInicio across all positions (true inception date)
    const earliestInception = allPositions
      .map((p) => p.periodoInicio.toISOString().slice(0, 10))
      .sort()[0];

    // Estimate current value using rendimientoAnual (compound daily)
    const valorCartera = Number(target.valorCartera);
    const rendAnual = target.rendimientoAnual ? Number(target.rendimientoAnual) / 100 : 0;
    const dailyRate = rendAnual > 0 ? Math.pow(1 + rendAnual, 1 / 365) - 1 : 0;
    const today = new Date().toISOString().slice(0, 10);
    const daysSinceReport = Math.max(0, Math.round(
      (new Date(today + "T00:00:00Z").getTime() - target.fechaReporte.getTime()) / 86400000
    ));
    const valorEstimadoHoy = daysSinceReport > 0 && dailyRate > 0
      ? valorCartera * Math.pow(1 + dailyRate, daysSinceReport)
      : valorCartera;

    return NextResponse.json({
      success: true,
      availableDates,
      totalsByDate,
      data: {
        fechaReporte,
        earliestInception,
        fondo: target.fondo,
        serie: target.serie,
        periodoInicio: target.periodoInicio.toISOString().slice(0, 10),
        periodoFin: target.periodoFin.toISOString().slice(0, 10),
        titulosInicio: target.titulosInicio,
        titulosCierre: target.titulosCierre,
        precioValuacion: Number(target.precioValuacion),
        valorCartera,
        valorEstimadoHoy,
        daysSinceReport,
        movimientosNetos: Number(target.movimientosNetos),
        plusvalia: Number(target.plusvalia),
        rendimientoAnual: target.rendimientoAnual ? Number(target.rendimientoAnual) : null,
        rendimientoMensual: target.rendimientoMensual ? Number(target.rendimientoMensual) : null,
        capitalInvertido,
        rendimientoDiario,
        tnaDiario,
        cobertura: {
          supply,
          colateral: valorEstimadoHoy,
          ratio: supply && supply > 0 ? (valorEstimadoHoy / supply) * 100 : null,
        },
      },
    });
  } catch (error) {
    console.error("[wMXN summary]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo resumen" },
      { status: 500 }
    );
  }
}
