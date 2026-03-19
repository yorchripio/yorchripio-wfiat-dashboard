// instrumentation.ts
// Runs once when the Next.js server starts.
// 1. Refreshes GeckoTerminal pool cache directly (no HTTP), then every 15 min.
// 2. Takes daily supply + collateral snapshots (checks hourly, saves once per day).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const POOL_INTERVAL = 15 * 60 * 1000;    // 15 min
    const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // 1 hour

    async function refreshPools() {
      try {
        const { refreshPoolCache } = await import("@/lib/geckoterminal/refresh-cache");
        await refreshPoolCache();
      } catch (err) {
        console.error("[instrumentation] Pool cache refresh failed:", err);
      }
    }

    async function takeSnapshots() {
      try {
        const { takeSupplyAndCollateralSnapshots } = await import("@/lib/cron/snapshots");
        await takeSupplyAndCollateralSnapshots();
      } catch (err) {
        console.error("[instrumentation] Snapshot failed:", err);
      }
    }

    // Initial refresh after 5s (let server finish starting)
    setTimeout(refreshPools, 5_000);
    // Take snapshots 10s after start (catches up if missed)
    setTimeout(takeSnapshots, 10_000);

    // Then on intervals
    setInterval(refreshPools, POOL_INTERVAL);
    setInterval(takeSnapshots, SNAPSHOT_INTERVAL);
  }
}
