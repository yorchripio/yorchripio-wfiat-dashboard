// app/api/supply/snapshots/route.ts
// GET: lista todos los supply snapshots ordenados por fecha desc.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_ASSET = "wARS";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get("asset") ?? DEFAULT_ASSET;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 2000);

    const snapshots = await prisma.supplySnapshot.findMany({
      where: { asset },
      orderBy: { snapshotAt: "desc" },
      take: limit,
    });

    const data = snapshots.map((s) => ({
      id: s.id,
      asset: s.asset,
      total: Number(s.total),
      chainsJson: s.chainsJson,
      snapshotAt: s.snapshotAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("[supply/snapshots GET]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
