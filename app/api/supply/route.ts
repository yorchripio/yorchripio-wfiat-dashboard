// app/api/supply/route.ts
// Endpoint que retorna el supply de wARS en las 3 chains

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTotalSupply } from "@/lib/blockchain/supply";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const supplyData = await getTotalSupply();

    if (!supplyData.allSuccessful) {
      const failed = (["ethereum", "worldchain", "base"] as const).filter(
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