// app/api/snapshots/route.ts
// POST: guarda snapshot actual de supply y colateral en la DB (solo ADMIN)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getCollateralDataFromDB } from "@/lib/db/collateral";
import { saveSupplySnapshot, saveCollateralSnapshot } from "@/lib/db/snapshots";

export async function POST(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo ADMIN puede guardar snapshots" },
        { status: 403 }
      );
    }

    const [supplyData, collateralData] = await Promise.all([
      getTotalSupply(),
      getCollateralDataFromDB(),
    ]);

    if (!collateralData) {
      return NextResponse.json(
        { success: false, error: "No hay colateral en la DB. Cargá líneas en Data o importá desde el sheet antes de guardar snapshot." },
        { status: 400 }
      );
    }

    await Promise.all([
      saveSupplySnapshot(supplyData),
      saveCollateralSnapshot(collateralData),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        supplyTotal: supplyData.total,
        collateralTotal: collateralData.total,
        at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[snapshots POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al guardar",
      },
      { status: 500 }
    );
  }
}
