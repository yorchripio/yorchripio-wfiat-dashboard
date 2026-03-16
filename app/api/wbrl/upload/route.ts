// app/api/wbrl/upload/route.ts
// POST: Recibe PDF de Renda Fixa y/o XLSX de Extrato, parsea y devuelve preview.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { parseRendaFixaPdf } from "@/lib/wbrl/parse-renda-fixa";
import { parseExtratoConta } from "@/lib/wbrl/parse-extrato";
import { prisma } from "@/lib/db";

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
        { success: false, error: "Solo TRADER o ADMIN puede subir archivos" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const rendaFixaFile = formData.get("rendaFixa") as File | null;
    const extratoFile = formData.get("extrato") as File | null;

    if (!rendaFixaFile && !extratoFile) {
      return NextResponse.json(
        { success: false, error: "Debe enviar al menos un archivo (PDF o XLSX)" },
        { status: 400 }
      );
    }

    let positions: Awaited<ReturnType<typeof parseRendaFixaPdf>> = [];
    let movimientos: ReturnType<typeof parseExtratoConta> = [];

    if (rendaFixaFile) {
      const uint8 = new Uint8Array(await rendaFixaFile.arrayBuffer());
      positions = await parseRendaFixaPdf(uint8);
    }

    if (extratoFile) {
      const buf = Buffer.from(await extratoFile.arrayBuffer());
      movimientos = parseExtratoConta(buf);
    }

    // Buscar posiciones existentes marcadas como colateral para sugerir flags
    const existingColateral = await prisma.wbrlCdbPosition.findMany({
      where: { esColateral: true },
      orderBy: { fechaPosicao: "desc" },
      take: 50,
    });

    // Heuristica: si una posicion tiene el mismo capitalInicial y fechaInicio
    // que una existente marcada como colateral, sugerirla como colateral
    const colateralKeys = new Set(
      existingColateral.map(
        (p) => `${Number(p.capitalInicial)}-${p.fechaInicio.toISOString().slice(0, 10)}`
      )
    );

    const positionsWithSuggestion = positions.map((p) => {
      const key = `${p.capitalInicial}-${p.fechaInicio}`;
      // Si ya hay posiciones existentes, matchear contra ellas
      // Si no hay existentes, usar heuristica: posiciones de enero 2026 son colateral
      let suggestedColateral = false;
      if (colateralKeys.size > 0) {
        suggestedColateral = colateralKeys.has(key);
      } else {
        // Primera vez: sugerir como colateral las que NO son las 2 grandes conocidas
        // (las de mar-2024 R$378k y may-2025 R$3.1M son no-colateral)
        const isLargeOld =
          (p.fechaInicio === "2024-03-14" && Math.abs(p.capitalInicial - 378046) < 1) ||
          (p.fechaInicio === "2025-05-29" && Math.abs(p.capitalInicial - 3114062) < 1);
        suggestedColateral = !isLargeOld;
      }

      return { ...p, esColateral: suggestedColateral };
    });

    return NextResponse.json({
      success: true,
      data: {
        positions: positionsWithSuggestion,
        movimientos,
        totalPositions: positions.length,
        totalMovimientos: movimientos.length,
        suggestedColateral: positionsWithSuggestion.filter((p) => p.esColateral).length,
        suggestedNoColateral: positionsWithSuggestion.filter((p) => !p.esColateral).length,
      },
    });
  } catch (error) {
    console.error("[wBRL upload]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error procesando archivos",
      },
      { status: 500 }
    );
  }
}
