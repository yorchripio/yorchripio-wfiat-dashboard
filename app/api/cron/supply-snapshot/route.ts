// app/api/cron/supply-snapshot/route.ts
// Cron diario: toma snapshot del supply de wARS por chain y lo guarda en la DB.
// Se ejecuta automáticamente a las 00:00 UTC (21:00 ART) vía Vercel Cron.
// La fecha del snapshot es "hoy" en hora Buenos Aires (ART) para que coincida con el día local.
// Protegido por CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { prisma } from "@/lib/db";

const ASSETS = ["wARS", "wBRL"] as const;
const TZ_ART = "America/Argentina/Buenos_Aires";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[cron/supply-snapshot] CRON_SECRET no definido");
      return NextResponse.json(
        { success: false, error: "Error de configuración del servidor" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const now = new Date();
    const dateKey = formatInTimeZone(now, TZ_ART, "yyyy-MM-dd");
    const snapshotAt = fromZonedTime(
      new Date(dateKey + "T00:00:00"),
      TZ_ART
    );

    const results: Record<string, { total: number; success: boolean; error?: string }> = {};

    for (const asset of ASSETS) {
      try {
        const supplyData = await getTotalSupply(asset);

        if (!supplyData.allSuccessful) {
          const failed = (["ethereum", "worldchain", "base"] as const).filter(
            (c) => !supplyData.chains[c].success
          );
          console.warn(`[cron/supply-snapshot] ${asset} supply incompleto. Fallaron: ${failed.join(", ")}`);
          results[asset] = { total: 0, success: false, error: `Fallaron: ${failed.join(", ")}` };
          continue;
        }

        const snapshotId = `cron-${asset}-${dateKey}`;

        await prisma.supplySnapshot.upsert({
          where: { id: snapshotId },
          create: {
            id: snapshotId,
            asset,
            total: supplyData.total,
            chainsJson: {
              ethereum: {
                supply: supplyData.chains.ethereum.supply,
                success: supplyData.chains.ethereum.success,
              },
              worldchain: {
                supply: supplyData.chains.worldchain.supply,
                success: supplyData.chains.worldchain.success,
              },
              base: {
                supply: supplyData.chains.base.supply,
                success: supplyData.chains.base.success,
              },
              source: "cron",
            },
            snapshotAt,
          },
          update: {
            total: supplyData.total,
            chainsJson: {
              ethereum: {
                supply: supplyData.chains.ethereum.supply,
                success: supplyData.chains.ethereum.success,
              },
              worldchain: {
                supply: supplyData.chains.worldchain.supply,
                success: supplyData.chains.worldchain.success,
              },
              base: {
                supply: supplyData.chains.base.supply,
                success: supplyData.chains.base.success,
              },
              source: "cron",
            },
            snapshotAt,
          },
        });

        console.log(`[cron/supply-snapshot] ${asset} snapshot guardado: ${dateKey}, total=${supplyData.total}`);
        results[asset] = { total: supplyData.total, success: true };
      } catch (err) {
        console.error(`[cron/supply-snapshot] Error con ${asset}:`, err);
        results[asset] = { total: 0, success: false, error: String(err) };
      }
    }

    return NextResponse.json({
      success: Object.values(results).some((r) => r.success),
      date: dateKey,
      assets: results,
    });
  } catch (error) {
    console.error("[cron/supply-snapshot]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
