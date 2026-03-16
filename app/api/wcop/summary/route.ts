// app/api/wcop/summary/route.ts
// GET: Resumen del colateral wCOP — snapshot actual, totalsByDate, rendimiento.

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

    const allSnapshots = await prisma.wcopAccountSnapshot.findMany({
      orderBy: { fechaCorte: "desc" },
    });

    const availableDates = allSnapshots.map((s) => s.fechaCorte.toISOString().slice(0, 10));

    if (allSnapshots.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        availableDates: [],
        totalsByDate: [],
        message: "No hay snapshots wCOP cargados",
      });
    }

    // totalsByDate for client-side period calculations
    const totalsByDate = allSnapshots
      .map((s) => ({
        fecha: s.fechaCorte.toISOString().slice(0, 10),
        saldoFinal: Number(s.saldoFinal),
        capitalWcop: Number(s.capitalWcop),
        rendimientos: Number(s.rendimientos),
        rendimientosAcum: 0, // will be computed below
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Compute cumulative rendimientos
    let acum = 0;
    for (const t of totalsByDate) {
      acum += t.rendimientos;
      t.rendimientosAcum = acum;
    }

    // Select target
    let target = allSnapshots[0];
    if (fechaParam) {
      const found = allSnapshots.find((s) => s.fechaCorte.toISOString().slice(0, 10) === fechaParam);
      if (found) target = found;
    }

    const fechaCorte = target.fechaCorte.toISOString().slice(0, 10);

    // Rendimiento diario
    let rendimientoDiario: number | null = null;
    let tnaDiario: number | null = null;

    const idx = allSnapshots.findIndex((s) => s.fechaCorte.toISOString().slice(0, 10) === fechaCorte);
    if (idx >= 0 && idx < allSnapshots.length - 1) {
      const prev = allSnapshots[idx + 1];
      const prevCap = Number(prev.capitalWcop);
      if (prevCap > 0) {
        rendimientoDiario = (Number(target.rendimientos) / prevCap) * 100;
        const daysBetween = Math.max(1, Math.round(
          (target.fechaCorte.getTime() - prev.fechaCorte.getTime()) / 86400000
        ));
        tnaDiario = (rendimientoDiario / daysBetween) * 365;
      }
    }

    // Supply
    const latestSupply = await prisma.supplySnapshot.findFirst({
      where: { asset: "wCOP" },
      orderBy: { snapshotAt: "desc" },
    });
    const supply = latestSupply ? Number(latestSupply.total) : null;

    // Earliest periodoInicio across all snapshots (true inception date)
    const earliestInception = allSnapshots
      .map((s) => s.periodoInicio.toISOString().slice(0, 10))
      .sort()[0];

    return NextResponse.json({
      success: true,
      availableDates,
      totalsByDate,
      data: {
        fechaCorte,
        earliestInception,
        periodoInicio: target.periodoInicio.toISOString().slice(0, 10),
        periodoFin: target.periodoFin.toISOString().slice(0, 10),
        saldoFinal: Number(target.saldoFinal),
        capitalWcop: Number(target.capitalWcop),
        rendimientos: Number(target.rendimientos),
        retirosMM: Number(target.retirosMM),
        depositosMM: Number(target.depositosMM),
        impuestos: Number(target.impuestos),
        rendimientoDiario,
        tnaDiario,
        cobertura: {
          supply,
          // Colateral = capital WCOP (Coopcentral transfers) + rendimientos proporcionales
          colateral: Number(target.capitalWcop) + Number(target.rendimientos),
          ratio: supply && supply > 0 ? ((Number(target.capitalWcop) + Number(target.rendimientos)) / supply) * 100 : null,
        },
      },
    });
  } catch (error) {
    console.error("[wCOP summary]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo resumen" },
      { status: 500 }
    );
  }
}
