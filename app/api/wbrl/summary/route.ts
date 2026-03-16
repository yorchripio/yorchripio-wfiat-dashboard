// app/api/wbrl/summary/route.ts
// GET: Resumen completo del colateral wBRL (posiciones, rendimiento, cobertura).
// Soporta ?fecha=YYYY-MM-DD para ver un reporte de fecha específica.
// Soporta ?fechaInicio=YYYY-MM-DD para definir inicio del periodo de rendimiento.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcularRendimientoWbrl } from "@/lib/wbrl/rendimiento";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const fechaParam = request.nextUrl.searchParams.get("fecha"); // YYYY-MM-DD
    const fechaInicioParam = request.nextUrl.searchParams.get("fechaInicio"); // YYYY-MM-DD

    // Obtener todas las fechas de reporte disponibles (distintas)
    const allDates = await prisma.wbrlCdbPosition.findMany({
      distinct: ["fechaPosicao"],
      orderBy: { fechaPosicao: "desc" },
      select: { fechaPosicao: true },
    });

    const availableDates = allDates.map((d) => d.fechaPosicao.toISOString().slice(0, 10));

    if (availableDates.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        availableDates: [],
        totalsByDate: [],
        message: "No hay posiciones wBRL cargadas",
      });
    }

    // Totales por fecha (para calcular rendimiento real de cada período en el client)
    const allPositions = await prisma.wbrlCdbPosition.findMany({
      where: { esColateral: true },
      select: { fechaPosicao: true, capitalInicial: true, valorBruto: true, valorLiquido: true, ir: true },
      orderBy: { fechaPosicao: "asc" },
    });
    const totalsMap = new Map<string, { capitalInicial: number; valorBruto: number; valorLiquido: number; ir: number }>();
    for (const p of allPositions) {
      const key = p.fechaPosicao.toISOString().slice(0, 10);
      const existing = totalsMap.get(key);
      if (existing) {
        existing.capitalInicial += Number(p.capitalInicial);
        existing.valorBruto += Number(p.valorBruto);
        existing.valorLiquido += Number(p.valorLiquido);
        existing.ir += Number(p.ir);
      } else {
        totalsMap.set(key, {
          capitalInicial: Number(p.capitalInicial),
          valorBruto: Number(p.valorBruto),
          valorLiquido: Number(p.valorLiquido),
          ir: Number(p.ir),
        });
      }
    }
    const totalsByDate = Array.from(totalsMap.entries())
      .map(([fecha, t]) => ({ fecha, ...t }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Determinar la fecha del reporte
    let targetDateStr: string;
    if (fechaParam && availableDates.includes(fechaParam)) {
      targetDateStr = fechaParam;
    } else {
      targetDateStr = availableDates[0]; // más reciente
    }

    const targetDate = new Date(targetDateStr + "T12:00:00Z");

    // Obtener posiciones de la fecha seleccionada
    const positions = await prisma.wbrlCdbPosition.findMany({
      where: { fechaPosicao: targetDate },
      orderBy: [{ esColateral: "desc" }, { capitalInicial: "desc" }],
    });

    const colateral = positions.filter((p) => p.esColateral);
    const noColateral = positions.filter((p) => !p.esColateral);

    // Fecha inicio del periodo (default: YTD)
    const fechaInicio = fechaInicioParam || `${new Date().getUTCFullYear()}-01-01`;

    // Calcular rendimiento del periodo
    const rendimiento = calcularRendimientoWbrl(
      positions.map((p) => ({
        capitalInicial: Number(p.capitalInicial),
        valorBruto: Number(p.valorBruto),
        valorLiquido: Number(p.valorLiquido),
        ir: Number(p.ir),
        esColateral: p.esColateral,
      })),
      fechaInicio,
      targetDateStr
    );

    // Calcular rendimiento diario: comparar con fecha anterior
    let rendimientoDiario: number | null = null;
    let tnaDiario: number | null = null;

    const currentIdx = availableDates.indexOf(targetDateStr);
    if (currentIdx >= 0 && currentIdx < availableDates.length - 1) {
      const prevDateStr = availableDates[currentIdx + 1]; // sorted desc, so +1 = previous
      const prevDate = new Date(prevDateStr + "T12:00:00Z");

      const prevPositions = await prisma.wbrlCdbPosition.findMany({
        where: { fechaPosicao: prevDate, esColateral: true },
      });

      const prevBruto = prevPositions.reduce((s, p) => s + Number(p.valorBruto), 0);
      const currBruto = colateral.reduce((s, p) => s + Number(p.valorBruto), 0);

      if (prevBruto > 0) {
        rendimientoDiario = ((currBruto - prevBruto) / prevBruto) * 100;
        // Días entre reportes para anualizar correctamente
        const daysBetween = Math.max(1, Math.round(
          (targetDate.getTime() - prevDate.getTime()) / 86400000
        ));
        tnaDiario = (rendimientoDiario / daysBetween) * 365;
      }
    }

    // Supply de wBRL
    const latestSupply = await prisma.supplySnapshot.findFirst({
      where: { asset: "wBRL" },
      orderBy: { snapshotAt: "desc" },
    });
    const supply = latestSupply ? Number(latestSupply.total) : null;

    // Cobertura
    const coberturaBruto = supply && supply > 0 ? (rendimiento.valorBruto / supply) * 100 : null;
    const coberturaLiquido = supply && supply > 0 ? (rendimiento.valorLiquido / supply) * 100 : null;

    return NextResponse.json({
      success: true,
      availableDates,
      totalsByDate,
      data: {
        fechaReporte: targetDateStr,
        estructura: {
          emisor: colateral[0]?.emisor ?? "BANCO GENIAL S.A.",
          instrumento: `CDB - ${colateral[0]?.pctIndexador ?? 99}% CDI CETIP`,
          indexador: colateral[0]?.indexador ?? "CDICETIP",
          cantidadPosiciones: colateral.length,
        },
        colateral: {
          positions: colateral.map((p) => ({
            id: p.id,
            fechaInicio: p.fechaInicio.toISOString().slice(0, 10),
            fechaVencimento: p.fechaVencimento.toISOString().slice(0, 10),
            capitalInicial: Number(p.capitalInicial),
            valorBruto: Number(p.valorBruto),
            valorLiquido: Number(p.valorLiquido),
            ir: Number(p.ir),
          })),
          totales: {
            capitalInicial: rendimiento.capitalInicial,
            valorBruto: rendimiento.valorBruto,
            valorLiquido: rendimiento.valorLiquido,
            ir: rendimiento.ir,
          },
        },
        noColateral: {
          count: noColateral.length,
          capitalInicial: noColateral.reduce((s, p) => s + Number(p.capitalInicial), 0),
          valorBruto: noColateral.reduce((s, p) => s + Number(p.valorBruto), 0),
          valorLiquido: noColateral.reduce((s, p) => s + Number(p.valorLiquido), 0),
          ir: noColateral.reduce((s, p) => s + Number(p.ir), 0),
        },
        rendimiento: {
          gananciaBruta: rendimiento.gananciaBruta,
          ir: rendimiento.ir,
          gananciaLiquida: rendimiento.gananciaLiquida,
          pctPeriodoBruto: rendimiento.pctPeriodoBruto,
          pctPeriodoLiquido: rendimiento.pctPeriodoLiquido,
          tnaBruto: rendimiento.tnaBruto,
          tnaLiquido: rendimiento.tnaLiquido,
          teaBruto: rendimiento.teaBruto,
          teaLiquido: rendimiento.teaLiquido,
          diasPeriodo: rendimiento.diasPeriodo,
          fechaInicio: rendimiento.fechaInicio,
          fechaFin: rendimiento.fechaFin,
        },
        rendimientoDiario,
        tnaDiario,
        cobertura: {
          wbrlCirculante: supply,
          colateralBruto: rendimiento.valorBruto,
          colateralLiquido: rendimiento.valorLiquido,
          coberturaBruto,
          coberturaLiquido,
          sobreColateral: supply ? rendimiento.valorBruto - supply : null,
        },
      },
    });
  } catch (error) {
    console.error("[wBRL summary]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error obteniendo resumen",
      },
      { status: 500 }
    );
  }
}
