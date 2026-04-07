// Find wCOP mint/transfer events on BSC via BscScan API
const https = require("https");

const TOKEN = "0x8a1d45e102e886510e891d2ec656a708991e2d76";
const ZERO = "0x0000000000000000000000000000000000000000";

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

(async () => {
  // BscScan: get token transfer events (mints = from 0x0)
  const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${TOKEN}&startblock=0&endblock=99999999&sort=asc&page=1&offset=100`;

  console.log("=== wCOP Token Transfers on BSC ===\n");
  console.log("Fetching from BscScan API...\n");

  const resp = await fetch(url);

  if (resp.status !== "1" || !resp.result?.length) {
    console.log("No results or API error:", resp.message, resp.result);

    // Fallback: try with ethers event logs
    console.log("\n=== Fallback: query Transfer events via RPC ===\n");
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org", 56, { staticNetwork: true });
    const abi = ["event Transfer(address indexed from, address indexed to, uint256 value)"];
    const contract = new ethers.Contract(TOKEN, abi, provider);

    const currentBlock = await provider.getBlockNumber();
    // Search last 30 days (~864000 blocks)
    const fromBlock = currentBlock - 864000;

    console.log(`Searching blocks ${fromBlock} to ${currentBlock}...\n`);

    try {
      const filter = contract.filters.Transfer(ZERO); // Mints only
      const events = await contract.queryFilter(filter, fromBlock, currentBlock);
      console.log(`Found ${events.length} mint events\n`);

      for (const e of events) {
        const block = await e.getBlock();
        const date = new Date(block.timestamp * 1000).toISOString().slice(0, 16);
        const amount = Number(ethers.formatUnits(e.args[2], 18));
        console.log(`${date} | block ${e.blockNumber} | to: ${e.args[1].slice(0, 10)}... | ${amount.toLocaleString("es-AR")} wCOP`);
      }
    } catch (err) {
      console.log("Event query error:", err.message?.slice(0, 200));

      // Try smaller range
      console.log("\nTrying last 7 days...\n");
      const from7d = currentBlock - 201600;
      try {
        const filter = contract.filters.Transfer(ZERO);
        const events = await contract.queryFilter(filter, from7d, currentBlock);
        console.log(`Found ${events.length} mint events in last 7 days\n`);
        for (const e of events) {
          const block = await e.getBlock();
          const date = new Date(block.timestamp * 1000).toISOString().slice(0, 16);
          const amount = Number(ethers.formatUnits(e.args[2], 18));
          console.log(`${date} | block ${e.blockNumber} | to: ${e.args[1].slice(0, 10)}... | ${amount.toLocaleString("es-AR")} wCOP`);
        }
      } catch (err2) {
        console.log("Error:", err2.message?.slice(0, 200));
      }
    }

    // Also check ALL transfers (not just mints)
    console.log("\n=== All transfers (last 3 days) ===\n");
    const from3d = currentBlock - 86400;
    try {
      const filterAll = contract.filters.Transfer();
      const events = await contract.queryFilter(filterAll, from3d, currentBlock);
      console.log(`Found ${events.length} transfer events in last 3 days\n`);
      for (const e of events.slice(0, 20)) {
        const amount = Number(ethers.formatUnits(e.args[2], 18));
        const isMint = e.args[0] === ZERO;
        const isBurn = e.args[1] === ZERO;
        const type = isMint ? "MINT" : isBurn ? "BURN" : "TRANSFER";
        console.log(`block ${e.blockNumber} | ${type} | ${amount.toLocaleString("es-AR")} wCOP | from: ${e.args[0].slice(0, 10)}... → to: ${e.args[1].slice(0, 10)}...`);
      }
    } catch (err) {
      console.log("Error:", err.message?.slice(0, 200));
    }
    return;
  }

  // Process BscScan results
  for (const tx of resp.result) {
    const date = new Date(tx.timeStamp * 1000).toISOString().slice(0, 16);
    const amount = Number(tx.value) / 1e18;
    const isMint = tx.from === ZERO;
    const isBurn = tx.to === ZERO;
    const type = isMint ? "MINT" : isBurn ? "BURN" : "TRANSFER";
    console.log(`${date} | ${type} | ${amount.toLocaleString("es-AR")} wCOP | ${tx.from.slice(0, 10)} → ${tx.to.slice(0, 10)}`);
  }
})();
