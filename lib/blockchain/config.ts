// lib/blockchain/config.ts
// Configuración de wARS y las blockchains soportadas

export const WARS_CONFIG = {
  name: "Wrapped Argentine Peso",
  symbol: "wARS",
  address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
  decimals: 18,
} as const;

export const CHAINS = {
  ethereum: {
    id: 1,
    name: "Ethereum",
    rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC || "",
    explorerUrl: "https://etherscan.io",
    color: "#627EEA",
  },
  worldchain: {
    id: 480,
    name: "Worldchain",
    rpcUrl: process.env.NEXT_PUBLIC_WORLDCHAIN_RPC || "",
    explorerUrl: "https://worldscan.org",
    color: "#010103",
  },
  base: {
    id: 8453,
    name: "Base",
    rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC || "",
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