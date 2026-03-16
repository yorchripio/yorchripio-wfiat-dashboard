// app/api/cron/refresh-pools/route.ts
// Refresca el cache de pools de GeckoTerminal.
// Agrupa por network para hacer 3 requests (en vez de 11 individuales).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPool } from "@/lib/geckoterminal/types";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DELAY_MS = 2500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchMultiPools(
  networkId: string,
  addresses: string[]
): Promise<GeckoPool[]> {
  const joined = addresses.join(",");
  const url = `${BASE_URL}/networks/${encodeURIComponent(networkId)}/pools/multi/${joined}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json;version=20230203" },
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("429");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ??
      res.statusText;
    throw new Error(`GeckoTerminal: ${res.status} ${msg}`);
  }
  const json = await res.json();
  return (json.data ?? []) as GeckoPool[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET no definido" },
        { status: 500 }
      );
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Group pools by network
    const byNetwork = new Map<string, typeof FIXED_POOLS[number][]>();
    for (const pool of FIXED_POOLS) {
      const list = byNetwork.get(pool.networkId) ?? [];
      list.push(pool);
      byNetwork.set(pool.networkId, list);
    }

    let ok = 0;
    let failed = 0;
    let reqIdx = 0;

    for (const [networkId, pools] of byNetwork) {
      if (reqIdx > 0) await sleep(DELAY_MS);
      reqIdx++;

      const addresses = pools.map((p) => p.poolAddress);

      let fetched = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const results = await fetchMultiPools(networkId, addresses);

          // Match results back to our pool definitions
          for (const pool of pools) {
            const match = results.find(
              (r) =>
                r.attributes.address.toLowerCase() ===
                pool.poolAddress.toLowerCase()
            );
            if (match) {
              await prisma.geckoPoolCache.upsert({
                where: { id: pool.poolAddress },
                create: {
                  id: pool.poolAddress,
                  networkId: pool.networkId,
                  label: pool.label,
                  token: pool.token,
                  dataJson: match as object,
                },
                update: {
                  dataJson: match as object,
                },
              });
              ok++;
            } else {
              console.warn(
                `[cron/refresh-pools] No match for ${pool.label} ${pool.token} in ${networkId}`
              );
              failed++;
            }
          }
          fetched = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "429" && attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          console.error(
            `[cron/refresh-pools] ${networkId}: ${msg}`
          );
          failed += pools.length;
          fetched = true;
          break;
        }
      }
      if (!fetched) failed += pools.length;
    }

    console.log(`[cron/refresh-pools] ok=${ok} failed=${failed}`);
    return NextResponse.json({ success: true, ok, failed });
  } catch (error) {
    console.error("[cron/refresh-pools]", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
