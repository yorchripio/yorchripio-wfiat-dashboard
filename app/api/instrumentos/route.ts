import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasMinRole, type Role } from "@/lib/auth-helpers";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const configs = await prisma.instrumentoConfig.findMany({
      orderBy: { tipo: "asc" },
    });
    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    console.error("[API /instrumentos GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar instrumentos" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const role = (session.user.role as Role) ?? "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("id" in body) ||
      typeof (body as Record<string, unknown>).id !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "Se requiere id" },
        { status: 400 }
      );
    }

    const { id, generaRendimiento, label } = body as {
      id: string;
      generaRendimiento?: boolean;
      label?: string;
    };

    const updateData: Record<string, unknown> = {};
    if (typeof generaRendimiento === "boolean") updateData.generaRendimiento = generaRendimiento;
    if (typeof label === "string" && label.trim()) updateData.label = label.trim();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nada que actualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.instrumentoConfig.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[API /instrumentos PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar instrumento" },
      { status: 500 }
    );
  }
}
