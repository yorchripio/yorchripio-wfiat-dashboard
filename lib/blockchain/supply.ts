// lib/blockchain/supply.ts
// Funciones para consultar el supply de wARS en las 3 chains

import { ethers } from "ethers";
import { WARS_CONFIG, CHAINS, ERC20_ABI, type ChainName } from "./config";

// Tipo para el resultado de una chain individual
export interface ChainSupply {
  chain: ChainName;
  chainName: string;
  supply: number;
  supplyRaw: string; // Cambiar de bigint a string
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

/**
 * Obtiene el supply de wARS en una chain específica
 * 
 * ¿Qué hace esta función?
 * 1. Crea una conexión a la blockchain usando el RPC provider
 * 2. Crea una instancia del contrato wARS
 * 3. Llama a totalSupply() para obtener cuántos tokens existen
 * 4. Convierte de Wei (número gigante) a unidades normales
 */
async function getSupplyFromChain(chainName: ChainName): Promise<ChainSupply> {
  const chain = CHAINS[chainName];
  
  try {
    // 1. Verificar que tenemos RPC URL
    if (!chain.rpcUrl) {
      throw new Error(`RPC URL no configurada para ${chain.name}`);
    }

    // 2. Crear provider (conexión a la blockchain)
    // Es como abrir una "línea telefónica" con la blockchain
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);

    // 3. Crear instancia del contrato
    // Le decimos: "quiero hablar con este contrato, y estas son las funciones que tiene"
    const contract = new ethers.Contract(
      WARS_CONFIG.address,
      ERC20_ABI,
      provider
    );

    // 4. Llamar a totalSupply()
    // Esto consulta la blockchain y nos dice cuántos tokens wARS existen
    const supplyRaw: bigint = await contract.totalSupply();

    // 5. Convertir de Wei a unidades normales
    // El contrato devuelve un número enorme (con 18 decimales)
    // Ej: 100000000000000000000000000 = 100,000,000 wARS
    const supply = Number(ethers.formatUnits(supplyRaw, WARS_CONFIG.decimals));

    return {
        chain: chainName,
        chainName: chain.name,
        supply,
        supplyRaw: supplyRaw.toString(), // Convertir BigInt a string
        success: true,
        };

  } catch (error) {
    // Si algo falla, devolvemos el error pero no rompemos todo
    console.error(`Error consultando ${chain.name}:`, error);
    
    return {
        chain: chainName,
        chainName: chain.name,
        supply: 0,
        supplyRaw: "0", // String en vez de BigInt
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        };
  }
}

/**
 * Obtiene el supply total de wARS sumando las 3 chains
 * 
 * Usa Promise.all para consultar las 3 chains EN PARALELO
 * Esto es más rápido que consultar una por una
 */
export async function getTotalSupply(): Promise<TotalSupply> {
  // Consultar las 3 chains al mismo tiempo
  const [ethereum, worldchain, base] = await Promise.all([
    getSupplyFromChain("ethereum"),
    getSupplyFromChain("worldchain"),
    getSupplyFromChain("base"),
  ]);

  // Sumar los supplies
  const total = ethereum.supply + worldchain.supply + base.supply;

  // Formatear el total con separador de miles (formato argentino)
  const totalFormatted = total.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });

  return {
    chains: {
      ethereum,
      worldchain,
      base,
    },
    total,
    totalFormatted,
    timestamp: new Date().toISOString(),
    allSuccessful: ethereum.success && worldchain.success && base.success,
  };
}

/**
 * Formatea un número de supply para mostrar en la UI
 * Ej: 100000000 → "100,000,000 wARS"
 */
export function formatSupply(supply: number): string {
  return `${supply.toLocaleString("es-AR", { maximumFractionDigits: 0 })} wARS`;
}