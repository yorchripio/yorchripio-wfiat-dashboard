// lib/geckoterminal/constants.ts
// Pools fijas a consultar en GeckoTerminal por token y chain

export interface FixedPool {
  networkId: string;
  poolAddress: string;
  label: string;
  token: "wARS" | "wBRL" | "wMXN" | "wCOP" | "wPEN" | "wCLP";
}

export const FIXED_POOLS: readonly FixedPool[] = [
  // ── wARS ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0xe7bba98b4e9c077d0af3b91b4ecfcdc68e3214917ed4e361ed28eb60e87ea6fa",
    label: "World Chain",
    token: "wARS",
  },
  {
    networkId: "eth",
    poolAddress: "0x4253a29f53068b8c8644e5e806dcd2059e1c9ff71ff3795c96ac1e5fa140ae19",
    label: "Ethereum",
    token: "wARS",
  },
  {
    networkId: "base",
    poolAddress: "0xc33b04272f95325a92becf481ff4f5d60b600e005830bfe14c0c6f4d93bd80cc",
    label: "Base",
    token: "wARS",
  },
  // ── wBRL ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0xa5d082e4e44bad1f20a5f20aaaa503e20003c908a6f09f32c1707f9ef39f105b",
    label: "World Chain",
    token: "wBRL",
  },
  {
    networkId: "eth",
    poolAddress: "0xe5f316c9fd528c7abd0a6ceb29257d481788ef43a8b12c7f94a8ade980cd032c",
    label: "Ethereum",
    token: "wBRL",
  },
  {
    networkId: "base",
    poolAddress: "0xe349d110fb52719252d4b5fc58635b9be685ebd06a263cd0eb65257285e61bf0",
    label: "Base",
    token: "wBRL",
  },
  // ── wMXN ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0x1df9684029d6f74fbea64552dff12876aa32fce68c9ec9988c36bbb09c3b74c2",
    label: "World Chain",
    token: "wMXN",
  },
  // ── wCOP ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0xe0854863879243f4d9f8585f42baa2b1bcb6d177fbad6e300fa3a3f8d0e16399",
    label: "World Chain",
    token: "wCOP",
  },
  // ── wPEN ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0x99f91095af6e853d7c9d627d1991156815e26f62884aaf8d72fecf8d63afd5f7",
    label: "World Chain",
    token: "wPEN",
  },
  // ── wCLP ──────────────────────────────────────────────
  {
    networkId: "world-chain",
    poolAddress: "0x6ceed000630ae473448c478afa4a08630c9d17c9775aa8b270839809ba195ece",
    label: "World Chain",
    token: "wCLP",
  },
] as const;
