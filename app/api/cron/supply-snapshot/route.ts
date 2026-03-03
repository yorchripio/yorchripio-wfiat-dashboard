// app/api/cron/supply-snapshot/route.ts
// Cron diario: toma snapshot del supply de wARS por chain y lo guarda en la DB.
// Se ejecuta automáticamente a las 00:00 UTC (21:00 ART) vía Vercel Cron.
// Protegido por CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { prisma } from "@/lib/db";

const ASSET = "wARS";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const supplyData = await getTotalSupply();

    if (!supplyData.allSuccessful) {
      const failed = (["ethereum", "worldchain", "base"] as const).filter(
        (c) => !supplyData.chains[c].success
      );
      console.warn(`[cron/supply-snapshot] Supply incompleto, no se guarda snapshot. Fallaron: ${failed.join(", ")}`);
      return NextResponse.json(
        {
          success: false,
          error: `Supply incompleto: fallaron ${failed.join(", ")}. No se guardó snapshot.`,
        },
        { status: 503 }
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dateKey = today.toISOString().slice(0, 10);
    const snapshotId = `cron-${ASSET}-${dateKey}`;

    await prisma.supplySnapshot.upsert({
      where: { id: snapshotId },
      create: {
        id: snapshotId,
        asset: ASSET,
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
        snapshotAt: today,
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
      },
    });

    console.log(`[cron/supply-snapshot] Snapshot guardado: ${dateKey}, total=${supplyData.total}`);

    return NextResponse.json({
      success: true,
      date: dateKey,
      total: supplyData.total,
      chains: {
        ethereum: supplyData.chains.ethereum.supply,
        worldchain: supplyData.chains.worldchain.supply,
        base: supplyData.chains.base.supply,
      },
    });
  } catch (error) {
    console.error("[cron/supply-snapshot]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
