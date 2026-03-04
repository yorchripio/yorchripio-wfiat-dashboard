/**
 * Script one-off: corrige el total de supply para los días 24, 25, 26 y 27 de febrero de 2026
 * que quedaron en 667997005.00 y deberían ser 568000000.00.
 *
 * Ejecutar: npm run correct-supply-feb2026
 * (usa .env.local para DATABASE_URL)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ASSET = "wARS";
const CORRECT_TOTAL = 568_000_000;
const START = new Date("2026-02-24T00:00:00.000Z");
const END = new Date("2026-02-28T00:00:00.000Z"); // exclusive

async function main(): Promise<void> {
  const rows = await prisma.supplySnapshot.findMany({
    where: {
      asset: ASSET,
      snapshotAt: { gte: START, lt: END },
    },
    orderBy: { snapshotAt: "asc" },
  });

  console.log(`Encontrados ${rows.length} snapshot(s) entre 24 y 27/02/2026.`);
  if (rows.length === 0) {
    console.log("No hay nada que corregir.");
    return;
  }

  for (const row of rows) {
    const before = Number(row.total);
    const date = row.snapshotAt.toISOString().slice(0, 10);
    console.log(`  ${date} (id=${row.id}): ${before} -> ${CORRECT_TOTAL}`);
  }

  const updated = await prisma.supplySnapshot.updateMany({
    where: {
      asset: ASSET,
      snapshotAt: { gte: START, lt: END },
    },
    data: { total: CORRECT_TOTAL },
  });

  console.log(`\nActualizados ${updated.count} registro(s). Total corregido a ${CORRECT_TOTAL}.`);
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

  -- Ver registros afectados
  SELECT id, asset, total, snapshot_at
  FROM supply_snapshots
  WHERE asset = 'wARS'
    AND snapshot_at >= '2026-02-24'::date
    AND snapshot_at < '2026-02-28'::date;

  -- Corregir total a 568000000
  UPDATE supply_snapshots
  SET total = 568000000.00
  WHERE asset = 'wARS'
    AND snapshot_at >= '2026-02-24'::date
    AND snapshot_at < '2026-02-28'::date;
*/
