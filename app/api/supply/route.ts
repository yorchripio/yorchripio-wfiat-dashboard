// app/api/supply/route.ts
// Endpoint que retorna el supply de wARS en las 3 chains

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { type AssetSymbol } from "@/lib/blockchain/config";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const asset = (request.nextUrl.searchParams.get("asset") || "wARS") as AssetSymbol;
    const supplyData = await getTotalSupply(asset);

    // Only fail if a CORE chain (ethereum, worldchain) fails.
    // Base, Gnosis, Polygon y BSC son opcionales.
    const coreChains = ["ethereum", "worldchain"] as const;
    const coreFailed = coreChains.filter((c) => !supplyData.chains[c].success);
    if (coreFailed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Supply incompleto: fallaron ${coreFailed.join(", ")}`,
        },
        { status: 503 }
      );
    }

    for (const opt of ["base", "gnosis", "polygon", "bsc"] as const) {
      if (!supplyData.chains[opt].success) {
        console.warn(`[API /supply] ${opt} falló, devolviendo supply sin ${opt}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: supplyData,
    });
  } catch (error) {
    console.error("[API /supply] Error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Error al consultar supply",
      },
      { status: 500 }
    );
  }
}
