// lib/sheets/history.ts
// Funciones para leer datos históricos desde Google Sheets

import { google } from "googleapis";
import { parseMoneyValue } from "./collateral";

// Tipo para un punto de datos histórico
export interface HistoricalDataPoint {
  fecha: string;          // DD/MM/YYYY
  fechaFormatted: string; // DD/MM/YYYY para mostrar en el gráfico
  timestamp: number;      // Timestamp numérico para ordenar y filtrar
  colateralTotal: number;
  supplyTotal: number;
  ratio: number;
}

/**
 * Parsea una fecha en formato DD/MM/YYYY (argentino) a un objeto con día, mes, año.
 * También soporta números de serie de Excel/Sheets.
 * Retorna null si no puede parsear.
 */
function parseDateParts(
  raw: string | number | null | undefined
): { day: number; month: number; year: number } | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Si es un número → número de serie de Excel/Sheets
  if (typeof raw === "number") {
    // Sheets: serial 1 = 1/1/1900. Hay un bug legacy de Lotus 1-2-3 que suma un día de más.
    const MS_PER_DAY = 86400000;
    const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)).getTime(); // 30/12/1899 UTC
    const utcMs = EXCEL_EPOCH + raw * MS_PER_DAY;
    const d = new Date(utcMs);
    if (isNaN(d.getTime())) return null;
    return {
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1, // 1-indexed
      year: d.getUTCFullYear(),
    };
  }

  const str = raw.toString().trim();
  if (!str) return null;

  const parts = str.split("/");
  if (parts.length !== 3) return null;

  const p0 = parseInt(parts[0], 10);
  const p1 = parseInt(parts[1], 10);
  const p2 = parseInt(parts[2], 10);

  if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;

  // Detectar si el formato es DD/MM/YYYY o MM/DD/YYYY
  // Regla: el formato del sheet es DD/MM/YYYY (argentino)
  // Pero Google Sheets API a veces invierte a MM/DD/YYYY
  // Detección: si p1 > 12, p1 es día → formato es MM/DD/YYYY
  //            si p0 > 12, p0 es día → formato es DD/MM/YYYY
  //            si ambos <= 12, asumimos DD/MM/YYYY

  let day: number, month: number, year: number;

  if (p1 > 12 && p0 <= 12) {
    // p1 no puede ser mes → formato MM/DD/YYYY (Google invirtió)
    day = p1;
    month = p0;
    year = p2;
  } else {
    // Formato DD/MM/YYYY (lo esperado)
    day = p0;
    month = p1;
    year = p2;
  }

  // Si el año tiene 2 dígitos (ej: 25), convertir a 4 dígitos (2025)
  if (year < 100) {
    year += 2000;
  }

  // Validar
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;

  // Validación extra: crear Date y verificar
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCDate() !== day ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCFullYear() !== year
  ) {
    return null;
  }

  return { day, month, year };
}

/**
 * Convierte partes de fecha a una clave normalizada "YYYY-MM-DD"
 * que se puede usar como clave de Map y que ordena cronológicamente como string.
 */
