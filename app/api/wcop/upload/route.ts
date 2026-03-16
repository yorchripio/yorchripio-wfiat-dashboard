// app/api/wcop/upload/route.ts
// POST: Recibe CSV extracto de Finandina, parsea y devuelve preview.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { parseFinandinaCsv } from "@/lib/wcop/parse-finandina";

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
      return NextResponse.json({ success: false, error: "Debe enviar el CSV de Finandina" }, { status: 400 });
    }

    const text = await file.text();
    const summary = parseFinandinaCsv(text);

    return NextResponse.json({
      success: true,
      data: {
        snapshot: {
          periodoInicio: summary.periodoInicio,
          periodoFin: summary.periodoFin,
          saldoFinal: summary.saldoFinal,
          capitalWcop: summary.capitalWcop,
          rendimientos: summary.rendimientos,
          rendimientosTotalCuenta: summary.rendimientosTotalCuenta,
          retirosMM: summary.retirosMM,
          depositosMM: summary.depositosMM,
          impuestos: summary.impuestos,
          diasPeriodo: summary.diasPeriodo,
          tna: summary.tna,
          tea: summary.tea,
        },
        monthlyBreakdown: summary.monthlyBreakdown,
        transactions: summary.transactions,
        totalTransactions: summary.transactions.length,
      },
    });
  } catch (error) {
    console.error("[wCOP upload]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error procesando CSV" },
      { status: 500 }
    );
  }
}
