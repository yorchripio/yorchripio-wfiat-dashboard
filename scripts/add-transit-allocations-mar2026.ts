/**
 * Script one-off: agrega allocations A_la_Vista por $100M para los días
 * 21, 22, 23 y 24 de marzo de 2026.
 *
 * Contexto: se mintearon 100M wARS el 21/03 (sábado). La transferencia
 * de $100M se emitió el mismo sábado 21/03 pero se acreditó en Banco
 * Comercio recién el miércoles 25/03 (finde + feriado 24/03).
 * Durante esos días la plata estaba en tránsito bancario.
 *
 * Ejecutar: npx tsx scripts/add-transit-allocations-mar2026.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATES = [
  "2026-03-21",
  "2026-03-22",
  "2026-03-23",
  "2026-03-24",
];

const ALLOCATION = {
  asset: "wARS",
  tipo: "A_la_Vista" as const,
  nombre: "Transferencia en tránsito - Banco Comercio",
  entidad: "Banco Comercio",
  cantidadCuotasPartes: 1,        // 1 unidad
  valorCuotaparte: 100_000_000,   // $100M
  activo: true,
};

async function main(): Promise<void> {
  console.log("Insertando allocations A_la_Vista (fondos en tránsito) para 21-24/03/2026...\n");

  for (const dateStr of DATES) {
    const fecha = new Date(dateStr + "T00:00:00.000Z");

    // Check if already exists
    const existing = await prisma.collateralAllocation.findFirst({
      where: {
        asset: ALLOCATION.asset,
        tipo: ALLOCATION.tipo,
        fecha,
      },
    });

    if (existing) {
      console.log(`  ${dateStr}: ya existe (id=${existing.id}), skip.`);
      continue;
    }

    const created = await prisma.collateralAllocation.create({
      data: {
        ...ALLOCATION,
        fecha,
      },
    });

    console.log(`  ${dateStr}: creado (id=${created.id}) — $100,000,000 A_la_Vista`);
  }

  // Verify
  const allocs = await prisma.collateralAllocation.findMany({
    where: {
      asset: "wARS",
      fecha: {
        gte: new Date("2026-03-21T00:00:00.000Z"),
        lte: new Date("2026-03-24T00:00:00.000Z"),
      },
    },
    orderBy: { fecha: "asc" },
  });

  console.log(`\nVerificación: ${allocs.length} allocation(s) entre 21-24/03/2026:`);
  for (const a of allocs) {
    const d = a.fecha.toISOString().slice(0, 10);
    const val = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
    console.log(`  ${d} | ${a.tipo} | ${a.nombre} | $${val.toLocaleString("es-AR")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/*
  Alternativa en Supabase (SQL Editor):

  INSERT INTO collateral_allocations (asset, tipo, nombre, entidad, cantidad_cuotas_partes, valor_cuotaparte, fecha, activo)
  VALUES
    ('wARS', 'A_la_Vista', 'Transferencia en tránsito - Banco Comercio', 'Banco Comercio', 1, 100000000, '2026-03-21', true),
    ('wARS', 'A_la_Vista', 'Transferencia en tránsito - Banco Comercio', 'Banco Comercio', 1, 100000000, '2026-03-22', true),
    ('wARS', 'A_la_Vista', 'Transferencia en tránsito - Banco Comercio', 'Banco Comercio', 1, 100000000, '2026-03-23', true),
    ('wARS', 'A_la_Vista', 'Transferencia en tránsito - Banco Comercio', 'Banco Comercio', 1, 100000000, '2026-03-24', true);

  -- Verificar
  SELECT fecha, tipo, nombre, cantidad_cuotas_partes * valor_cuotaparte AS total
  FROM collateral_allocations
  WHERE asset = 'wARS'
    AND fecha >= '2026-03-21' AND fecha <= '2026-03-24'
  ORDER BY fecha;
*/
