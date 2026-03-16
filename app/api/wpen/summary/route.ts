// app/api/wpen/summary/route.ts
// GET: Balance wPEN en Buda.com (colateral sin colocar) + supply coverage.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPenBalance } from "@/lib/wpen/buda-client";
import { prisma } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Fetch live balance from Buda.com
    const balance = await getPenBalance();

    // Supply for coverage
    const latestSupply = await prisma.supplySnapshot.findFirst({
      where: { asset: "wPEN" },
      orderBy: { snapshotAt: "desc" },
    });
    const supply = latestSupply ? Number(latestSupply.total) : null;

    return NextResponse.json({
      success: true,
      data: {
        currency: balance.currency,
        amount: balance.amount,
        available: balance.available,
        frozen: balance.frozen,
        pendingWithdrawal: balance.pendingWithdrawal,
        // No yield — collateral just sits in Buda
        rendimiento: null,
        cobertura: {
          supply,
          colateral: balance.amount,
          ratio: supply && supply > 0 ? (balance.amount / supply) * 100 : null,
        },
      },
    });
  } catch (error) {
    console.error("[wPEN summary]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo balance wPEN" },
      { status: 500 }
    );
  }
}
