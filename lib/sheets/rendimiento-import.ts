import { google } from "googleapis";
import { parsePercentage } from "./collateral";

interface RendimientoDiarioSheet {
  fecha: Date;
  rendimiento: number;
}

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
  if (p2 < 100) p2 += 2000;

  let day: number, month: number, year: number;
  if (p1 > 12 && p0 <= 12) {
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

/**
 * Lee fila 3 (fechas) y fila 37 (rendimiento total cartera %) desde el Sheet.
 * Retorna un array de { fecha: Date, rendimiento: number (%) } para cada columna válida.
 */
export async function getRendimientoFromSheet(): Promise<RendimientoDiarioSheet[]> {
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

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Collateral Value!A1:ZZ40",
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = response.data.values;
  if (!rows || rows.length < 37) {
    throw new Error("No se encontraron suficientes filas en Collateral Value");
  }

  const datesRow = rows[2] || [];
  const rendimientoRow = rows[36] || [];

  const result: RendimientoDiarioSheet[] = [];

  for (let i = 1; i < datesRow.length; i++) {
    const raw = datesRow[i];
    if (!raw || raw === "") continue;

    const parts = parseDateParts(raw);
    if (!parts) continue;

    const rendimiento = parsePercentage(rendimientoRow[i]);
    const fecha = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

    result.push({ fecha, rendimiento });
  }

  console.log(`[RendimientoImport] ${result.length} puntos leídos del Sheet`);
  if (result.length > 0) {
    console.log(`[RendimientoImport] Rango: ${result[0].fecha.toISOString().slice(0, 10)} → ${result[result.length - 1].fecha.toISOString().slice(0, 10)}`);
    console.log(`[RendimientoImport] Primeros 5:`, result.slice(0, 5).map(r => `${r.fecha.toISOString().slice(0, 10)}: ${r.rendimiento}%`));
  }

  return result;
}
