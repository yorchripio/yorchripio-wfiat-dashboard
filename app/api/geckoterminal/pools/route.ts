// app/api/geckoterminal/pools/route.ts
// Devuelve datos de las dos pools fijas (World Chain y Base)

import { NextResponse } from "next/server";
import { getPool } from "@/lib/geckoterminal/client";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPool } from "@/lib/geckoterminal/types";

type PoolResult =
  | { poolAddress: string; networkId: string; label: string; data: GeckoPool }
  | { poolAddress: string; networkId: string; label: string; error: string };

export async function GET(): Promise<NextResponse> {
  const results: PoolResult[] = [];

  for (const pool of FIXED_POOLS) {
    try {
      const res = await getPool(pool.networkId, pool.poolAddress);
      results.push({
        poolAddress: pool.poolAddress,
        networkId: pool.networkId,
        label: pool.label,
        data: res.data,
      });
    } catch (err) {
      results.push({
        poolAddress: pool.poolAddress,
        networkId: pool.networkId,
        label: pool.label,
        error: err instanceof Error ? err.message : "Error al cargar la pool",
      });
    }
  }

  return NextResponse.json({ success: true, pools: results });
}
