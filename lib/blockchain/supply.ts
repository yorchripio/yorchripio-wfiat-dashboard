// lib/blockchain/supply.ts
// Funciones para consultar el supply de wARS en las 3 chains

import { ethers } from "ethers";
import { WARS_CONFIG, CHAINS, ERC20_ABI, type ChainName } from "./config";

// Tipo para el resultado de una chain individual
export interface ChainSupply {
  chain: ChainName;
  chainName: string;
  supply: number;
  supplyRaw: string;
  success: boolean;
  error?: string;
}

// Tipo para el resultado total
export interface TotalSupply {
  chains: Record<ChainName, ChainSupply>;
  total: number;
  totalFormatted: string;
  timestamp: string;
  allSuccessful: boolean;
}

const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 2;
/** RPCs públicos pueden ser lentos; 45s evita timeout antes de que respondan */
const CHAIN_REQUEST_TIMEOUT_MS = 45000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout después de ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function querySupplyFromRpc(
  chainName: ChainName,
  rpcUrl: string
): Promise<ChainSupply> {
  const chain = CHAINS[chainName];
  const provider = new ethers.JsonRpcProvider(rpcUrl, chain.id, {
    staticNetwork: true,
  });
  const contract = new ethers.Contract(
    WARS_CONFIG.address,
    ERC20_ABI,
    provider
  );
  const [supplyRaw, decimals]: [bigint, number] = await Promise.all([
    contract.totalSupply(),
    contract.decimals(),
  ]);

  console.log(
    `[Supply] ${chain.name}: rawSupply=${supplyRaw.toString()}, decimals=${decimals}, rpc=${rpcUrl}`
  );

  return {
    chain: chainName,
    chainName: chain.name,
    supply: Number(ethers.formatUnits(supplyRaw, decimals)),
    supplyRaw: supplyRaw.toString(),
    success: true,
  };
}

/**
 * Obtiene el supply de wARS en una chain específica.
 * Prueba múltiples RPCs configurados para esa chain en orden.
 */
async function getSupplyFromChain(chainName: ChainName): Promise<ChainSupply> {
  const chain = CHAINS[chainName];
  const rpcUrls = chain.rpcUrls.length > 0
    ? chain.rpcUrls
    : (chain.rpcUrl ? [chain.rpcUrl] : []);

  if (rpcUrls.length === 0) {
    return {
      chain: chainName,
      chainName: chain.name,
      supply: 0,
      supplyRaw: "0",
      success: false,
      error: `RPC URL no configurada para ${chain.name}`,
    };
  }

  const errors: string[] = [];
  for (const rpcUrl of rpcUrls) {
    try {
      return await withTimeout(
        querySupplyFromRpc(chainName, rpcUrl),
        CHAIN_REQUEST_TIMEOUT_MS
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      errors.push(`[${rpcUrl}] ${message}`);
      console.warn(`[Supply] ${chain.name} falló con RPC ${rpcUrl}: ${message}`);
    }
  }

  return {
    chain: chainName,
    chainName: chain.name,
    supply: 0,
    supplyRaw: "0",
    success: false,
    error: errors.join(" | "),
  };
}

/**
 * Obtiene el supply total de wARS sumando las 3 chains.
 * Reintenta hasta MAX_RETRIES veces las chains que fallen.
 */
export async function getTotalSupply(): Promise<TotalSupply> {
  const chainNames: ChainName[] = ["ethereum", "worldchain", "base"];
  const initialResults = await Promise.all(
    chainNames.map((name) => getSupplyFromChain(name))
  );

  const byName: Record<ChainName, ChainSupply> = {
    ethereum: initialResults[0],
    worldchain: initialResults[1],
    base: initialResults[2],
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const failed = chainNames.filter((name) => !byName[name].success);
    if (failed.length === 0) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    const retries = await Promise.all(failed.map((name) => getSupplyFromChain(name)));
    failed.forEach((name, i) => {
      if (retries[i].success) {
        byName[name] = retries[i];
      }
    });
  }

  const total = byName.ethereum.supply + byName.worldchain.supply + byName.base.supply;
  return {
    chains: byName,
    total,
    totalFormatted: total.toLocaleString("es-AR", {
      maximumFractionDigits: 0,
    }),
    timestamp: new Date().toISOString(),
    allSuccessful: chainNames.every((name) => byName[name].success),
  };
}

/**
 * Formatea un número de supply para mostrar en la UI.
 * Ej: 100000000 -> "100,000,000 wARS"
 */
export function formatSupply(supply: number): string {
  return `${supply.toLocaleString("es-AR", { maximumFractionDigits: 0 })} wARS`;
}