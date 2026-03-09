// app/api/history/collateral/route.ts
// GET: historial de colateral desde la DB

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollateralHistory } from "@/lib/db/snapshots";

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

    const data = await getCollateralHistory(asset, limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[history/collateral]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al leer historial",
      },
      { status: 500 }
    );
  }
}
