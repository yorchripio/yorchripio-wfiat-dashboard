// lib/sheets/collateral.ts
// Funciones para leer el colateral desde Google Sheets

import { google } from "googleapis";
import { parseSheetDateParts, sheetDateToKey, sheetDateToDate } from "./sheet-date";

// Tipos para los datos del colateral
export interface InstrumentoColateral {
  id: string;
  nombre: string;
  tipo: "FCI" | "Cuenta_Remunerada" | "A_la_Vista";
  entidad: string;
  valorTotal: number;
  porcentaje: number;
  rendimientoDiario: number;
  activo: boolean;
}

export interface ColateralData {
  fecha: string;
  instrumentos: InstrumentoColateral[];
  total: number;
  totalFormatted: string;
  timestamp: string;
  /** Rendimiento de la cartera (fila 37): % rendimiento × % colateral por instrumento */
  rendimientoCartera: number;
}

/**
 * Parsea un valor monetario del sheet
 */
export function parseMoneyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  let cleaned = value.toString().trim();
  cleaned = cleaned.replace(/[$]/g, "");

  if (cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parsea un valor de porcentaje
 */
export function parsePercentage(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  let cleaned = value.toString().trim().replace("%", "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Conecta con Google Sheets y lee los datos de colateral
 */
export async function getCollateralData(): Promise<ColateralData> {
  try {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      throw new Error("Faltan credenciales de Google Sheets en .env.local");
    }

    // Autenticar con Google APIs directamente
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Leer el rango de datos (incluye fila 37: rendimiento cartera)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Collateral Value!A1:Z40",
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      throw new Error("No se encontraron datos en el spreadsheet");
    }

    console.log("[Sheets] Filas obtenidas:", rows.length);

    // La columna B (índice 1) tiene los datos más recientes
    const lastCol = 1;

    // Extraer valores (ajustado a la estructura real del sheet)
    // Fila 3 = índice 2, Fila 4 = índice 3, etc.
    const fecha = rows[2]?.[lastCol] || "";           // Fila 3: Fechas
    const fciValor = parseMoneyValue(rows[3]?.[lastCol]);      // Fila 4: FCI Comercio
    const ctaRemValor = parseMoneyValue(rows[4]?.[lastCol]);   // Fila 5: Cta Remunerada
    const saldoVistaValor = parseMoneyValue(rows[5]?.[lastCol]); // Fila 6: Saldo Vista
    const totalSheet = parseMoneyValue(rows[7]?.[lastCol]);    // Fila 8: TOTAL

    const fciPorcentaje = parsePercentage(rows[11]?.[lastCol]);    // Fila 12: FCI %
    const ctaRemPorcentaje = parsePercentage(rows[12]?.[lastCol]); // Fila 13: Cta Rem %
    const saldoVistaPorcentaje = parsePercentage(rows[13]?.[lastCol]); // Fila 14: Saldo Vista %

    const fciRendimiento = parsePercentage(rows[23]?.[lastCol]);   // Fila 24: FCI Rendimiento
    const ctaRemRendimiento = parsePercentage(rows[24]?.[lastCol]); // Fila 25: Cta Rem Rendimiento

    // Fila 37: rendimiento de la cartera (ponderado por % colateral)
    const rendimientoCartera = parsePercentage(rows[36]?.[lastCol]);

    console.log("[Sheets] Valores leídos:", {
      fecha,
      fci: fciValor,
      ctaRem: ctaRemValor,
      saldoVista: saldoVistaValor,
      total: totalSheet,
    });

    const total = totalSheet || fciValor + ctaRemValor + saldoVistaValor;

    const instrumentos: InstrumentoColateral[] = [
      {
        id: "FCI_ADCAP_SB",
        nombre: "Adcap Ahorro Pesos - Clase B",
        tipo: "FCI",
        entidad: "Inversiones Banco Comercio",
        valorTotal: fciValor,
        porcentaje: fciPorcentaje,
        rendimientoDiario: fciRendimiento,
        activo: fciValor > 0,
      },
      {
        id: "CTA_REM_COMERCIO",
        nombre: "Cta Remunerada Comercio",
        tipo: "Cuenta_Remunerada",
        entidad: "Banco Comercio",
        valorTotal: ctaRemValor,
        porcentaje: ctaRemPorcentaje,
        rendimientoDiario: ctaRemRendimiento,
        activo: ctaRemValor > 0,
      },
      {
        id: "SALDO_VISTA",
        nombre: "Saldo Vista",
        tipo: "A_la_Vista",
        entidad: "Banco Comercio",
        valorTotal: saldoVistaValor,
        porcentaje: saldoVistaPorcentaje,
        rendimientoDiario: 0,
        activo: saldoVistaValor > 0,
      },
    ];

    return {
      fecha,
      instrumentos,
      total,
      totalFormatted: `$${total.toLocaleString("es-AR")}`,
      timestamp: new Date().toISOString(),
      rendimientoCartera,
    };

  } catch (error) {
    console.error("[Sheets] Error:", error);
    throw error;
  }
}

/** Una fila de colateral por instrumento (para importar a DB) */
export interface CollateralRowFromSheet {
  dateKey: string;
  fecha: Date;
  instrumentos: Array<{
    tipo: "FCI" | "Cuenta_Remunerada" | "A_la_Vista";
    nombre: string;
    entidad: string;
    valorTotal: number;
    /** Valor de la cuotaparte (solo FCI: fila 20 del sheet). Cta Rem / Saldo Vista = 1 implícito */
    valorCuotaparte?: number;
    /** Cantidad de cuotas/partes (FCI: valorTotal/valorCuotaparte; otros: 1) */
    cantidadCuotasPartes?: number;
  }>;
}

/** Fila 20 del sheet = valor cuotaparte del FCI (Adcap) por columna/fecha */
const FCI_CUOTAPARTE_ROW_INDEX = 19; // 0-based → fila 20

/** Mapeo fila del sheet -> tipo y datos del instrumento (igual que getCollateralData) */
const SHEET_ROW_TO_INSTRUMENT: Array<{
  rowIndex: number;
  tipo: "FCI" | "Cuenta_Remunerada" | "A_la_Vista";
  nombre: string;
  entidad: string;
}> = [
  { rowIndex: 3, tipo: "FCI", nombre: "Adcap Ahorro Pesos - Clase B", entidad: "Inversiones Banco Comercio" },
  { rowIndex: 4, tipo: "Cuenta_Remunerada", nombre: "Cta Remunerada Comercio", entidad: "Banco Comercio" },
  { rowIndex: 5, tipo: "A_la_Vista", nombre: "Saldo Vista", entidad: "Banco Comercio" },
];

/**
 * Lee todo el sheet "Collateral Value": todas las columnas (cada columna = una fecha).
 * Fila 3 = fechas, filas 4-6 = valor total FCI/Cta Rem/Saldo Vista, fila 20 = valor cuotaparte FCI.
 */
export async function getAllCollateralFromSheet(): Promise<CollateralRowFromSheet[]> {
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

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Collateral Value!B1:ZZ21",
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = response.data.values;
  if (!rows || rows.length < 6) {
    throw new Error("No se encontraron suficientes filas en Collateral Value");
  }

  const datesRow = rows[2] ?? [];
  const fciCuotaparteRow = rows[FCI_CUOTAPARTE_ROW_INDEX] ?? [];
  const result: CollateralRowFromSheet[] = [];

  for (let col = 0; col < datesRow.length; col++) {
    const rawDate = datesRow[col];
    if (rawDate == null || String(rawDate).trim() === "") continue;

    const parts = parseSheetDateParts(rawDate);
    if (!parts) continue;

    const dateKey = sheetDateToKey(parts);
    const fecha = sheetDateToDate(parts);

    const instrumentos: CollateralRowFromSheet["instrumentos"] = [];
    for (const { rowIndex, tipo, nombre, entidad } of SHEET_ROW_TO_INSTRUMENT) {
      const valorTotal = parseMoneyValue(rows[rowIndex]?.[col]);
      if (tipo === "FCI") {
        const valorCuotaparteRaw = parseMoneyValue(fciCuotaparteRow[col]);
        const valorCuotaparte =
          valorCuotaparteRaw > 0 ? valorCuotaparteRaw : valorTotal;
        const cantidadCuotasPartes =
          valorCuotaparte > 0 ? valorTotal / valorCuotaparte : 1;
        instrumentos.push({
          tipo,
          nombre,
          entidad,
          valorTotal,
          valorCuotaparte,
          cantidadCuotasPartes,
        });
      } else {
        instrumentos.push({
          tipo,
          nombre,
          entidad,
          valorTotal,
          valorCuotaparte: valorTotal,
          cantidadCuotasPartes: 1,
        });
      }
    }

    result.push({ dateKey, fecha, instrumentos });
  }

  result.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  return result;
}