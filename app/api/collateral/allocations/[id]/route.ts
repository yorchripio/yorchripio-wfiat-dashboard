// app/api/collateral/allocations/[id]/route.ts
// PATCH: actualizar allocation. DELETE: eliminar. Solo ADMIN.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { updateAllocationSchema } from "@/lib/validations/collateral";

async function requireAdmin(): Promise<NextResponse | null> {
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
      { success: false, error: "Solo ADMIN puede modificar allocations" },
      { status: 403 }
    );
  }
  return null;
}

function toResponse(r: {
  id: string;
  asset: string;
  tipo: string;
  nombre: string;
  entidad: string | null;
  cantidadCuotasPartes: { toString(): string };
  valorCuotaparte: { toString(): string };
  fecha: Date;
  rendimientoDiario: { toString(): string } | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}): object {
  const q = Number(r.cantidadCuotasPartes.toString());
  const v = Number(r.valorCuotaparte.toString());
  return {
    id: r.id,
    asset: r.asset,
    tipo: r.tipo,
    nombre: r.nombre,
    entidad: r.entidad,
    cantidadCuotasPartes: q,
    valorCuotaparte: v,
    valorTotal: q * v,
    fecha: r.fecha.toISOString().slice(0, 10),
    rendimientoDiario: r.rendimientoDiario != null ? Number(r.rendimientoDiario.toString()) : null,
    activo: r.activo,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateAllocationSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join("; ");
      return NextResponse.json(
        { success: false, error: msg || "Datos inválidos" },
        { status: 400 }
      );
    }

    const p = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (p.asset != null) updateData.asset = p.asset;
    if (p.tipo != null) updateData.tipo = p.tipo;
    if (p.nombre != null) updateData.nombre = p.nombre;
    if (p.entidad !== undefined) updateData.entidad = p.entidad ?? null;
    if (p.cantidadCuotasPartes != null) updateData.cantidadCuotasPartes = p.cantidadCuotasPartes;
    if (p.valorCuotaparte != null) updateData.valorCuotaparte = p.valorCuotaparte;
    if (p.fecha != null) {
      const d = new Date(p.fecha);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ success: false, error: "Fecha inválida" }, { status: 400 });
      }
      updateData.fecha = d;
    }
    if (p.rendimientoDiario !== undefined) updateData.rendimientoDiario = p.rendimientoDiario ?? null;
    if (p.activo !== undefined) updateData.activo = p.activo;

    const updated = await prisma.collateralAllocation.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ success: true, data: toResponse(updated) });
  } catch (e) {
    console.error("[collateral/allocations PATCH]", e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Allocation no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al actualizar" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const { id } = await params;
    await prisma.collateralAllocation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[collateral/allocations DELETE]", e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Allocation no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al eliminar" },
      { status: 500 }
    );
  }
}
