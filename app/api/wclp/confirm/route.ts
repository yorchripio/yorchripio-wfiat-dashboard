// app/api/wclp/confirm/route.ts
// POST: Guarda el snapshot wCLP confirmado por el usuario.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

interface SnapshotInput {
  periodoInicio: string;
  periodoFin: string;
  saldoFinal: number;
  totalAbonos: number;
  totalCargos: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!hasMinRole(session.user.role as "ADMIN" | "TRADER" | "VIEWER", "TRADER")) {
      return NextResponse.json({ success: false, error: "Solo TRADER o ADMIN" }, { status: 403 });
    }

    const body = await request.json();
    const snap: SnapshotInput = body.snapshot;
    if (!snap || !snap.periodoFin) {
      return NextResponse.json({ success: false, error: "Datos de snapshot incompletos" }, { status: 400 });
    }

    const fechaCorte = new Date(snap.periodoFin + "T00:00:00Z");

    // Replace existing snapshot for same fechaCorte
    await prisma.wclpAccountSnapshot.deleteMany({ where: { fechaCorte } });

    const created = await prisma.wclpAccountSnapshot.create({
      data: {
        fechaCorte,
        periodoInicio: new Date(snap.periodoInicio + "T00:00:00Z"),
        periodoFin: new Date(snap.periodoFin + "T00:00:00Z"),
        saldoFinal: snap.saldoFinal,
        totalAbonos: snap.totalAbonos,
        totalCargos: snap.totalCargos,
      },
    });

    // Rendimiento for wCLP = 0% (cuenta corriente, no interest)
    await prisma.rendimientoHistorico.upsert({
      where: { asset_fecha: { asset: "wCLP", fecha: fechaCorte } },
      update: { rendimiento: 0 },
      create: { asset: "wCLP", fecha: fechaCorte, rendimiento: 0 },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        fechaCorte: snap.periodoFin,
        saldoFinal: snap.saldoFinal,
        totalAbonos: snap.totalAbonos,
        totalCargos: snap.totalCargos,
      },
    });
  } catch (error) {
    console.error("[wCLP confirm]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error guardando datos" },
      { status: 500 }
    );
  }
}
