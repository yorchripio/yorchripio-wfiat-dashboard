// Fix wCOP supply snapshots: remove BSC 18.3M from all dates before April 7
// BSC mint was approved on April 7, not March 31
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BSC_MINT_DATE = "2026-04-07";
const BSC_AMOUNT = 18321043;

// Correct supply data (verified on-chain):
// WC: 97,583,653.797 constant Jan-Mar 3, then small burns
// Gnosis: 0 (Jan-Feb), 1000 (Mar 7), 21043 (Mar 31)
// Polygon: 0 (Jan-Feb), ~22524 (by end Mar) — approximate
// BSC: 0 until April 7

const SUPPLY_CORRECTIONS = {
  "2026-01-01": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-01-08": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-01-13": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-01-15": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-01-31": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-02-01": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-02-09": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-02-15": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-02-28": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-03-01": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-03-03": { wc: 97583653.797, gnosis: 0, polygon: 0, bsc: 0 },
  "2026-03-07": { wc: 97582172.497, gnosis: 1000, polygon: 481.3, bsc: 0 }, // after 1st burn bridge
  "2026-03-16": { wc: 97522043.497, gnosis: 21043, polygon: 22524.3, bsc: 0 }, // after all burns/bridges
  "2026-03-31": { wc: 97522043.497, gnosis: 21043, polygon: 22524.3, bsc: 0 },
  // April 7: BSC mint approved → include BSC
  "2026-04-07": { wc: 97522043.497, gnosis: 21043, polygon: 22524.3, bsc: 18321043 },
};

(async () => {
  console.log("=== Fixing wCOP Supply Snapshots (remove BSC pre-April) ===\n");

  const existing = await prisma.supplySnapshot.findMany({
    where: { asset: "wCOP" },
    orderBy: { snapshotAt: "asc" },
  });

  console.log(`Found ${existing.length} existing snapshots\n`);

  for (const snap of existing) {
    const dateStr = snap.snapshotAt.toISOString().slice(0, 10);
    const correction = SUPPLY_CORRECTIONS[dateStr];

    if (!correction) {
      console.log(`${dateStr}: NO CORRECTION DATA — skipping`);
      continue;
    }

    const newTotal = correction.wc + correction.gnosis + correction.polygon + correction.bsc;
    const oldTotal = Number(snap.total);
    const diff = newTotal - oldTotal;

    const chainsJson = {
      worldchain: { supply: correction.wc, success: true },
      gnosis: { supply: correction.gnosis, success: correction.gnosis > 0 },
      polygon: { supply: correction.polygon, success: correction.polygon > 0 },
      bsc: { supply: correction.bsc, success: correction.bsc > 0 },
    };

    console.log(`${dateStr}: ${oldTotal.toLocaleString("es-CO")} → ${newTotal.toLocaleString("es-CO")} (${diff >= 0 ? "+" : ""}${diff.toLocaleString("es-CO")})`);

    await prisma.supplySnapshot.update({
      where: { id: snap.id },
      data: { total: newTotal, chainsJson },
    });
  }

  // Verify
  console.log("\n=== Updated Supply Snapshots ===\n");
  const updated = await prisma.supplySnapshot.findMany({
    where: { asset: "wCOP" },
    orderBy: { snapshotAt: "asc" },
  });
  for (const s of updated) {
    console.log(`${s.snapshotAt.toISOString().slice(0, 10)}: ${Number(s.total).toLocaleString("es-CO")} wCOP`);
  }

  await prisma.$disconnect();
})();
