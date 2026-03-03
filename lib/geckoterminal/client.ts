// lib/geckoterminal/client.ts
// Cliente para GeckoTerminal API (server-side). Rate limit ~10 req/min.

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const ACCEPT_VERSION = "application/json;version=20230203";

async function fetchGecko<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: ACCEPT_VERSION },
    next: { revalidate: 60 }, // cache 1 min (API cache is 1 min)
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ??
      res.statusText;
    throw new Error(`GeckoTerminal: ${res.status} ${message}`);
  }

  return res.json() as Promise<T>;
}

export async function getNetworks(): Promise<import("./types").GeckoNetworksResponse> {
  return fetchGecko("/networks");
}

export async function getPool(
  networkId: string,
  poolAddress: string
): Promise<import("./types").GeckoPoolResponse> {
  const path = `/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(poolAddress)}`;
  return fetchGecko(path);
}
