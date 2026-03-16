// app/api/wmxn/upload/route.ts
// POST: Recibe PDF "Estado Cuenta Fondos de Inversión" de Banregio, parsea y devuelve preview.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { parseEstadoCuentaPdf } from "@/lib/wmxn/parse-estado-cuenta";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!hasMinRole(session.user.role as "ADMIN" | "TRADER" | "VIEWER", "TRADER")) {
      return NextResponse.json({ success: false, error: "Solo TRADER o ADMIN" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("estadoCuenta") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "Debe enviar el PDF del estado de cuenta" }, { status: 400 });
    }

    const uint8 = new Uint8Array(await file.arrayBuffer());
    const position = await parseEstadoCuentaPdf(uint8);

    return NextResponse.json({
      success: true,
      data: { position },
    });
  } catch (error) {
    console.error("[wMXN upload]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error procesando PDF" },
      { status: 500 }
    );
  }
}
