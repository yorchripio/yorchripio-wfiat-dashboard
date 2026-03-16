// app/api/wcop/confirm/route.ts
// POST: Guarda el snapshot wCOP confirmado por el usuario.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

interface SnapshotInput {
  periodoInicio: string;
  periodoFin: string;
  saldoFinal: number;
  capitalWcop: number;
  rendimientos: number;
  retirosMM: number;
  depositosMM: number;
  impuestos: number;
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
    await prisma.wcopAccountSnapshot.deleteMany({ where: { fechaCorte } });

    const created = await prisma.wcopAccountSnapshot.create({
      data: {
        fechaCorte,
        periodoInicio: new Date(snap.periodoInicio + "T00:00:00Z"),
        periodoFin: new Date(snap.periodoFin + "T00:00:00Z"),
        saldoFinal: snap.saldoFinal,
        capitalWcop: snap.capitalWcop,
        rendimientos: snap.rendimientos,
        retirosMM: snap.retirosMM,
        depositosMM: snap.depositosMM,
        impuestos: snap.impuestos,
      },
    });

    // Calculate and save rendimiento in RendimientoHistorico
    const prevSnapshot = await prisma.wcopAccountSnapshot.findFirst({
      where: { fechaCorte: { lt: fechaCorte } },
      orderBy: { fechaCorte: "desc" },
    });

    if (prevSnapshot && Number(prevSnapshot.capitalWcop) > 0) {
      // Period return based on rendimientos vs capital
      const rendPeriodo = (snap.rendimientos / Number(prevSnapshot.capitalWcop)) * 100;
      await prisma.rendimientoHistorico.upsert({
        where: { asset_fecha: { asset: "wCOP", fecha: fechaCorte } },
        update: { rendimiento: rendPeriodo },
        create: { asset: "wCOP", fecha: fechaCorte, rendimiento: rendPeriodo },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        fechaCorte: snap.periodoFin,
        saldoFinal: snap.saldoFinal,
        capitalWcop: snap.capitalWcop,
        rendimientos: snap.rendimientos,
      },
    });
  } catch (error) {
    console.error("[wCOP confirm]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error guardando datos" },
      { status: 500 }
    );
  }
}
