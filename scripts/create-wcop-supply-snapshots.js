// Create historical supply snapshots for wCOP from on-chain data
// WC supply was verified constant at 97,583,653.797 from Feb 1 through Mar 3,
// then small burns brought it down
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Historical supply data from on-chain queries
// WC supply + estimated other chains
const WC_SUPPLY = {
  "2026-02-01": 97583653.797,
  "2026-02-09": 97583653.797,
  "2026-02-15": 97583653.797,
  "2026-02-28": 97583653.797,
  "2026-03-01": 97583653.797,
  "2026-03-03": 97583653.797,
  "2026-03-07": 97582172.497,
  "2026-03-16": 97522043.497, // after burns on 3/10, 3/11
  "2026-03-31": 97522043.497,
};

// Other chains (approximate — these don't change much)
// BSC: 18,321,043, Gnosis: 21,043, Polygon: 22,524
const OTHER_CHAINS = 18321043 + 21043 + 22524; // = 18,364,610

(async () => {
  console.log("=== Creating wCOP Supply Snapshots ===\n");

  // Check existing
  const existing = await prisma.supplySnapshot.findMany({
    where: { asset: "wCOP" },
    orderBy: { snapshotAt: "asc" },
  });
  console.log(`Existing supply snapshots: ${existing.length}`);
  for (const s of existing) {
    console.log(`  ${s.snapshotAt.toISOString().slice(0, 10)}: ${Number(s.total).toLocaleString("es-CO")}`);
  }

  const created = [];
  for (const [dateStr, wcSupply] of Object.entries(WC_SUPPLY)) {
    const snapshotAt = new Date(dateStr + "T12:00:00Z");
    const total = wcSupply + OTHER_CHAINS;

    // Check if already exists
    const existsForDate = existing.find(s =>
      s.snapshotAt.toISOString().slice(0, 10) === dateStr
    );
    if (existsForDate) {
      console.log(`  ${dateStr}: SKIP (already exists)`);
      continue;
    }

    const chainsJson = {
      worldchain: { supply: wcSupply, success: true },
      bsc: { supply: 18321043, success: true },
      gnosis: { supply: 21043, success: true },
      polygon: { supply: 22524.3, success: true },
    };

    await prisma.supplySnapshot.create({
      data: {
        asset: "wCOP",
        snapshotAt,
        total,
        chainsJson,
      },
    });
    created.push(dateStr);
    console.log(`  ${dateStr}: CREATED — total ${total.toLocaleString("es-CO")}`);
  }

  console.log(`\nCreated ${created.length} new supply snapshots`);

  // Verify
  const all = await prisma.supplySnapshot.findMany({
    where: { asset: "wCOP" },
    orderBy: { snapshotAt: "asc" },
  });
  console.log(`\nTotal wCOP supply snapshots: ${all.length}`);
  for (const s of all) {
    console.log(`  ${s.snapshotAt.toISOString().slice(0, 10)}: ${Number(s.total).toLocaleString("es-CO")}`);
  }

  await prisma.$disconnect();
})();
