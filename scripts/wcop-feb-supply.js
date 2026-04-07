// Check wCOP supply at key February dates
const { ethers } = require("ethers");

const TOKEN = "0x8a1d45e102e886510e891d2ec656a708991e2d76";
const ABI = ["function totalSupply() view returns (uint256)"];
const WC_BLOCKS_PER_DAY = 43200;

(async () => {
  const provider = new ethers.JsonRpcProvider(
    "https://worldchain-mainnet.g.alchemy.com/public", 480, { staticNetwork: true }
  );
  const contract = new ethers.Contract(TOKEN, ABI, provider);
  const currentBlock = await provider.getBlockNumber();
  const now = new Date();

  console.log(`Current block: ${currentBlock} (${now.toISOString().slice(0, 10)})\n`);

  const targets = [
    { label: "01/02/2026", date: new Date("2026-02-01") },
    { label: "08/02/2026", date: new Date("2026-02-08") },
    { label: "09/02/2026", date: new Date("2026-02-09") }, // The mint day!
    { label: "10/02/2026", date: new Date("2026-02-10") },
    { label: "15/02/2026", date: new Date("2026-02-15") },
    { label: "28/02/2026", date: new Date("2026-02-28") },
    { label: "01/03/2026", date: new Date("2026-03-01") },
    { label: "03/03/2026", date: new Date("2026-03-03") },
    { label: "07/03/2026", date: new Date("2026-03-07") },
    { label: "31/03/2026", date: new Date("2026-03-31") },
    { label: "07/04/2026", date: new Date("2026-04-07") },
  ];

  console.log("=== wCOP Supply (Worldchain) at Historical Dates ===\n");

  for (const t of targets) {
    const daysAgo = Math.round((now.getTime() - t.date.getTime()) / 86400000);
    const targetBlock = currentBlock - (daysAgo * WC_BLOCKS_PER_DAY);

    if (targetBlock < 0) {
      console.log(`${t.label}: chain didn't exist yet`);
      continue;
    }

    try {
      const raw = await contract.totalSupply({ blockTag: targetBlock });
      const supply = Number(ethers.formatUnits(raw, 18));
      console.log(`${t.label} (block ~${targetBlock}): ${supply.toLocaleString("es-AR", { minimumFractionDigits: 2 })} wCOP`);
    } catch (e) {
      console.log(`${t.label} (block ~${targetBlock}): ERROR - ${e.message.slice(0, 80)}`);
    }
  }

  // Also check other chains current
  console.log("\n=== Other Chains (current) ===");
  const others = [
    { name: "gnosis", rpc: "https://rpc.gnosischain.com", id: 100 },
    { name: "polygon", rpc: "https://polygon-bor-rpc.publicnode.com", id: 137 },
    { name: "bsc", rpc: "https://bsc-dataseed.binance.org", id: 56 },
  ];
  for (const c of others) {
    try {
      const p = new ethers.JsonRpcProvider(c.rpc, c.id, { staticNetwork: true });
      const ct = new ethers.Contract(TOKEN, ABI, p);
      const raw = await ct.totalSupply();
      console.log(`${c.name}: ${Number(ethers.formatUnits(raw, 18)).toLocaleString("es-AR", { minimumFractionDigits: 2 })} wCOP`);
    } catch (e) {
      console.log(`${c.name}: ERROR - ${e.message?.slice(0, 80)}`);
    }
  }
})();
