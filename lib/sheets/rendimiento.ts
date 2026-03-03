// lib/sheets/rendimiento.ts
// Lee datos históricos de rendimiento y composición de la cartera desde Google Sheets

import { google } from "googleapis";
import { parsePercentage } from "./collateral";

/**
 * Un punto de datos diario con rendimiento y allocation.
 * allocation: % del total por tipo de instrumento (dinámico por fecha).
 */
export interface RendimientoDiario {
  fecha: string;         // DD/MM/YYYY
  dateKey: string;       // YYYY-MM-DD para ordenar
  timestamp: number;     // ms UTC
  rendimiento: number;   // rendimiento diario de la cartera (%)
  /** % alocado por tipo (ej. FCI, Cuenta_Remunerada, A_la_Vista, etc.) */
  allocation: Record<string, number>;
  /** Total colateral ese día (suma de todos los activos cargados en esa fecha) */
  totalColateral?: number;
  /** Por instrumento: valorTotal y cantidad */
  byTipoDetalle?: Record<string, { valorTotal: number; cantidad: number }>;
}

/**
 * Parsea fecha DD/MM/YYYY o DD/MM/YY a partes { day, month, year }
 */
function parseDateParts(
  raw: string | number | null | undefined
): { day: number; month: number; year: number } | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    const MS_PER_DAY = 86400000;
    const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)).getTime();
    const utcMs = EXCEL_EPOCH + raw * MS_PER_DAY;
    const d = new Date(utcMs);
    if (isNaN(d.getTime())) return null;
    return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }

  const str = raw.toString().trim();
  if (!str) return null;

  const parts = str.split("/");
  if (parts.length !== 3) return null;

  const p0 = parseInt(parts[0], 10);
  const p1 = parseInt(parts[1], 10);
  let p2 = parseInt(parts[2], 10);
  if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;

  // Año de 2 dígitos → sumar 2000
  if (p2 < 100) p2 += 2000;

  let day: number, month: number, year: number;
  if (p1 > 12 && p0 <= 12) {
    // Google invirtió a MM/DD/YYYY
    day = p1; month = p0; year = p2;
  } else {
    day = p0; month = p1; year = p2;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;

  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (testDate.getUTCDate() !== day || testDate.getUTCMonth() !== month - 1 || testDate.getUTCFullYear() !== year) {
    return null;
  }

  return { day, month, year };
}

function toDateKey(p: { day: number; month: number; year: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function toDisplay(p: { day: number; month: number; year: number }): string {
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}

/**
 * Lee datos históricos de rendimiento desde Google Sheets
 * Lee filas:
 *   3 (idx 2): fechas
 *  12 (idx 11): FCI allocation %
 *  13 (idx 12): Cta Rem allocation %
 *  14 (idx 13): Saldo Vista allocation %
 *  34 (idx 33): FCI aporte al rendimiento
 *  35 (idx 34): Cta Rem aporte al rendimiento
 *  36 (idx 35): Saldo Vista aporte al rendimiento
 *  37 (idx 36): Rendimiento total cartera
 */
export async function getRendimientoData(): Promise<RendimientoDiario[]> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Faltan credenciales de Google Sheets");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Leer desde columna A para tener los labels de cada fila
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Collateral Value!A1:ZZ40",
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = response.data.values;
  if (!rows || rows.length < 37) {
    throw new Error("No se encontraron suficientes filas en Collateral Value");
  }

  // Ahora leemos desde A, así que col A = idx 0, col B = idx 1, etc.
  // Primero logueamos los labels (columna A) de todas las filas para mapear la estructura
  console.log("[Rendimiento] === LABELS (columna A) de TODAS las filas ===");
  for (let r = 0; r < rows.length; r++) {
    const label = rows[r]?.[0];
    if (label && label.toString().trim() !== "") {
      console.log(`[Rendimiento] Fila ${r + 1} (idx ${r}): "${label}"`);
    }
  }

  const datesRow = rows[2] || [];        // Fila 3: fechas
  const fciAllocRow = rows[11] || [];     // Fila 12: FCI %
  const ctaRemAllocRow = rows[12] || [];  // Fila 13: Cta Rem %
  const saldoVistaAllocRow = rows[13] || []; // Fila 14: Saldo Vista %
  const fciAporteRow = rows[32] || [];    // Fila 33: FCI aporte al rendimiento
  const ctaRemAporteRow = rows[33] || []; // Fila 34: Cta Rem aporte al rendimiento
  const saldoVistaAporteRow = rows[34] || []; // Fila 35: Saldo Vista aporte al rendimiento
  const rendimientoRow = rows[36] || [];  // Fila 37: Total rendimiento cartera

  console.log("[Rendimiento] Total filas recibidas:", rows.length);
  console.log("[Rendimiento] Columnas con fechas:", datesRow.length);
  console.log("[Rendimiento] Primeras 3 fechas:", datesRow.slice(0, 3));
  console.log("[Rendimiento] Primeros 3 rendimientos (fila 37, idx 36):", rendimientoRow.slice(0, 3));
  console.log("[Rendimiento] Primeros 3 FCI alloc (fila 12, idx 11):", fciAllocRow.slice(0, 3));
  console.log("[Rendimiento] Primeros 3 FCI aporte (fila 34, idx 33):", fciAporteRow.slice(0, 3));
  console.log("[Rendimiento] Primeros 3 Cta Rem aporte (fila 35, idx 34):", ctaRemAporteRow.slice(0, 3));
  console.log("[Rendimiento] Primeros 3 Saldo aporte (fila 36, idx 35):", saldoVistaAporteRow.slice(0, 3));

  // Diagnóstico: mostrar columna A (label) de filas 30-40 para mapear la estructura
  // Leemos la col A por separado para saber qué hay en cada fila
  console.log("[Rendimiento] === CONTENIDO FILAS 28-40 (col B, primera fecha) ===");
  for (let r = 27; r < Math.min(rows.length, 40); r++) {
    console.log(`[Rendimiento] Fila ${r + 1} (idx ${r}):`, JSON.stringify(rows[r]?.[0] ?? "(vacío)"));
  }

  const result: RendimientoDiario[] = [];

  // Empezar desde índice 1 (columna B) porque índice 0 es columna A (labels)
  for (let i = 1; i < datesRow.length; i++) {
    const raw = datesRow[i];
    if (!raw || raw === "") continue;

    const parts = parseDateParts(raw);
    if (!parts) continue;

    const rendimiento = parsePercentage(rendimientoRow[i]);

    result.push({
      fecha: toDisplay(parts),
      dateKey: toDateKey(parts),
      timestamp: Date.UTC(parts.year, parts.month - 1, parts.day),
      rendimiento,
      allocation: {
        FCI: parsePercentage(fciAllocRow[i]),
        Cuenta_Remunerada: parsePercentage(ctaRemAllocRow[i]),
        A_la_Vista: parsePercentage(saldoVistaAllocRow[i]),
      },
    });
  }

  // Ordenar cronológicamente (más antiguo primero)
  result.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`[Rendimiento] Puntos totales: ${result.length}`);
  if (result.length > 0) {
    console.log(`[Rendimiento] Primera: ${result[0].fecha}, Última: ${result[result.length - 1].fecha}`);
  }

  return result;
}
