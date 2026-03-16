// app/api/cron/refresh-pools/route.ts
// Refresca el cache de pools de GeckoTerminal (individual, secuencial).
// Corre en background vía instrumentation.ts — la velocidad no importa.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FIXED_POOLS } from "@/lib/geckoterminal/constants";
import type { GeckoPoolResponse } from "@/lib/geckoterminal/types";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DELAY_MS = 2500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET no definido" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

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
          console.error(`[cron/refresh-pools] ${pool.label} ${pool.token}: ${msg}`);
          failed++;
          break;
        }
      }
    }

    console.log(`[cron/refresh-pools] ok=${ok} failed=${failed}`);
    return NextResponse.json({ success: true, ok, failed });
  } catch (error) {
    console.error("[cron/refresh-pools]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
