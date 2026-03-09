// app/api/auth/users/[id]/route.ts
// PATCH: actualizar rol del usuario (solo el email configurado en ADMIN_EMAIL). Body: { role: "VIEWER" | "TRADER" }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!adminEmail) {
      return NextResponse.json(
        { success: false, error: "Error de configuración del servidor" },
        { status: 503 }
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "TRADER" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo ADMIN puede editar usuarios" },
        { status: 403 }
      );
    }
    if (session.user.email?.toLowerCase() !== adminEmail) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para gestionar usuarios" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const newRole = body.role === "TRADER" ? "TRADER" : "VIEWER";

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }
    if (user.role === "ADMIN") {
      return NextResponse.json(
        { success: false, error: "No se puede cambiar el rol de un ADMIN" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { role: newRole },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth/users PATCH]", e);
    return NextResponse.json(
      { success: false, error: "Error al actualizar usuario" },
      { status: 500 }
    );
  }
}
