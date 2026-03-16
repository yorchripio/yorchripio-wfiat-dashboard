// app/api/wcop/positions/route.ts
// GET: Devuelve todos los snapshots wCOP guardados.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const snapshots = await prisma.wcopAccountSnapshot.findMany({
      orderBy: { fechaCorte: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: snapshots.map((s) => ({
        id: s.id,
        fechaCorte: s.fechaCorte.toISOString().slice(0, 10),
        periodoInicio: s.periodoInicio.toISOString().slice(0, 10),
        periodoFin: s.periodoFin.toISOString().slice(0, 10),
        saldoFinal: Number(s.saldoFinal),
        capitalWcop: Number(s.capitalWcop),
        rendimientos: Number(s.rendimientos),
        retirosMM: Number(s.retirosMM),
        depositosMM: Number(s.depositosMM),
        impuestos: Number(s.impuestos),
      })),
    });
  } catch (error) {
    console.error("[wCOP positions]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}
