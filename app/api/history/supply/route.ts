// app/api/history/supply/route.ts
// GET: historial de supply desde la DB (para wARS u otro asset vía query)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupplyHistory } from "@/lib/db/snapshots";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get("asset") ?? "wARS";
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get("limit") ?? "365", 10) || 365)
    );

    const data = await getSupplyHistory(asset, limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[history/supply]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al leer historial",
      },
      { status: 500 }
    );
  }
}
