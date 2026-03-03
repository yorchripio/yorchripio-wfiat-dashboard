// app/api/auth/2fa/status/route.ts
// GET: indica si el usuario tiene 2FA activado (para mostrar/ocultar setup en Configuración)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { totpEnabled: true },
    });
    return NextResponse.json({
      success: true,
      enabled: user?.totpEnabled ?? false,
    });
  } catch (e) {
    console.error("[2fa status]", e);
    return NextResponse.json(
      { success: false, error: "Error al consultar estado" },
      { status: 500 }
    );
  }
}
