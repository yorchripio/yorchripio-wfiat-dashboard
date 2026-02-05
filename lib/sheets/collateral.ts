// lib/sheets/collateral.ts
// Funciones para leer el colateral desde Google Sheets

import { google } from "googleapis";

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