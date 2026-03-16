// app/api/collateral/update-cafci/route.ts
// Actualiza el valor cuotaparte del FCI Adcap desde la API de CAFCI.
// Crea una nueva CollateralAllocation con el vcp actualizado y recalcula rendimiento.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchAdcapCuotaparte } from "@/lib/cafci/client";
import { calculateAndSaveRendimiento } from "@/lib/db/rendimiento-calc";

const ASSET = "wARS";

export async function POST(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const cafciData = await fetchAdcapCuotaparte();
    if (!cafciData) {
      return NextResponse.json(
        { success: false, error: "No se pudo obtener datos de CAFCI" },
        { status: 502 }
      );
    }

    // Find the latest FCI allocation for wARS (Adcap)
    const latestFci = await prisma.collateralAllocation.findFirst({
      where: {
        asset: ASSET,
        tipo: "FCI",
        activo: true,
      },
      orderBy: { fecha: "desc" },
    });

    if (!latestFci) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay allocation FCI para wARS. Cargá una línea primero.",
        },
        { status: 404 }
      );
    }

    const cafciFecha = new Date(cafciData.fecha + "T00:00:00.000Z");
    const latestFechaKey = latestFci.fecha.toISOString().slice(0, 10);
    const latestVcp = Number(latestFci.valorCuotaparte);

    // If we already have an allocation for this CAFCI date with same vcp, skip
    if (
      latestFechaKey === cafciData.fecha &&
      Math.abs(latestVcp - cafciData.vcp) < 0.001
    ) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "Ya actualizado",
        fecha: cafciData.fecha,
        vcp: cafciData.vcp,
        valorTotal:
          Number(latestFci.cantidadCuotasPartes) * cafciData.vcp,
      });
    }

    // Also copy all other active allocations for the same date (Cuenta_Remunerada, A_la_Vista)
    // so the full collateral picture is preserved for the new date
    const allLatestAllocations = await prisma.collateralAllocation.findMany({
      where: {
        asset: ASSET,
        fecha: latestFci.fecha,
        activo: true,
      },
    });

    // Create allocations for the CAFCI date
    for (const alloc of allLatestAllocations) {
      const isFci = alloc.tipo === "FCI";
      const newVcp = isFci ? cafciData.vcp : Number(alloc.valorCuotaparte);
      const cant = Number(alloc.cantidadCuotasPartes);

      // Check if allocation already exists for this date+tipo
      const existing = await prisma.collateralAllocation.findFirst({
        where: {
          asset: ASSET,
          tipo: alloc.tipo,
          fecha: cafciFecha,
          activo: true,
        },
      });

      if (existing) {
        // Update vcp if it's the FCI
        if (isFci && Math.abs(Number(existing.valorCuotaparte) - newVcp) > 0.001) {
          await prisma.collateralAllocation.update({
            where: { id: existing.id },
            data: { valorCuotaparte: newVcp },
          });
        }
      } else {
        await prisma.collateralAllocation.create({
          data: {
            asset: ASSET,
            tipo: alloc.tipo,
            nombre: alloc.nombre,
            entidad: alloc.entidad,
            cantidadCuotasPartes: cant,
            valorCuotaparte: newVcp,
            fecha: cafciFecha,
            activo: true,
          },
        });
      }
    }

    // Recalculate rendimiento for the CAFCI date
    try {
      await calculateAndSaveRendimiento(cafciFecha);
    } catch (err) {
      console.warn("[update-cafci] Error calculando rendimiento:", err);
    }

    const valorTotal =
      Number(latestFci.cantidadCuotasPartes) * cafciData.vcp;

    return NextResponse.json({
      success: true,
      updated: true,
      fecha: cafciData.fecha,
      vcp: cafciData.vcp,
      vcpAnterior: latestVcp,
      valorTotal,
    });
  } catch (e) {
    console.error("[update-cafci]", e);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
