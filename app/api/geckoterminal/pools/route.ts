// app/api/geckoterminal/pools/route.ts
// Devuelve datos de todas las pools fijas (wARS, wBRL, wMXN, wCOP en múltiples chains)

import { NextResponse } from "next/server";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPool, GeckoPoolResponse } from "@/lib/geckoterminal/types";

type PoolResult =
  | { poolAddress: string; networkId: string; label: string; token: string; data: GeckoPool }
  | { poolAddress: string; networkId: string; label: string; token: string; error: string };

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DELAY_MS = 400; // ~2.5 req/sec — well under 30/min limit
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000; // wait 3s on 429 before retry

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPoolDirect(networkId: string, poolAddress: string): Promise<GeckoPoolResponse> {
  const url = `${BASE_URL}/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(poolAddress)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json;version=20230203" },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Error("429");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ?? res.statusText;
    throw new Error(`GeckoTerminal: ${res.status} ${message}`);
  }

  return res.json() as Promise<GeckoPoolResponse>;
}

export async function GET(): Promise<NextResponse> {
  // Fetch pools sequentially with delays to respect GeckoTerminal rate limits
  const results: PoolResult[] = [];

  for (let i = 0; i < FIXED_POOLS.length; i++) {
    const pool = FIXED_POOLS[i];

    // Delay between requests (skip first)
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
          // Rate limited — wait longer and retry
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

  return NextResponse.json({ success: true, pools: results });
}
