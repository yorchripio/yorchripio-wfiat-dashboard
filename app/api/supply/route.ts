// app/api/supply/route.ts
// Endpoint que retorna el supply de wARS en las 3 chains

import { NextResponse } from "next/server";
import { getTotalSupply } from "@/lib/blockchain/supply";

export async function GET() {
  try {
    console.log("[API /supply] Consultando supply de wARS...");

    const supplyData = await getTotalSupply();

    if (!supplyData.allSuccessful) {
      const failed = (["ethereum", "worldchain", "base"] as const).filter(
        (c) => !supplyData.chains[c].success
      );
      const msg = `Supply incompleto: fallaron ${failed.join(", ")}. No usar total parcial.`;
      console.warn("[API /supply]", msg, supplyData.chains);
      return NextResponse.json(
        {
          success: false,
          error: msg,
        },
        { status: 503 }
      );
    }

    console.log("[API /supply] Supply obtenido:", {
      ethereum: supplyData.chains.ethereum.supply,
      worldchain: supplyData.chains.worldchain.supply,
      base: supplyData.chains.base.supply,
      total: supplyData.total,
    });

    return NextResponse.json({
      success: true,
      data: supplyData,
    });
  } catch (error) {
    console.error("[API /supply] Error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}