// app/api/wbrl/positions/route.ts
// GET: Devuelve posiciones CDB guardadas con filtros.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get("fecha"); // YYYY-MM-DD
    const soloColateral = searchParams.get("colateral"); // "true" / "false"

    const where: Record<string, unknown> = {};

    if (fecha) {
      where.fechaPosicao = new Date(fecha + "T00:00:00Z");
    }
    if (soloColateral === "true") {
      where.esColateral = true;
    } else if (soloColateral === "false") {
      where.esColateral = false;
    }

    const positions = await prisma.wbrlCdbPosition.findMany({
      where,
      orderBy: [{ fechaPosicao: "desc" }, { esColateral: "desc" }, { capitalInicial: "desc" }],
    });

    // Agrupar por fechaPosicao
    const fechas = [...new Set(positions.map((p) => p.fechaPosicao.toISOString().slice(0, 10)))];
    const byFecha = fechas.map((f) => {
      const grupo = positions.filter((p) => p.fechaPosicao.toISOString().slice(0, 10) === f);
      const colateral = grupo.filter((p) => p.esColateral);
      const noColateral = grupo.filter((p) => !p.esColateral);
      return {
        fecha: f,
        colateral: {
          count: colateral.length,
          capitalInicial: colateral.reduce((s, p) => s + Number(p.capitalInicial), 0),
          valorBruto: colateral.reduce((s, p) => s + Number(p.valorBruto), 0),
          valorLiquido: colateral.reduce((s, p) => s + Number(p.valorLiquido), 0),
          ir: colateral.reduce((s, p) => s + Number(p.ir), 0),
        },
        noColateral: {
          count: noColateral.length,
          capitalInicial: noColateral.reduce((s, p) => s + Number(p.capitalInicial), 0),
          valorBruto: noColateral.reduce((s, p) => s + Number(p.valorBruto), 0),
          valorLiquido: noColateral.reduce((s, p) => s + Number(p.valorLiquido), 0),
          ir: noColateral.reduce((s, p) => s + Number(p.ir), 0),
        },
        positions: grupo.map((p) => ({
          id: p.id,
          fechaPosicao: p.fechaPosicao.toISOString().slice(0, 10),
          fechaInicio: p.fechaInicio.toISOString().slice(0, 10),
          fechaVencimento: p.fechaVencimento.toISOString().slice(0, 10),
          capitalInicial: Number(p.capitalInicial),
          valorBruto: Number(p.valorBruto),
          valorLiquido: Number(p.valorLiquido),
          ir: Number(p.ir),
          indexador: p.indexador,
          pctIndexador: Number(p.pctIndexador),
          emisor: p.emisor,
          esColateral: p.esColateral,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: byFecha,
      totalFechas: fechas.length,
    });
  } catch (error) {
    console.error("[wBRL positions]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error obteniendo posiciones",
      },
      { status: 500 }
    );
  }
}
