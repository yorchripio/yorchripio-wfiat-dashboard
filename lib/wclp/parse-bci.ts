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

  if (headerIdx < 0) throw new Error("No se encontró la fila de encabezados en el extracto BCI");

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

  // If no transactions, try to get saldo from metadata rows (months with no movements)
  if (transactions.length === 0) {
    // Look for saldo in metadata rows (e.g., "Saldo Disponible", "Saldo")
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const first = String(row[0] ?? "").toLowerCase();
      if (first.includes("saldo") && !first.includes("columna")) {
        for (let j = 1; j < row.length; j++) {
          const v = parseNum(row[j]);
          if (v > 0) {
            saldoFinal = v;
            break;
          }
        }
        if (saldoFinal > 0) break;
      }
    }

    // Try extracting period from metadata
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const first = String(row[0] ?? "").toLowerCase();
      if (first.includes("periodo") || first.includes("desde") || first.includes("fecha")) {
        const val = String(row[1] ?? "");
        const d = parseDate(val);
        if (d) {
          if (!fechaMin) fechaMin = d;
          fechaMax = d;
        }
      }
    }
  }

  // Use last transaction saldo, or the metadata saldo
  if (transactions.length > 0) {
    saldoFinal = transactions[transactions.length - 1].saldo;
  }

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
