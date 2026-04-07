// Check wCOP supply on BSC at historical dates
const { ethers } = require("ethers");

const TOKEN = "0x8a1d45e102e886510e891d2ec656a708991e2d76";
const ABI = ["function totalSupply() view returns (uint256)"];
const BSC_BLOCKS_PER_DAY = 28800; // ~3s per block

(async () => {
  const provider = new ethers.JsonRpcProvider(
    "https://bsc-dataseed.binance.org", 56, { staticNetwork: true }
  );
  const contract = new ethers.Contract(TOKEN, ABI, provider);
  const currentBlock = await provider.getBlockNumber();
  const now = new Date();

  console.log(`BSC current block: ${currentBlock} (${now.toISOString().slice(0, 10)})\n`);

  const targets = [
    { label: "01/10/2025", date: new Date("2025-10-01") },
    { label: "01/11/2025", date: new Date("2025-11-01") },
    { label: "01/12/2025", date: new Date("2025-12-01") },
    { label: "01/01/2026", date: new Date("2026-01-01") },
    { label: "08/01/2026", date: new Date("2026-01-08") },
    { label: "13/01/2026", date: new Date("2026-01-13") },
    { label: "01/02/2026", date: new Date("2026-02-01") },
    { label: "09/02/2026", date: new Date("2026-02-09") },
    { label: "28/02/2026", date: new Date("2026-02-28") },
    { label: "01/03/2026", date: new Date("2026-03-01") },
    { label: "07/03/2026", date: new Date("2026-03-07") },
    { label: "31/03/2026", date: new Date("2026-03-31") },
    { label: "07/04/2026 (hoy)", date: now },
  ];

  console.log("=== wCOP Supply en BSC (histórico) ===\n");

  for (const t of targets) {
    const daysAgo = Math.round((now.getTime() - t.date.getTime()) / 86400000);
    const targetBlock = currentBlock - (daysAgo * BSC_BLOCKS_PER_DAY);

    if (targetBlock < 1) {
      console.log(`${t.label}: chain didn't exist yet`);
      continue;
    }

    try {
      const raw = await contract.totalSupply({ blockTag: targetBlock });
      const supply = Number(ethers.formatUnits(raw, 18));
      console.log(`${t.label} (block ~${targetBlock}, ~${daysAgo}d ago): ${supply.toLocaleString("es-AR", { minimumFractionDigits: 2 })} wCOP`);
    } catch (e) {
      console.log(`${t.label} (block ~${targetBlock}): ERROR - ${e.message?.slice(0, 100)}`);
    }
  }

  // Also check Gnosis and Polygon history
  console.log("\n=== wCOP Supply en Gnosis (histórico) ===\n");
  const gnosisProvider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com", 100, { staticNetwork: true });
  const gnosisContract = new ethers.Contract(TOKEN, ABI, gnosisProvider);
  const gnosisBlock = await gnosisProvider.getBlockNumber();
  const GNOSIS_BPD = 17280; // ~5s per block

  for (const t of [
    { label: "01/01/2026", date: new Date("2026-01-01") },
    { label: "09/02/2026", date: new Date("2026-02-09") },
    { label: "07/03/2026", date: new Date("2026-03-07") },
    { label: "31/03/2026", date: new Date("2026-03-31") },
    { label: "07/04/2026", date: now },
  ]) {
    const daysAgo = Math.round((now.getTime() - t.date.getTime()) / 86400000);
    const block = gnosisBlock - (daysAgo * GNOSIS_BPD);
    try {
      const raw = await gnosisContract.totalSupply({ blockTag: block });
      const supply = Number(ethers.formatUnits(raw, 18));
      console.log(`${t.label} (block ~${block}): ${supply.toLocaleString("es-AR", { minimumFractionDigits: 2 })} wCOP`);
    } catch (e) {
      console.log(`${t.label}: ERROR - ${e.message?.slice(0, 100)}`);
    }
  }
})();
