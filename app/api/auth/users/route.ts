// app/api/auth/users/route.ts
// GET: listar usuarios (solo el email configurado en ADMIN_EMAIL). No expone password ni secretos.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";

export async function GET(): Promise<NextResponse> {
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
        { success: false, error: "Solo ADMIN puede listar usuarios" },
        { status: 403 }
      );
    }
    if (session.user.email?.toLowerCase() !== adminEmail) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para gestionar usuarios" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        totpEnabled: true,
        isActive: true,
        createdAt: true,
      },
    });

    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      totpEnabled: u.totpEnabled,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[auth/users GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar usuarios" },
      { status: 500 }
    );
  }
}
