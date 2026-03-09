// lib/blockchain/config.ts
// Configuración de wARS y las blockchains soportadas

export const WARS_CONFIG = {
  name: "Wrapped Argentine Peso",
  symbol: "wARS",
  address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
  decimals: 18,
} as const;

function parseRpcUrls(primary: string | undefined, fallbacks: string | undefined): string[] {
  const all = [
    primary ?? "",
    ...(fallbacks?.split(",") ?? []),
  ]
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return Array.from(new Set(all));
}

const ethereumRpcUrls = parseRpcUrls(
  process.env.ETHEREUM_RPC,
  process.env.ETHEREUM_RPCS
);
const worldchainRpcUrls = parseRpcUrls(
  process.env.WORLDCHAIN_RPC,
  process.env.WORLDCHAIN_RPCS
);
const baseRpcUrls = parseRpcUrls(
  process.env.BASE_RPC,
  process.env.BASE_RPCS
);

export const CHAINS = {
  ethereum: {
    id: 1,
    name: "Ethereum",
    rpcUrl: ethereumRpcUrls[0] ?? "",
    rpcUrls: ethereumRpcUrls,
    explorerUrl: "https://etherscan.io",
    color: "#627EEA",
  },
  worldchain: {
    id: 480,
    name: "Worldchain",
    rpcUrl: worldchainRpcUrls[0] ?? "",
    rpcUrls: worldchainRpcUrls,
    explorerUrl: "https://worldscan.org",
    color: "#010103",
  },
  base: {
    id: 8453,
    name: "Base",
    rpcUrl: baseRpcUrls[0] ?? "",
    rpcUrls: baseRpcUrls,
    explorerUrl: "https://basescan.org",
    color: "#0052FF",
  },
} as const;

export type ChainName = keyof typeof CHAINS;

export const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
] as const;