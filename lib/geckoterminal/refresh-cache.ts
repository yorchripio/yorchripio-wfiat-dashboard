// lib/geckoterminal/refresh-cache.ts
// Lógica compartida para refrescar el cache de pools de GeckoTerminal.
// Usada tanto por el cron route como por instrumentation.ts.

import { prisma } from "@/lib/db";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPoolResponse } from "@/lib/geckoterminal/types";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DELAY_MS = 6000; // 6s between requests — GeckoTerminal free tier is strict
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10s wait on 429

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPool(networkId: string, poolAddress: string): Promise<GeckoPoolResponse> {
  const url = `${BASE_URL}/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(poolAddress)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json;version=20230203" },
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("429");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ?? res.statusText;
    throw new Error(`GeckoTerminal: ${res.status} ${msg}`);
  }
  return res.json() as Promise<GeckoPoolResponse>;
}

export async function refreshPoolCache(): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < FIXED_POOLS.length; i++) {
    const pool = FIXED_POOLS[i];
    if (i > 0) await sleep(DELAY_MS);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetchPool(pool.networkId, pool.poolAddress);
        await prisma.geckoPoolCache.upsert({
          where: { id: pool.poolAddress },
          create: {
            id: pool.poolAddress,
            networkId: pool.networkId,
            label: pool.label,
            token: pool.token,
            dataJson: res.data as object,
          },
          update: {
            dataJson: res.data as object,
          },
        });
        ok++;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "429" && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        console.error(`[refresh-pools] ${pool.label} ${pool.token}: ${msg}`);
        failed++;
        break;
      }
    }
  }

  console.log(`[refresh-pools] ok=${ok} failed=${failed}`);
  return { ok, failed };
}
