// app/api/geckoterminal/pools/route.ts
// Sirve pools desde el cache en DB (actualizado cada 15 min por instrumentation.ts).
// No hace fetch directo a GeckoTerminal — siempre instantáneo.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { GeckoPool } from "@/lib/geckoterminal/types";

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await prisma.geckoPoolCache.findMany();

    if (cached.length === 0) {
      return NextResponse.json({
        success: true,
        pools: [],
        source: "cache",
        message: "Cache vacío — se actualizará en breve",
      });
    }

    const pools = cached.map((c) => ({
      poolAddress: c.id,
      networkId: c.networkId,
      label: c.label,
      token: c.token,
      data: c.dataJson as unknown as GeckoPool,
    }));

    return NextResponse.json({ success: true, pools, source: "cache" });
  } catch (err) {
    console.error("[pools] Error reading cache:", err);
    return NextResponse.json(
      { success: false, error: "Error al leer cache de pools" },
      { status: 500 }
    );
  }
}
