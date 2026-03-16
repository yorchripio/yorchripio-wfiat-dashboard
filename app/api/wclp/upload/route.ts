// app/api/wclp/upload/route.ts
// POST: Recibe XLSX extracto BCI, parsea y devuelve preview.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { parseBciExtracto } from "@/lib/wclp/parse-bci";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!hasMinRole(session.user.role as "ADMIN" | "TRADER" | "VIEWER", "TRADER")) {
      return NextResponse.json({ success: false, error: "Solo TRADER o ADMIN" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("extracto") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "Debe enviar el XLSX extracto BCI" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const summary = parseBciExtracto(buffer);

    return NextResponse.json({
      success: true,
      data: {
        snapshot: {
          periodoInicio: summary.periodoInicio,
          periodoFin: summary.periodoFin,
          saldoFinal: summary.saldoFinal,
          totalAbonos: summary.totalAbonos,
          totalCargos: summary.totalCargos,
        },
        transactions: summary.transactions,
        totalTransactions: summary.transactions.length,
      },
    });
  } catch (error) {
    console.error("[wCLP upload]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error procesando XLSX" },
      { status: 500 }
    );
  }
}
