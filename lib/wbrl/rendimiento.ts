// lib/wbrl/rendimiento.ts
// Calcula rendimiento del colateral wBRL basado en posiciones CDB.

export interface WbrlRendimiento {
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
  gananciaBruta: number;
  gananciaLiquida: number;
  pctPeriodoBruto: number;
  pctPeriodoLiquido: number;
  tnaBruto: number;
  tnaLiquido: number;
  teaBruto: number;
  teaLiquido: number;
  diasPeriodo: number;
  fechaInicio: string;
  fechaFin: string;
}

interface CdbPositionInput {
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
  esColateral: boolean;
}

export function calcularRendimientoWbrl(
  positions: CdbPositionInput[],
  fechaInicio: string,  // YYYY-MM-DD (inicio del periodo, ej: 01/01/2026)
  fechaFin: string      // YYYY-MM-DD (fecha del reporte)
): WbrlRendimiento {
  const colateral = positions.filter((p) => p.esColateral);

  const capitalInicial = colateral.reduce((s, p) => s + p.capitalInicial, 0);
  const valorBruto = colateral.reduce((s, p) => s + p.valorBruto, 0);
  const valorLiquido = colateral.reduce((s, p) => s + p.valorLiquido, 0);
  const ir = colateral.reduce((s, p) => s + p.ir, 0);

  const gananciaBruta = valorBruto - capitalInicial;
  const gananciaLiquida = valorLiquido - capitalInicial;

  const pctPeriodoBruto = capitalInicial > 0 ? gananciaBruta / capitalInicial : 0;
  const pctPeriodoLiquido = capitalInicial > 0 ? gananciaLiquida / capitalInicial : 0;

  const d0 = new Date(fechaInicio);
  const d1 = new Date(fechaFin);
  const diasPeriodo = Math.max(1, Math.round((d1.getTime() - d0.getTime()) / 86400000));

  // TNA = % periodo * 365 / dias
  const tnaBruto = pctPeriodoBruto * (365 / diasPeriodo);
  const tnaLiquido = pctPeriodoLiquido * (365 / diasPeriodo);

  // TEA = (1 + % periodo) ^ (365/dias) - 1
  const teaBruto = Math.pow(1 + pctPeriodoBruto, 365 / diasPeriodo) - 1;
  const teaLiquido = Math.pow(1 + pctPeriodoLiquido, 365 / diasPeriodo) - 1;

  return {
    capitalInicial,
    valorBruto,
    valorLiquido,
    ir,
    gananciaBruta,
    gananciaLiquida,
    pctPeriodoBruto,
    pctPeriodoLiquido,
    tnaBruto,
    tnaLiquido,
    teaBruto,
    teaLiquido,
    diasPeriodo,
    fechaInicio,
    fechaFin,
  };
}
