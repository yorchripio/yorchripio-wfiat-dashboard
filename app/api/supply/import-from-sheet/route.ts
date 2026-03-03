// app/api/supply/import-from-sheet/route.ts
// Importa supply histórico de wARS desde "Balance wARS" del Sheet a supply_snapshots.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSupplyHistoricoFromSheet } from "@/lib/sheets/supply-import";

const ASSET = "wARS";

export async function POST(): Promise<NextResponse> {
  try {
    const puntos = await getSupplyHistoricoFromSheet();

    if (puntos.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        message: "No se encontraron datos en el Sheet",
      });
    }

    let imported = 0;
    let skipped = 0;

    const batchSize = 50;
    for (let i = 0; i < puntos.length; i += batchSize) {
      const batch = puntos.slice(i, i + batchSize);

      await prisma.$transaction(
        batch.map((p) =>
          prisma.supplySnapshot.upsert({
            where: {
              id: `sheet-${ASSET}-${p.fecha.toISOString().slice(0, 10)}`,
            },
            create: {
              id: `sheet-${ASSET}-${p.fecha.toISOString().slice(0, 10)}`,
              asset: ASSET,
              total: p.total,
              chainsJson: {
                source: "sheet-import",
                total: p.total,
              },
              snapshotAt: p.fecha,
            },
            update: {
              total: p.total,
              chainsJson: {
                source: "sheet-import",
                total: p.total,
              },
            },
          })
        )
      );

      imported += batch.length;
    }

    skipped = puntos.length - imported;

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      range: {
        from: puntos[0].fecha.toISOString().slice(0, 10),
        to: puntos[puntos.length - 1].fecha.toISOString().slice(0, 10),
      },
    });
  } catch (error) {
    console.error("[supply/import-from-sheet POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
