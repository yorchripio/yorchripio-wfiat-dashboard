import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRendimientoFromSheet } from "@/lib/sheets/rendimiento-import";

const DEFAULT_ASSET = "wARS";

export async function POST(): Promise<NextResponse> {
  try {
    const sheetData = await getRendimientoFromSheet();

    let created = 0;
    let updated = 0;

    for (const { fecha, rendimiento } of sheetData) {
      const existing = await prisma.rendimientoHistorico.findUnique({
        where: { asset_fecha: { asset: DEFAULT_ASSET, fecha } },
      });

      if (existing) {
        if (Number(existing.rendimiento) !== rendimiento) {
          await prisma.rendimientoHistorico.update({
            where: { id: existing.id },
            data: { rendimiento },
          });
          updated++;
        }
      } else {
        await prisma.rendimientoHistorico.create({
          data: { asset: DEFAULT_ASSET, fecha, rendimiento },
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalFromSheet: sheetData.length,
        created,
        updated,
        message: `Importado: ${sheetData.length} fechas, ${created} creados, ${updated} actualizados.`,
      },
    });
  } catch (e) {
    console.error("[rendimiento/import-from-sheet]", e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Error al importar rendimiento desde el sheet",
      },
      { status: 500 }
    );
  }
}
