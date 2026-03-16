// instrumentation.ts
// Runs once when the Next.js server starts.
// Refreshes GeckoTerminal pool cache directly (no HTTP), then every 15 min.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const INTERVAL_MS = 15 * 60 * 1000;

    async function refreshPools() {
      try {
        const { refreshPoolCache } = await import("@/lib/geckoterminal/refresh-cache");
        await refreshPoolCache();
      } catch (err) {
        console.error("[instrumentation] Pool cache refresh failed:", err);
      }
    }

    // Initial refresh after 5s (let server finish starting)
    setTimeout(refreshPools, 5_000);

    // Then every 15 min
    setInterval(refreshPools, INTERVAL_MS);
  }
}
