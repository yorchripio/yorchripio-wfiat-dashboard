// instrumentation.ts
// Runs once when the Next.js server starts.
// Sets up a background interval to refresh the GeckoTerminal pool cache every 15 min.

export async function register() {
  // Only run on the server (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const INTERVAL_MS = 15 * 60 * 1000; // 15 min
    const BASE_URL = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
    const CRON_SECRET = process.env.CRON_SECRET;

    async function refreshPools() {
      try {
        const url = `${BASE_URL}/api/cron/refresh-pools`;
        const res = await fetch(url, {
          headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
        });
        const data = await res.json();
        console.log(`[instrumentation] Pool cache refresh: ok=${data.ok} failed=${data.failed}`);
      } catch (err) {
        console.error("[instrumentation] Pool cache refresh failed:", err);
      }
    }

    // Initial refresh after 10s (let server finish starting)
    setTimeout(refreshPools, 10_000);

    // Then every 15 min
    setInterval(refreshPools, INTERVAL_MS);
  }
}
