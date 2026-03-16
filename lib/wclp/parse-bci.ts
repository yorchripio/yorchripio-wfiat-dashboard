// lib/wclp/parse-bci.ts
// Parsea extractos BCI (MOVCTACTE xlsx) para wCLP colateral.
// Sheet: "Cuenta-Corriente", headers fila 14, data fila 15+.

import * as XLSX from "xlsx";

export interface BciTransaction {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  cargo: number;
  abono: number;
  saldo: number;
}

export interface BciSummary {
  periodoInicio: string; // YYYY-MM-DD
  periodoFin: string;
  saldoFinal: number;
  totalAbonos: number;
  totalCargos: number;
  transactions: BciTransaction[];
}

export function parseBciExtracto(buffer: ArrayBuffer): BciSummary {
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("cuenta-corriente") || n.toLowerCase().includes("cuenta corriente")) ??
    wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("No se encontró la hoja del extracto BCI");

  // Read all rows as array of arrays
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find header row (contains "Fecha", "Descripcion", etc.)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const joined = row.map((c) => String(c).toLowerCase()).join("|");
    if (joined.includes("fecha") && (joined.includes("descripci") || joined.includes("detalle")) && joined.includes("saldo")) {
      headerIdx = i;
      break;
    }
  }

  // Extract period from "Rango de fecha" row (e.g., "01/02/2026 - 28/02/2026 - Contable (*)")
  let periodoInicio = "";
  let periodoFin = "";
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const first = String(row[0] ?? "").toLowerCase();
    if (first.includes("rango de fecha") || first.includes("periodo")) {
      const val = String(row[1] ?? "");
      const match = val.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
      if (match) {
        periodoInicio = parseDate(match[1]) ?? "";
        periodoFin = parseDate(match[2]) ?? "";
      }
    }
  }

  // Extract saldo from "CLP Disponible" area (row after it has numeric value in col 0)
  let saldoMetadata = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const first = String(row[0] ?? "").toLowerCase();
    if (first.includes("clp disponible")) {
      // The next row has the numeric saldo in column 0
      const nextRow = rows[i + 1];
      if (Array.isArray(nextRow) && typeof nextRow[0] === "number") {
        saldoMetadata = nextRow[0];
      }
      // Also check "Saldo contable" in same row col 3: "CLP 28.040.000"
      if (saldoMetadata === 0) {
        const saldoStr = String(row[3] ?? "");
        const m = saldoStr.match(/CLP\s+([\d.]+)/);
        if (m) saldoMetadata = parseNum(m[1]);
      }
      break;
    }
  }

  // If no header row found, use metadata saldo (no-movement months)
  if (headerIdx < 0) {
    return {
      periodoInicio: periodoInicio || new Date().toISOString().slice(0, 10),
      periodoFin: periodoFin || new Date().toISOString().slice(0, 10),
      saldoFinal: saldoMetadata,
      totalAbonos: 0,
      totalCargos: 0,
      transactions: [],
    };
  }

  const headers = rows[headerIdx].map((c) => String(c).toLowerCase().trim());

  // Map columns
  const colFecha = headers.findIndex((h) => h.includes("fecha"));
  const colDesc = headers.findIndex((h) => h.includes("descripci") || h.includes("detalle"));
  const colCargo = headers.findIndex((h) => h.includes("cargo") || h.includes("debito") || h.includes("débito"));
  const colAbono = headers.findIndex((h) => h.includes("abono") || h.includes("credito") || h.includes("crédito"));
  const colSaldo = headers.findIndex((h) => h.includes("saldo"));

  if (colFecha < 0 || colSaldo < 0) {
    throw new Error("Columnas requeridas no encontradas (Fecha, Saldo)");
  }

  const transactions: BciTransaction[] = [];
  let saldoFinal = 0;
  let fechaMin = "";
  let fechaMax = "";

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 2) continue;

    const rawFecha = row[colFecha];
    if (!rawFecha) continue;

    const fecha = parseDate(rawFecha);
    if (!fecha) continue;

    const descripcion = colDesc >= 0 ? String(row[colDesc] ?? "").trim() : "";
    const cargo = colCargo >= 0 ? parseNum(row[colCargo]) : 0;
    const abono = colAbono >= 0 ? parseNum(row[colAbono]) : 0;
    const saldo = parseNum(row[colSaldo]);

    transactions.push({ fecha, descripcion, cargo, abono, saldo });

    if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
    if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    saldoFinal = saldo; // last row's saldo
  }

  // Use last transaction saldo, or fallback to metadata saldo
  if (transactions.length > 0) {
    saldoFinal = transactions[transactions.length - 1].saldo;
  } else {
    saldoFinal = saldoMetadata;
  }

  // Use extracted period dates if transaction dates are empty
  if (!fechaMin && periodoInicio) fechaMin = periodoInicio;
  if (!fechaMax && periodoFin) fechaMax = periodoFin;

  const totalAbonos = transactions.reduce((s, t) => s + t.abono, 0);
  const totalCargos = transactions.reduce((s, t) => s + t.cargo, 0);

  return {
    periodoInicio: fechaMin || new Date().toISOString().slice(0, 10),
    periodoFin: fechaMax || new Date().toISOString().slice(0, 10),
    saldoFinal,
    totalAbonos,
    totalCargos,
    transactions,
  };
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y > 2000) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return null;
  }
  const s = String(v).trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  return null;
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[$.]/g, "").replace(",", ".").trim();
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
