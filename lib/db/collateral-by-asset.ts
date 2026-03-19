// lib/db/collateral-by-asset.ts
// Funciones de collateral por asset extraídas del dashboard route para reuso
// (dashboard + report PDF las necesitan)

import { prisma } from "@/lib/db";
import { getTotalSupply } from "@/lib/blockchain/supply";
import { getPenBalance } from "@/lib/wpen/buda-client";
import { type ColateralData } from "@/lib/sheets/collateral";

/** Build ColateralData for wMXN from fund positions in DB. */
export async function getWmxnCollateralData(): Promise<ColateralData | null> {
  const latest = await prisma.wmxnFundPosition.findFirst({
    orderBy: { fechaReporte: "desc" },
  });
  if (!latest) return null;

  const valorCartera = Number(latest.valorCartera);
  const rendAnual = latest.rendimientoAnual ? Number(latest.rendimientoAnual) / 100 : 0;
  const dailyRate = rendAnual > 0 ? Math.pow(1 + rendAnual, 1 / 365) - 1 : 0;

  const fechaReporte = latest.fechaReporte.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const daysSince = Math.max(0, Math.round(
    (new Date(today + "T00:00:00Z").getTime() - new Date(fechaReporte + "T00:00:00Z").getTime()) / 86400000
  ));

  const valorEstimado = daysSince > 0 && dailyRate > 0
    ? valorCartera * Math.pow(1 + dailyRate, daysSince)
    : valorCartera;

  const isEstimated = daysSince > 0 && dailyRate > 0;
  const rendDiario = dailyRate * 100;
  const label = isEstimated
    ? `Fondo de Inversión REGIO1 Serie ${latest.serie} (est. +${daysSince}d)`
    : `Fondo de Inversión REGIO1 Serie ${latest.serie}`;

  return {
    fecha: today,
    instrumentos: [
      {
        id: "fondo-regio1",
        nombre: label,
        tipo: "FCI" as const,
        entidad: "Banregio (GBM)",
        valorTotal: valorEstimado,
        porcentaje: 100,
        rendimientoDiario: rendDiario,
        activo: true,
      },
    ],
    total: valorEstimado,
    totalFormatted: `$ ${valorEstimado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}

/** Build ColateralData for wCOP from account snapshots in DB. */
export async function getWcopCollateralData(): Promise<ColateralData | null> {
  const latest = await prisma.wcopAccountSnapshot.findFirst({
    orderBy: { fechaCorte: "desc" },
  });
  if (!latest) return null;

  const capitalWcop = Number(latest.capitalWcop);
  const rendimientos = Number(latest.rendimientos);
  const colateralWC = capitalWcop + rendimientos;

  let ethBaseCapital = 0;
  let ethBaseInterest = 0;
  const MINT_DATE = "2026-02-26";
  try {
    const supplyData = await getTotalSupply("wCOP");
    const ethSupply = supplyData.chains.ethereum.success ? supplyData.chains.ethereum.supply : 0;
    const baseSupply = supplyData.chains.base.success ? supplyData.chains.base.supply : 0;
    ethBaseCapital = ethSupply + baseSupply;

    if (ethBaseCapital > 0) {
      const tna = 0.0913;
      const dailyRate = Math.pow(1 + tna, 1 / 365) - 1;
      const today = new Date().toISOString().slice(0, 10);
      const daysSinceMint = Math.max(0, Math.round(
        (new Date(today + "T00:00:00Z").getTime() - new Date(MINT_DATE + "T00:00:00Z").getTime()) / 86400000
      ));
      ethBaseInterest = ethBaseCapital * (Math.pow(1 + dailyRate, daysSinceMint) - 1);
    }
  } catch (err) {
    console.error("[wCOP collateral] Error fetching ETH+Base supply:", err);
  }

  const colateralTotal = colateralWC + ethBaseCapital + ethBaseInterest;
  const rendDiario = capitalWcop > 0 ? ((rendimientos / capitalWcop) / 30) * 100 : 0;

  const instrumentos = [
    {
      id: "cuenta-ahorro-finandina",
      nombre: "Cuenta de Ahorro (World Chain)",
      tipo: "Cuenta_Remunerada" as const,
      entidad: "Banco Finandina",
      valorTotal: colateralWC,
      porcentaje: colateralTotal > 0 ? (colateralWC / colateralTotal) * 100 : 100,
      rendimientoDiario: rendDiario,
      activo: true,
    },
  ];

  if (ethBaseCapital > 0) {
    instrumentos.push({
      id: "finandina-eth-base",
      nombre: "Cuenta de Ahorro (ETH+Base)",
      tipo: "Cuenta_Remunerada" as const,
      entidad: "Banco Finandina",
      valorTotal: ethBaseCapital + ethBaseInterest,
      porcentaje: colateralTotal > 0 ? ((ethBaseCapital + ethBaseInterest) / colateralTotal) * 100 : 0,
      rendimientoDiario: rendDiario,
      activo: true,
    });
  }

  return {
    fecha: latest.fechaCorte.toISOString().slice(0, 10),
    instrumentos,
    total: colateralTotal,
    totalFormatted: `$ ${Math.round(colateralTotal).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}

/** Build ColateralData for wPEN from Buda.com balance (no yield) */
export async function getWpenCollateralData(): Promise<ColateralData | null> {
  try {
    const balance = await getPenBalance();
    if (balance.amount <= 0) return null;

    const today = new Date().toISOString().slice(0, 10);
    return {
      fecha: today,
      instrumentos: [
        {
          id: "buda-pen",
          nombre: "Saldo a la Vista",
          tipo: "A_la_Vista" as const,
          entidad: "Buda.com (Exchange)",
          valorTotal: balance.amount,
          porcentaje: 100,
          rendimientoDiario: 0,
          activo: true,
        },
      ],
      total: balance.amount,
      totalFormatted: `S/ ${balance.amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
      timestamp: new Date().toISOString(),
      rendimientoCartera: 0,
    };
  } catch (err) {
    console.error("[wPEN collateral] Error:", err);
    return null;
  }
}

/** Build ColateralData for wCLP from BCI account snapshot (DB) */
export async function getWclpCollateralData(): Promise<ColateralData | null> {
  try {
    const bciSnapshot = await prisma.wclpAccountSnapshot.findFirst({
      orderBy: { fechaCorte: "desc" },
    });
    if (!bciSnapshot) return null;

    const total = Number(bciSnapshot.saldoFinal);
    const fecha = bciSnapshot.fechaCorte.toISOString().slice(0, 10);

    return {
      fecha,
      instrumentos: [
        {
          id: "bci-cta-cte",
          nombre: "Cuenta Corriente",
          tipo: "A_la_Vista" as const,
          entidad: "Banco BCI",
          valorTotal: total,
          porcentaje: 100,
          rendimientoDiario: 0,
          activo: true,
        },
      ],
      total,
      totalFormatted: `$ ${Math.round(total).toLocaleString("es-CL")}`,
      timestamp: new Date().toISOString(),
      rendimientoCartera: 0,
    };
  } catch (err) {
    console.error("[wCLP collateral] Error:", err);
    return null;
  }
}

/** Build ColateralData for wBRL from CDB positions in DB */
export async function getWbrlCollateralData(): Promise<ColateralData | null> {
  const latestPos = await prisma.wbrlCdbPosition.findFirst({
    where: { esColateral: true },
    orderBy: { fechaPosicao: "desc" },
    select: { fechaPosicao: true },
  });
  if (!latestPos) return null;

  const positions = await prisma.wbrlCdbPosition.findMany({
    where: { fechaPosicao: latestPos.fechaPosicao, esColateral: true },
    orderBy: { capitalInicial: "desc" },
  });

  const totalBruto = positions.reduce((s, p) => s + Number(p.valorBruto), 0);
  const totalCapital = positions.reduce((s, p) => s + Number(p.capitalInicial), 0);
  const rendDiario = totalCapital > 0 ? (((totalBruto / totalCapital) - 1) / 365) * 100 : 0;

  const fecha = latestPos.fechaPosicao.toISOString().slice(0, 10);

  return {
    fecha,
    instrumentos: [
      {
        id: "cdb-cdi-99",
        nombre: `CDB 99% CDI (${positions.length} posiciones)`,
        tipo: "CDB" as const,
        entidad: positions[0]?.emisor ?? "Banco Genial",
        valorTotal: totalBruto,
        porcentaje: 100,
        rendimientoDiario: rendDiario,
        activo: true,
      },
    ],
    total: totalBruto,
    totalFormatted: `R$ ${totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    timestamp: new Date().toISOString(),
    rendimientoCartera: rendDiario,
  };
}
