// lib/cron/snapshots.ts
// Daily supply + collateral snapshots, called from instrumentation.ts.
// Uses upsert with deterministic IDs to run safely multiple times per day.

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getCollateralDataFromDB } from "@/lib/db/collateral";
import { prisma } from "@/lib/db";

const SUPPLY_ASSETS = ["wARS", "wBRL"] as const;
const TZ_ART = "America/Argentina/Buenos_Aires";

export async function takeSupplyAndCollateralSnapshots(): Promise<void> {
  const now = new Date();
  const dateKey = formatInTimeZone(now, TZ_ART, "yyyy-MM-dd");
  const snapshotAt = fromZonedTime(new Date(dateKey + "T00:00:00"), TZ_ART);

  // ── Supply snapshots ──
  for (const asset of SUPPLY_ASSETS) {
    try {
      const supplyData = await getTotalSupply(asset);
      if (!supplyData.allSuccessful) {
        const failed = (["ethereum", "worldchain", "base", "gnosis"] as const).filter(
          (c) => !supplyData.chains[c].success
        );
        console.warn(`[cron/snapshot] ${asset} supply incompleto, fallaron: ${failed.join(", ")}`);
        continue;
      }

      const chainsData: Record<string, { supply: number; success: boolean } | string> = { source: "cron" };
      for (const c of ["ethereum", "worldchain", "base", "gnosis"] as const) {
        chainsData[c] = { supply: supplyData.chains[c].supply, success: true };
      }

      const snapshotId = `cron-${asset}-${dateKey}`;
      await prisma.supplySnapshot.upsert({
        where: { id: snapshotId },
        create: {
          id: snapshotId,
          asset,
          total: supplyData.total,
          chainsJson: chainsData,
          snapshotAt,
        },
        update: {
          total: supplyData.total,
          chainsJson: chainsData,
        },
      });
      console.log(`[cron/snapshot] ${asset} supply OK: ${dateKey}, total=${supplyData.total}`);
    } catch (err) {
      console.error(`[cron/snapshot] ${asset} supply error:`, err);
    }
  }

  // ── Collateral snapshot (wARS) ──
  try {
    const colId = `cron-collateral-wARS-${dateKey}`;
    const existing = await prisma.collateralSnapshot.findUnique({ where: { id: colId } });
    if (!existing) {
      const collateral = await getCollateralDataFromDB();
      if (collateral && collateral.total > 0) {
        await prisma.collateralSnapshot.create({
          data: {
            id: colId,
            asset: "wARS",
            total: collateral.total,
            instrumentosJson: collateral.instrumentos as unknown as object,
            rendimientoCartera: collateral.rendimientoCartera ?? undefined,
            snapshotAt,
          },
        });
        console.log(`[cron/snapshot] wARS collateral OK: ${dateKey}, total=${collateral.total}`);
      }
    }
  } catch (err) {
    console.error("[cron/snapshot] wARS collateral error:", err);
  }
}
