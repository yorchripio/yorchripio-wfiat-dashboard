// lib/wbrl/parse-extrato.ts
// Parsea el XLSX de "Extrato de Conta Corrente" de Banco Genial.

import * as XLSX from "xlsx";

export interface ExtratoMovimiento {
  fecha: string;      // YYYY-MM-DD
  descripcion: string;
  valor: number;       // Positivo = crédito, negativo = débito
}

function parseBrDate(s: string): string {
  // "11/03/2026" -> "2026-03-11"
  const parts = s.trim().split("/");
  if (parts.length !== 3) return s;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseBrlValue(s: string): number {
  // "R$\xa00,50" or "-R$\xa0100.000,00" -> number
  const cleaned = s.replace(/R\$/g, "").replace(/\xa0/g, " ").trim();
  const isNeg = cleaned.startsWith("-");
  const abs = cleaned.replace("-", "").trim();
  const normalized = abs.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(normalized);
  return isNeg ? -val : val;
}

export function parseExtratoConta(buffer: Buffer | Uint8Array): ExtratoMovimiento[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
  });

  const movimientos: ExtratoMovimiento[] = [];

  // Skip header rows, find data rows with dates
  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const col0 = String(row[0] ?? "").trim();
    // Check if first column is a date DD/MM/YYYY
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(col0)) continue;

    const descripcion = String(row[1] ?? "").trim();
    const valorStr = String(row[2] ?? "").trim();
    if (!descripcion || !valorStr) continue;

    movimientos.push({
      fecha: parseBrDate(col0),
      descripcion,
      valor: parseBrlValue(valorStr),
    });
  }

  return movimientos;
}
