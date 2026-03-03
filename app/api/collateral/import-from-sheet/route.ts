// app/api/collateral/import-from-sheet/route.ts
// POST: importar todo el colateral del Google Sheet a la DB (solo ADMIN).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { getAllCollateralFromSheet } from "@/lib/sheets/collateral";

const DEFAULT_ASSET = "wARS";

export async function POST(): Promise<NextResponse> {
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
        { success: false, error: "Solo ADMIN puede importar desde el sheet" },
        { status: 403 }
      );
    }

    const rows = await getAllCollateralFromSheet();
    let created = 0;
    let updated = 0;

    for (const { fecha, instrumentos } of rows) {
      for (const inst of instrumentos) {
        const cantidadCuotasPartes = inst.cantidadCuotasPartes ?? 1;
        const valorCuotaparte = inst.valorCuotaparte ?? inst.valorTotal;
        const existing = await prisma.collateralAllocation.findFirst({
          where: {
            asset: DEFAULT_ASSET,
            tipo: inst.tipo,
            fecha,
          },
        });
        if (existing) {
          await prisma.collateralAllocation.update({
            where: { id: existing.id },
            data: {
              cantidadCuotasPartes,
              valorCuotaparte,
              nombre: inst.nombre,
              entidad: inst.entidad,
            },
          });
          updated++;
        } else {
          await prisma.collateralAllocation.create({
            data: {
              asset: DEFAULT_ASSET,
              tipo: inst.tipo,
              nombre: inst.nombre,
              entidad: inst.entidad,
              cantidadCuotasPartes,
              valorCuotaparte,
              fecha,
              activo: true,
            },
          });
          created++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        rowsFromSheet: rows.length,
        created,
        updated,
        message: `Importado: ${rows.length} fechas, ${created} creados, ${updated} actualizados. El rendimiento diario se calcula automáticamente (diferencia % vs día anterior).`,
      },
    });
  } catch (e) {
    console.error("[collateral/import-from-sheet]", e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Error al importar desde el sheet",
      },
      { status: 500 }
    );
  }
}
