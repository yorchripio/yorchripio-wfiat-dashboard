// app/api/geckoterminal/pools/route.ts
// Sirve pools desde el cache en DB (actualizado por cron cada 15 min).
// Si el cache está vacío o tiene más de 30 min, hace fetch directo como fallback.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPool, GeckoPoolResponse } from "@/lib/geckoterminal/types";

type PoolResult =
  | { poolAddress: string; networkId: string; label: string; token: string; data: GeckoPool }
  | { poolAddress: string; networkId: string; label: string; token: string; error: string };

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DELAY_MS = 2500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPoolDirect(networkId: string, poolAddress: string): Promise<GeckoPoolResponse> {
  const url = `${BASE_URL}/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(poolAddress)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json;version=20230203" },
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("429");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ?? res.statusText;
    throw new Error(`GeckoTerminal: ${res.status} ${message}`);
  }
  return res.json() as Promise<GeckoPoolResponse>;
}

export async function GET(): Promise<NextResponse> {
  // Try serving from DB cache first
  try {
    const cached = await prisma.geckoPoolCache.findMany();
    if (cached.length > 0) {
      const oldest = Math.min(...cached.map((c) => c.updatedAt.getTime()));
      if (Date.now() - oldest < CACHE_MAX_AGE_MS) {
        const results: PoolResult[] = cached.map((c) => ({
          poolAddress: c.id,
          networkId: c.networkId,
          label: c.label,
          token: c.token,
          data: c.dataJson as unknown as GeckoPool,
        }));
        return NextResponse.json({ success: true, pools: results, source: "cache" });
      }
    }
  } catch {
    // DB error — fall through to live fetch
  }

  // Fallback: fetch live (slow but works if cache is empty/stale)
  const results: PoolResult[] = [];

  for (let i = 0; i < FIXED_POOLS.length; i++) {
    const pool = FIXED_POOLS[i];
    if (i > 0) await sleep(DELAY_MS);

    let fetched = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetchPoolDirect(pool.networkId, pool.poolAddress);
        results.push({
          poolAddress: pool.poolAddress,
          networkId: pool.networkId,
          label: pool.label,
          token: pool.token,
          data: res.data,
        });
        fetched = true;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "429" && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        results.push({
          poolAddress: pool.poolAddress,
          networkId: pool.networkId,
          label: pool.label,
          token: pool.token,
          error: msg || "Error al cargar la pool",
        });
        fetched = true;
        break;
      }
    }

    if (!fetched) {
      results.push({
        poolAddress: pool.poolAddress,
        networkId: pool.networkId,
        label: pool.label,
        token: pool.token,
        error: "Max reintentos alcanzado",
      });
    }
  }

  return NextResponse.json({ success: true, pools: results, source: "live" });
}
