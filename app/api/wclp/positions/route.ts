// app/api/wclp/positions/route.ts
// GET: Lista snapshots guardados de wCLP.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const snapshots = await prisma.wclpAccountSnapshot.findMany({
      orderBy: { fechaCorte: "desc" },
      take: 24,
    });

    return NextResponse.json({
      success: true,
      data: snapshots.map((s) => ({
        id: s.id,
        fechaCorte: s.fechaCorte.toISOString().slice(0, 10),
        saldoFinal: Number(s.saldoFinal),
        totalAbonos: Number(s.totalAbonos),
        totalCargos: Number(s.totalCargos),
      })),
    });
  } catch (error) {
    console.error("[wCLP positions]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo snapshots" },
      { status: 500 }
    );
  }
}
