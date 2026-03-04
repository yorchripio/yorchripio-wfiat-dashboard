// app/api/auth/users/route.ts
// GET: listar usuarios (solo admin@ripio.com). No expone password ni secretos.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";

const ADMIN_EMAIL = "admin@ripio.com";

export async function GET(): Promise<NextResponse> {
  try {
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
    if (session.user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json(
        { success: false, error: "Solo el perfil admin@ripio.com puede gestionar usuarios" },
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
