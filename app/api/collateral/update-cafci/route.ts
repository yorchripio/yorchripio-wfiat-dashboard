// app/api/collateral/update-cafci/route.ts
// Actualiza el valor cuotaparte del FCI Adcap desde la API de CAFCI.
// Crea allocations para la fecha CAFCI + estima hasta hoy.

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

    const latestFci = await prisma.collateralAllocation.findFirst({
      where: { asset: ASSET, tipo: "FCI", activo: true },
      orderBy: { fecha: "desc" },
    });

    if (!latestFci) {
      return NextResponse.json(
        { success: false, error: "No hay allocation FCI para wARS. Cargá una línea primero." },
        { status: 404 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const latestDate = latestFci.fecha.toISOString().slice(0, 10);

    // Already up to date
    if (latestDate === today) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "Ya actualizado",
        fecha: today,
        vcp: Number(latestFci.valorCuotaparte),
      });
    }

    // All allocations from latest date (multiple FCI lines + other types)
    const allLatest = await prisma.collateralAllocation.findMany({
      where: { asset: ASSET, fecha: latestFci.fecha, activo: true },
    });

    // Daily rate from prev vcp → CAFCI vcp
    const prevVcp = Number(latestFci.valorCuotaparte);
    const cafciDate = new Date(cafciData.fecha + "T00:00:00.000Z");
    const daysBetween = Math.max(1, Math.round(
      (cafciDate.getTime() - latestFci.fecha.getTime()) / 86400000
    ));
    const dailyRate = prevVcp > 0 ? Math.pow(cafciData.vcp / prevVcp, 1 / daysBetween) - 1 : 0;

    // Build dates: CAFCI date (real) + days until today (estimated)
    const todayDate = new Date(today + "T00:00:00.000Z");
    const dates: { fecha: Date; vcp: number }[] = [];

    if (cafciData.fecha !== latestDate) {
      dates.push({ fecha: cafciDate, vcp: cafciData.vcp });
    }

    if (dailyRate > 0) {
      const d = new Date(cafciDate);
      d.setUTCDate(d.getUTCDate() + 1);
      let n = 1;
      while (d <= todayDate) {
        dates.push({
          fecha: new Date(d.getTime()),
          vcp: cafciData.vcp * Math.pow(1 + dailyRate, n),
        });
        d.setUTCDate(d.getUTCDate() + 1);
        n++;
      }
    }

    let created = 0;
    for (const { fecha, vcp } of dates) {
      const existingForDate = await prisma.collateralAllocation.findMany({
        where: { asset: ASSET, fecha, activo: true },
      });
      const existingKeys = new Set(
        existingForDate.map((e) => `${e.tipo}:${Number(e.cantidadCuotasPartes).toFixed(6)}`)
      );

      for (const alloc of allLatest) {
        const isFci = alloc.tipo === "FCI";
        const newVcp = isFci ? vcp : Number(alloc.valorCuotaparte);
        const key = `${alloc.tipo}:${Number(alloc.cantidadCuotasPartes).toFixed(6)}`;

        if (existingKeys.has(key)) {
          if (isFci) {
            const ex = existingForDate.find(
              (e) => e.tipo === "FCI" &&
                Math.abs(Number(e.cantidadCuotasPartes) - Number(alloc.cantidadCuotasPartes)) < 0.01
            );
            if (ex && Math.abs(Number(ex.valorCuotaparte) - newVcp) > 0.001) {
              await prisma.collateralAllocation.update({
                where: { id: ex.id },
                data: { valorCuotaparte: newVcp },
              });
            }
          }
        } else {
          await prisma.collateralAllocation.create({
            data: {
              asset: ASSET,
              tipo: alloc.tipo,
              nombre: alloc.nombre,
              entidad: alloc.entidad,
              cantidadCuotasPartes: Number(alloc.cantidadCuotasPartes),
              valorCuotaparte: newVcp,
              fecha,
              activo: true,
            },
          });
          created++;
        }
      }

      try {
        await calculateAndSaveRendimiento(fecha);
      } catch (err) {
        console.warn("[update-cafci] rendimiento calc error:", err);
      }
    }

    // Total for response (sum all FCI lines)
    const totalFci = allLatest
      .filter((a) => a.tipo === "FCI")
      .reduce((sum, a) => sum + Number(a.cantidadCuotasPartes), 0);
    const vcpToday = dates.length > 0 ? dates[dates.length - 1].vcp : cafciData.vcp;

    return NextResponse.json({
      success: true,
      updated: true,
      fecha: cafciData.fecha,
      vcp: cafciData.vcp,
      vcpEstimadoHoy: vcpToday,
      dailyRate: dailyRate * 100,
      valorTotal: totalFci * vcpToday,
      datesCreated: dates.length,
    });
  } catch (e) {
    console.error("[update-cafci]", e);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
