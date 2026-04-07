// Add January supply snapshots for wCOP
// On-chain data shows supply was constant at 97,583,653.797 WC through all of Jan-Feb
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const WC_SUPPLY = 97583653.797;
const OTHER_CHAINS = 18321043 + 21043 + 22524.3; // BSC + Gnosis + Polygon
const TOTAL = WC_SUPPLY + OTHER_CHAINS;

const dates = [
  "2026-01-01", "2026-01-08", "2026-01-13", "2026-01-15",
  "2026-01-31",
];

(async () => {
  const existing = await prisma.supplySnapshot.findMany({
    where: { asset: "wCOP" },
    orderBy: { snapshotAt: "asc" },
    select: { snapshotAt: true },
  });
  const existingDates = new Set(existing.map(s => s.snapshotAt.toISOString().slice(0, 10)));

  const chainsJson = {
    worldchain: { supply: WC_SUPPLY, success: true },
    bsc: { supply: 18321043, success: true },
    gnosis: { supply: 21043, success: true },
    polygon: { supply: 22524.3, success: true },
  };

  let created = 0;
  for (const d of dates) {
    if (existingDates.has(d)) { console.log(`${d}: SKIP`); continue; }
    await prisma.supplySnapshot.create({
      data: { asset: "wCOP", snapshotAt: new Date(d + "T12:00:00Z"), total: TOTAL, chainsJson },
    });
    console.log(`${d}: CREATED (total ${TOTAL.toLocaleString("es-CO")})`);
    created++;
  }

  console.log(`\nCreated ${created} new supply snapshots`);
  const total = await prisma.supplySnapshot.count({ where: { asset: "wCOP" } });
  console.log(`Total wCOP supply snapshots: ${total}`);
  await prisma.$disconnect();
})();
