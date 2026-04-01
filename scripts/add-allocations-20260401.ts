/**
 * Script one-off: carga allocations para 01/04/2026.
 * - FCI Adcap Ahorro Pesos Clase B en ADCAP (54,815,630.6843 CP × VCP 18.51)
 * - A_la_Vista $20,020,000 en Banco Comercio (minteo 31/03 en Gnosis)
 *
 * Ejecutar: npx tsx scripts/add-allocations-20260401.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FECHA = new Date("2026-04-01T00:00:00.000Z");
const FECHA_STR = "2026-04-01";

const ALLOCATIONS = [
  {
    asset: "wARS",
    tipo: "FCI" as const,
    nombre: "FCI Adcap Ahorro pesos clase B",
    entidad: "ADCAP",
    cantidadCuotasPartes: 54_815_630.6843,
    valorCuotaparte: 18.51,  // VCP CAFCI al 31/03/2026
    activo: true,
  },
  {
    asset: "wARS",
    tipo: "A_la_Vista" as const,
    nombre: "Saldo a la Vista",
    entidad: "Banco Comercio",
    cantidadCuotasPartes: 1,
    valorCuotaparte: 20_020_000,  // Minteo 31/03 en Gnosis
    activo: true,
  },
];

async function main(): Promise<void> {
  console.log(`Cargando allocations para ${FECHA_STR}...\n`);

  for (const alloc of ALLOCATIONS) {
    const existing = await prisma.collateralAllocation.findFirst({
      where: { asset: alloc.asset, tipo: alloc.tipo, nombre: alloc.nombre, fecha: FECHA },
    });

    if (existing) {
      console.log(`  Ya existe: ${alloc.tipo} | ${alloc.nombre} (id=${existing.id}) — actualizando...`);
      await prisma.collateralAllocation.update({
        where: { id: existing.id },
        data: {
          cantidadCuotasPartes: alloc.cantidadCuotasPartes,
          valorCuotaparte: alloc.valorCuotaparte,
          entidad: alloc.entidad,
          activo: alloc.activo,
        },
      });
      const val = alloc.cantidadCuotasPartes * alloc.valorCuotaparte;
      console.log(`  Actualizado: $${val.toLocaleString("es-AR")}`);
    } else {
      const created = await prisma.collateralAllocation.create({
        data: { ...alloc, fecha: FECHA },
      });
      const val = alloc.cantidadCuotasPartes * alloc.valorCuotaparte;
      console.log(`  Creado: ${alloc.tipo} | ${alloc.nombre} | $${val.toLocaleString("es-AR")} (id=${created.id})`);
    }
  }

  // Verify
  const all = await prisma.collateralAllocation.findMany({
    where: { asset: "wARS", fecha: FECHA },
    orderBy: { tipo: "asc" },
  });

  console.log(`\nVerificación — ${FECHA_STR}:`);
  let grandTotal = 0;
  for (const a of all) {
    const val = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
    grandTotal += val;
    console.log(`  ${a.tipo} | ${a.nombre} | ${a.entidad} | $${val.toLocaleString("es-AR")}`);
  }
  console.log(`  TOTAL: $${grandTotal.toLocaleString("es-AR")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
