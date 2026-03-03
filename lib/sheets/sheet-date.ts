// lib/sheets/sheet-date.ts
// Parseo de fechas tal como vienen del Google Sheet (DD/MM/YYYY o número de serie Excel)

export interface DateParts {
  day: number;
  month: number;
  year: number;
}

/**
 * Parsea fecha del sheet (DD/MM/YYYY o número de serie Excel) a partes.
 */
export function parseSheetDateParts(
  raw: string | number | null | undefined
): DateParts | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    const MS_PER_DAY = 86400000;
    const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)).getTime();
    const d = new Date(EXCEL_EPOCH + raw * MS_PER_DAY);
    if (isNaN(d.getTime())) return null;
    return {
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
    };
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
    day = p1;
    month = p0;
    year = p2;
  } else {
    day = p0;
    month = p1;
    year = p2;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCDate() !== day || test.getUTCMonth() !== month - 1 || test.getUTCFullYear() !== year) return null;
  return { day, month, year };
}

export function sheetDateToKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function sheetDateToDate(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}
