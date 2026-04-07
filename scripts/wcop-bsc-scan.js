// Find wCOP transfers on BSC using Etherscan V2 API
const https = require("https");

const TOKEN = "0x8a1d45e102e886510e891d2ec656a708991e2d76";

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: data.slice(0, 500) }); }
      });
    }).on("error", reject);
  });
}

(async () => {
  // Etherscan V2 unified API
  const url = `https://api.etherscan.io/v2/api?chainid=56&module=account&action=tokentx&contractaddress=${TOKEN}&startblock=0&endblock=99999999&sort=asc&page=1&offset=200`;

  console.log("=== wCOP Token Transfers on BSC (Etherscan V2) ===\n");

  const resp = await fetch(url);

  if (resp.status !== "1" || !resp.result?.length) {
    console.log("API response:", JSON.stringify(resp).slice(0, 500));
    console.log("\nTrying alternative: Worldchain mints/burns to trace bridging...\n");

    // Let's check Worldchain transfer events instead - we know these work
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider(
      "https://worldchain-mainnet.g.alchemy.com/public", 480, { staticNetwork: true }
    );
    const abi = ["event Transfer(address indexed from, address indexed to, uint256 value)"];
    const contract = new ethers.Contract(TOKEN, abi, provider);
    const currentBlock = await provider.getBlockNumber();

    // Search from Jan 1 2026 (~96 days ago)
    const fromBlock = currentBlock - (96 * 43200);
    console.log(`Worldchain: searching blocks ${fromBlock} to ${currentBlock}...\n`);

    // Get ALL transfers (not just mints) to find bridge activity
    const ZERO = "0x0000000000000000000000000000000000000000";

    // Mints first
    console.log("--- MINTS (from 0x0) ---");
    const mintFilter = contract.filters.Transfer(ZERO);
    const mints = await contract.queryFilter(mintFilter, fromBlock, currentBlock);
    for (const e of mints) {
      const block = await e.getBlock();
      const date = new Date(block.timestamp * 1000).toISOString().slice(0, 16);
      const amount = Number(ethers.formatUnits(e.args[2], 18));
      console.log(`${date} | block ${e.blockNumber} | MINT ${amount.toLocaleString("es-AR")} → ${e.args[1].slice(0, 14)}...`);
    }

    // Burns
    console.log("\n--- BURNS (to 0x0) ---");
    const burnFilter = contract.filters.Transfer(null, ZERO);
    const burns = await contract.queryFilter(burnFilter, fromBlock, currentBlock);
    for (const e of burns) {
      const block = await e.getBlock();
      const date = new Date(block.timestamp * 1000).toISOString().slice(0, 16);
      const amount = Number(ethers.formatUnits(e.args[2], 18));
      console.log(`${date} | block ${e.blockNumber} | BURN ${amount.toLocaleString("es-AR")} ← ${e.args[0].slice(0, 14)}...`);
    }

    console.log(`\nTotal: ${mints.length} mints, ${burns.length} burns on Worldchain`);
    return;
  }

  // Process results
  const ZERO = "0x0000000000000000000000000000000000000000";
  let totalMinted = 0, totalBurned = 0;

  for (const tx of resp.result) {
    const date = new Date(parseInt(tx.timeStamp) * 1000).toISOString().slice(0, 16);
    const amount = Number(tx.value) / 1e18;
    const isMint = tx.from.toLowerCase() === ZERO;
    const isBurn = tx.to.toLowerCase() === ZERO;
    const type = isMint ? "MINT" : isBurn ? "BURN" : "XFER";
    if (isMint) totalMinted += amount;
    if (isBurn) totalBurned += amount;
    console.log(`${date} | ${type} | ${amount.toLocaleString("es-AR")} wCOP | from: ${tx.from.slice(0, 10)} → to: ${tx.to.slice(0, 10)}`);
  }

  console.log(`\nTotal minted on BSC: ${totalMinted.toLocaleString("es-AR")} wCOP`);
  console.log(`Total burned on BSC: ${totalBurned.toLocaleString("es-AR")} wCOP`);
  console.log(`Net: ${(totalMinted - totalBurned).toLocaleString("es-AR")} wCOP`);
})();
