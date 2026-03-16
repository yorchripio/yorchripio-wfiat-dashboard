// app/api/wbrl/confirm/route.ts
// POST: Guarda las posiciones CDB y movimientos confirmados por el usuario.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

interface PositionInput {
  fechaPosicao: string;
  fechaInicio: string;
  fechaVencimento: string;
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
  indexador: string;
  pctIndexador: number;
  emisor: string;
  esColateral: boolean;
}

interface MovimientoInput {
  fecha: string;
  descripcion: string;
  valor: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "TRADER" | "VIEWER";
    if (!hasMinRole(role, "TRADER")) {
      return NextResponse.json(
        { success: false, error: "Solo TRADER o ADMIN puede confirmar posiciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const positions: PositionInput[] = body.positions ?? [];
    const movimientos: MovimientoInput[] = body.movimientos ?? [];

    if (positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay posiciones para guardar" },
        { status: 400 }
      );
    }

    // Borrar posiciones anteriores con la misma fechaPosicao (reemplazo completo)
    const fechaPosicao = positions[0].fechaPosicao;
    const fechaPosicaoDate = new Date(fechaPosicao + "T00:00:00Z");

    await prisma.wbrlCdbPosition.deleteMany({
      where: { fechaPosicao: fechaPosicaoDate },
    });

    // Crear las nuevas posiciones
    const created = await prisma.wbrlCdbPosition.createMany({
      data: positions.map((p) => ({
        fechaPosicao: new Date(p.fechaPosicao + "T00:00:00Z"),
        fechaInicio: new Date(p.fechaInicio + "T00:00:00Z"),
        fechaVencimento: new Date(p.fechaVencimento + "T00:00:00Z"),
        capitalInicial: p.capitalInicial,
        valorBruto: p.valorBruto,
        valorLiquido: p.valorLiquido,
        ir: p.ir,
        indexador: p.indexador || "CDICETIP",
        pctIndexador: p.pctIndexador || 99.0,
        emisor: p.emisor || "BANCO GENIAL S.A.",
        esColateral: p.esColateral,
      })),
    });

    // Guardar movimientos del extracto (si hay)
    if (movimientos.length > 0) {
      // Borrar movimientos existentes para las mismas fechas
      const fechas = [...new Set(movimientos.map((m) => m.fecha))];
      await prisma.wbrlExtrato.deleteMany({
        where: {
          fecha: { in: fechas.map((f) => new Date(f + "T00:00:00Z")) },
        },
      });

      await prisma.wbrlExtrato.createMany({
        data: movimientos.map((m) => ({
          fecha: new Date(m.fecha + "T00:00:00Z"),
          descripcion: m.descripcion,
          valor: m.valor,
        })),
      });
    }

    // Calcular y guardar rendimiento diario en RendimientoHistorico
    const colateralPositions = positions.filter((p) => p.esColateral);
    const totalBruto = colateralPositions.reduce((s, p) => s + p.valorBruto, 0);
    const capitalInicial = colateralPositions.reduce((s, p) => s + p.capitalInicial, 0);

    if (capitalInicial > 0) {
      // Buscar el reporte anterior para calcular rendimiento diario
      const prevReport = await prisma.wbrlCdbPosition.findFirst({
        where: {
          esColateral: true,
          fechaPosicao: { lt: fechaPosicaoDate },
        },
        orderBy: { fechaPosicao: "desc" },
        select: { fechaPosicao: true },
      });

      if (prevReport) {
        const prevPositions = await prisma.wbrlCdbPosition.findMany({
          where: {
            esColateral: true,
            fechaPosicao: prevReport.fechaPosicao,
          },
        });
        const prevBruto = prevPositions.reduce((s, p) => s + Number(p.valorBruto), 0);

        if (prevBruto > 0) {
          const rendDiario = ((totalBruto - prevBruto) / prevBruto) * 100;
          await prisma.rendimientoHistorico.upsert({
            where: {
              asset_fecha: { asset: "wBRL", fecha: fechaPosicaoDate },
            },
            update: { rendimiento: rendDiario },
            create: {
              asset: "wBRL",
              fecha: fechaPosicaoDate,
              rendimiento: rendDiario,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        positionsCreated: created.count,
        movimientosCreated: movimientos.length,
        fechaPosicao,
        colateral: colateralPositions.length,
        noColateral: positions.length - colateralPositions.length,
      },
    });
  } catch (error) {
    console.error("[wBRL confirm]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error guardando datos",
      },
      { status: 500 }
    );
  }
}
