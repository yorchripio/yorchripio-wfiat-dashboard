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

    if (!supplyData.allSuccessful) {
      const failed = (["ethereum", "worldchain", "base", "gnosis"] as const).filter(
        (c) => !supplyData.chains[c].success
      );
      return NextResponse.json(
        {
          success: false,
          error: `Supply incompleto: fallaron ${failed.join(", ")}`,
        },
        { status: 503 }
      );
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