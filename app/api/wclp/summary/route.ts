// app/api/wclp/summary/route.ts
// GET: Balance wCLP desde BCI (DB snapshot) + supply coverage.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Latest BCI snapshot from DB
    const bciSnapshot = await prisma.wclpAccountSnapshot.findFirst({
      orderBy: { fechaCorte: "desc" },
    });

    const amount = bciSnapshot ? Number(bciSnapshot.saldoFinal) : 0;
    const fechaCorte = bciSnapshot ? bciSnapshot.fechaCorte.toISOString().slice(0, 10) : null;

    // Supply for coverage
    const latestSupply = await prisma.supplySnapshot.findFirst({
      where: { asset: "wCLP" },
      orderBy: { snapshotAt: "desc" },
    });
    const supply = latestSupply ? Number(latestSupply.total) : null;

    return NextResponse.json({
      success: true,
      data: {
        currency: "CLP",
        amount,
        fechaCorte,
        entidad: "BCI",
        rendimiento: 0,
        cobertura: {
          supply,
          colateral: amount,
          ratio: supply && supply > 0 ? (amount / supply) * 100 : null,
        },
      },
    });
  } catch (error) {
    console.error("[wCLP summary]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo balance wCLP" },
      { status: 500 }
    );
  }
}
