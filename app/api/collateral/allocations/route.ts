// app/api/collateral/allocations/route.ts
// GET: listar allocations (query: asset, fecha YYYY-MM-DD). POST: crear (solo ADMIN).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { createAllocationSchema } from "@/lib/validations/collateral";
import { calculateAndSaveRendimiento } from "@/lib/db/rendimiento-calc";

const DEFAULT_ASSET = "wARS";

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
    const asset = searchParams.get("asset") ?? DEFAULT_ASSET;
    const fechaStr = searchParams.get("fecha"); // YYYY-MM-DD o null = todas

    // Siempre traer todas las fechas del asset para poder calcular rendimiento (ayer vs hoy)
    const allList = await prisma.collateralAllocation.findMany({
      where: { asset },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    });

    let list = allList;
    if (fechaStr) {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "Fecha inválida" },
          { status: 400 }
        );
      }
      const dateKey = d.toISOString().slice(0, 10);
      list = allList.filter((r) => r.fecha.toISOString().slice(0, 10) === dateKey);
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else {
      list = [...allList].sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Calcular rendimiento diario como (valor hoy - valor ayer) / valor ayer * 100
    const byTipoAndDate = new Map<string, number>();
    for (const r of allList) {
      const key = `${r.tipo}:${r.fecha.toISOString().slice(0, 10)}`;
      const val = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
      byTipoAndDate.set(key, val);
    }
    function getRendimientoDiario(
      tipo: string,
      fechaKey: string,
      valorTotal: number
    ): number | null {
      const prev = getPreviousDateKey(fechaKey);
      if (!prev) return null;
      const keyPrev = `${tipo}:${prev}`;
      const valorAyer = byTipoAndDate.get(keyPrev);
      if (valorAyer == null || valorAyer === 0) return null;
      return (valorTotal - valorAyer) / valorAyer * 100;
    }
    function getPreviousDateKey(dateKey: string): string | null {
      const d = new Date(dateKey + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    const data = list.map((r) => {
      const valorTotal = Number(r.cantidadCuotasPartes) * Number(r.valorCuotaparte);
      const fechaKey = r.fecha.toISOString().slice(0, 10);
      const computedRend = getRendimientoDiario(r.tipo, fechaKey, valorTotal);
      const rendimientoDiario =
        r.rendimientoDiario != null
          ? Number(r.rendimientoDiario)
          : computedRend;
      return {
        id: r.id,
        asset: r.asset,
        tipo: r.tipo,
        nombre: r.nombre,
        entidad: r.entidad,
        cantidadCuotasPartes: Number(r.cantidadCuotasPartes),
        valorCuotaparte: Number(r.valorCuotaparte),
        valorTotal,
        fecha: fechaKey,
        rendimientoDiario,
        activo: r.activo,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[collateral/allocations GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al listar" },
      { status: 500 }
    );
  }
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
    const role = session.user.role as "ADMIN" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo ADMIN puede crear allocations" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createAllocationSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join("; ");
      return NextResponse.json(
        { success: false, error: msg || "Datos inválidos" },
        { status: 400 }
      );
    }

    const p = parsed.data;
    const fecha = new Date(p.fecha);
    if (isNaN(fecha.getTime())) {
      return NextResponse.json(
        { success: false, error: "Fecha inválida" },
        { status: 400 }
      );
    }

    const created = await prisma.collateralAllocation.create({
      data: {
        asset: p.asset,
        tipo: p.tipo,
        nombre: p.nombre,
        entidad: p.entidad ?? undefined,
        cantidadCuotasPartes: p.cantidadCuotasPartes,
        valorCuotaparte: p.valorCuotaparte,
        fecha,
        activo: p.activo ?? true,
      },
    });

    // Recalcular rendimiento diario de la cartera para esta fecha
    try {
      await calculateAndSaveRendimiento(fecha);
    } catch (calcErr) {
      console.warn("[allocations POST] Error calculando rendimiento:", calcErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        asset: created.asset,
        tipo: created.tipo,
        nombre: created.nombre,
        entidad: created.entidad,
        cantidadCuotasPartes: Number(created.cantidadCuotasPartes),
        valorCuotaparte: Number(created.valorCuotaparte),
        valorTotal: Number(created.cantidadCuotasPartes) * Number(created.valorCuotaparte),
        fecha: created.fecha.toISOString().slice(0, 10),
        rendimientoDiario: created.rendimientoDiario != null ? Number(created.rendimientoDiario) : null,
        activo: created.activo,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[collateral/allocations POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al crear" },
      { status: 500 }
    );
  }
}
