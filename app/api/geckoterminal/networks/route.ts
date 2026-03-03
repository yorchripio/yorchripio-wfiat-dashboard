// app/api/geckoterminal/networks/route.ts
// Proxy a GeckoTerminal: lista de redes soportadas

import { NextResponse } from "next/server";
import { getNetworks } from "@/lib/geckoterminal/client";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getNetworks();
    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error("[API geckoterminal/networks]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al cargar redes",
      },
      { status: 500 }
    );
  }
}