function toDateKey(parts: { day: number; month: number; year: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Convierte partes de fecha a formato de display DD/MM/YYYY
 */
function toDisplayDate(parts: { day: number; month: number; year: number }): string {
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

/**
 * Convierte una clave "YYYY-MM-DD" a timestamp UTC para ordenar y filtrar
 */
function dateKeyToTimestamp(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Lee los datos históricos del colateral y supply desde Google Sheets
 */
export async function getHistoricalData(): Promise<HistoricalDataPoint[]> {
  try {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      throw new Error("Faltan credenciales de Google Sheets en .env.local");
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Leer datos del colateral (FORMATTED_VALUE para ver cómo muestra las fechas)
    const collateralResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Collateral Value!B1:ZZ30",
      valueRenderOption: "FORMATTED_VALUE",
    });

    // Leer fechas del supply
    const supplyDatesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Balance wARS!B2:ZZ2",
      valueRenderOption: "FORMATTED_VALUE",
    });

    // Leer valores del supply (números crudos)
    const supplyValuesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Balance wARS!B18:ZZ18",
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const collateralRows = collateralResponse.data.values;
    const supplyDatesRow = supplyDatesResponse.data.values?.[0] || [];
    const supplyValuesRow = supplyValuesResponse.data.values?.[0] || [];

    if (!collateralRows || collateralRows.length === 0) {
      throw new Error("No se encontraron datos históricos de colateral");
    }

    // Fechas del colateral: fila 3 = índice 2, totales: fila 8 = índice 7
    const collateralDatesRow = collateralRows[2] || [];
    const collateralTotalsRow = collateralRows[7] || [];

    console.log("[History] === DIAGNÓSTICO ===");
    console.log("[History] Cols fechas colateral:", collateralDatesRow.length);
    console.log("[History] Cols fechas supply:", supplyDatesRow.length);
    console.log("[History] Primeras 5 fechas colateral (raw):", JSON.stringify(collateralDatesRow.slice(0, 5)));
    console.log("[History] Primeras 5 fechas supply (raw):", JSON.stringify(supplyDatesRow.slice(0, 5)));
    console.log("[History] Primeros 5 totales colateral (raw):", JSON.stringify(collateralTotalsRow.slice(0, 5)));
    console.log("[History] Primeros 5 valores supply (raw):", JSON.stringify(supplyValuesRow.slice(0, 5)));

    // Mapa: dateKey ("YYYY-MM-DD") -> datos
    const dataMap = new Map<
      string,
      {
        colateralTotal: number;
        supplyTotal: number;
        displayDate: string;
      }
    >();

    // === Procesar datos del colateral ===
    let colateralParsed = 0;
    let colateralFailed = 0;
    for (let i = 0; i < collateralDatesRow.length; i++) {
      const raw = collateralDatesRow[i];
      if (!raw || raw === "") continue;

      const parts = parseDateParts(raw);
      if (!parts) {
        colateralFailed++;
        if (colateralFailed <= 5) {
          console.warn(`[History] Colateral: no se pudo parsear col ${i}: ${JSON.stringify(raw)}`);
        }
        continue;
      }

      const key = toDateKey(parts);
      const display = toDisplayDate(parts);
      const total = parseMoneyValue(collateralTotalsRow[i]);

      colateralParsed++;
      if (total > 0) {
        dataMap.set(key, {
          colateralTotal: total,
          supplyTotal: 0,
          displayDate: display,
        });
      }
    }

    console.log(`[History] Colateral: ${colateralParsed} fechas parseadas, ${colateralFailed} fallidas`);
    console.log(`[History] Colateral: ${dataMap.size} entradas con total > 0`);

    // === Procesar datos del supply ===
    let supplyParsed = 0;
    let supplyFailed = 0;
    let supplyMatched = 0;
    let supplyUnmatched = 0;
    for (let i = 0; i < supplyDatesRow.length; i++) {
      const raw = supplyDatesRow[i];
      if (!raw || raw === "") continue;

      const parts = parseDateParts(raw);
      if (!parts) {
        supplyFailed++;
        if (supplyFailed <= 5) {
          console.warn(`[History] Supply: no se pudo parsear col ${i}: ${JSON.stringify(raw)}`);
        }
        continue;
      }

      const key = toDateKey(parts);
      const display = toDisplayDate(parts);
      const total = parseMoneyValue(supplyValuesRow[i]);

      supplyParsed++;
      if (total > 0) {
        const existing = dataMap.get(key);
        if (existing) {
          existing.supplyTotal = total;
          supplyMatched++;
        } else {
          supplyUnmatched++;
          dataMap.set(key, {
            colateralTotal: 0,
            supplyTotal: total,
            displayDate: display,
          });
        }
      }
    }

    console.log(`[History] Supply: ${supplyParsed} fechas parseadas, ${supplyFailed} fallidas`);
    console.log(`[History] Supply: ${supplyMatched} matcheadas con colateral, ${supplyUnmatched} sin match`);

    // === Construir resultado ===
    const historicalData: HistoricalDataPoint[] = [];

    for (const [key, data] of dataMap.entries()) {
      if (data.colateralTotal > 0 && data.supplyTotal > 0) {
        const ratio = (data.colateralTotal / data.supplyTotal) * 100;
        historicalData.push({
          fecha: data.displayDate,
          fechaFormatted: data.displayDate,
          timestamp: dateKeyToTimestamp(key),
          colateralTotal: data.colateralTotal,
          supplyTotal: data.supplyTotal,
          ratio,
        });
      }
    }

    // Ordenar por dateKey (YYYY-MM-DD ordena cronológicamente como string)
    historicalData.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[History] Puntos finales con ambos datos: ${historicalData.length}`);
    if (historicalData.length > 0) {
      console.log(`[History] Primera fecha: ${historicalData[0].fecha}`);
      console.log(`[History] Última fecha: ${historicalData[historicalData.length - 1].fecha}`);
    }

    // Listar las primeras 10 dateKeys para debug
    const allKeys = Array.from(dataMap.keys()).sort();
    console.log(`[History] Primeras 10 dateKeys:`, allKeys.slice(0, 10));
    console.log(`[History] Últimas 5 dateKeys:`, allKeys.slice(-5));

    return historicalData;
  } catch (error) {
    console.error("[Sheets History] Error:", error);
    throw error;
  }
}
