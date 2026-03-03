import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const configs = await prisma.instrumentoConfig.findMany({
      orderBy: { tipo: "asc" },
    });
    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    console.error("[API /instrumentos GET]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error al cargar" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
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
      { success: false, error: error instanceof Error ? error.message : "Error al actualizar" },
      { status: 500 }
    );
  }
}
