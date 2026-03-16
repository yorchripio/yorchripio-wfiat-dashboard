// lib/blockchain/config.ts
// Configuración de tokens wFIAT y las blockchains soportadas

export const WARS_CONFIG = {
  name: "Wrapped Argentine Peso",
  symbol: "wARS",
  address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
  decimals: 18,
} as const;

export const WBRL_CONFIG = {
  name: "Wrapped Brazilian Real",
  symbol: "wBRL",
  address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
  decimals: 18,
} as const;

export const WMXN_CONFIG = {
  name: "Wrapped Mexican Peso",
  symbol: "wMXN",
  address: "0x337e7456b420bd3481e7fa61fa9850343d610d34", // World Chain only
  decimals: 18,
  // Only deployed on World Chain
  chainAddresses: {
    ethereum: "",
    worldchain: "0x337e7456b420bd3481e7fa61fa9850343d610d34",
    base: "",
  },
} as const;

export const WCOP_CONFIG = {
  name: "Wrapped Colombian Peso",
  symbol: "wCOP",
  address: "0x8a1d45e102e886510e891d2ec656a708991e2d76", // World Chain only
  decimals: 18,
  chainAddresses: {
    ethereum: "",
    worldchain: "0x8a1d45e102e886510e891d2ec656a708991e2d76",
    base: "",
  },
} as const;

export const WPEN_CONFIG = {
  name: "Wrapped Peruvian Sol",
  symbol: "wPEN",
  address: "0x4f34c8b3b5fb6d98da888f0fea543d4d9c9f2ebe", // World Chain only
  decimals: 18,
  chainAddresses: {
    ethereum: "",
    worldchain: "0x4f34c8b3b5fb6d98da888f0fea543d4d9c9f2ebe",
    base: "",
  },
} as const;

export const TOKEN_CONFIGS = {
  wARS: WARS_CONFIG,
  wBRL: WBRL_CONFIG,
  wMXN: WMXN_CONFIG,
  wCOP: WCOP_CONFIG,
  wPEN: WPEN_CONFIG,
} as const;

export type AssetSymbol = keyof typeof TOKEN_CONFIGS;

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