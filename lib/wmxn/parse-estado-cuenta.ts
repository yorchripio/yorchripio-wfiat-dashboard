// lib/wmxn/parse-estado-cuenta.ts
// Parsea el PDF "Estado Cuenta Fondos de Inversión" de Banregio.
// Extrae posición del fondo REGIO1 (títulos, precio, valor cartera, plusvalía, rendimiento).
// Uses full-text search with targeted patterns (not line-by-line) to handle
// varying PDF text extraction layouts from pdfjs-dist.

import "@/lib/pdfjs-node-polyfills";
import { pathToFileURL } from "node:url";

const runtimeRequire = process
  .getBuiltinModule("module")
  .createRequire(import.meta.url);
const pdfjsModulePath = ["pdfjs-dist", "legacy", "build", "pdf.mjs"].join("/");
const pdfjsWorkerModulePath = ["pdfjs-dist", "legacy", "build", "pdf.worker.mjs"].join("/");
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfjsLib: any = runtimeRequire(pdfjsModulePath);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  runtimeRequire.resolve(pdfjsWorkerModulePath)
).href;

export interface WmxnParsedPosition {
  periodoInicio: string;     // YYYY-MM-DD
  periodoFin: string;        // YYYY-MM-DD
  fondo: string;             // "REGIO1"
  serie: string;             // "M"
  titulosInicio: number;
  titulosCierre: number;
  precioValuacion: number;
  valorCartera: number;
  movimientosNetos: number;
  plusvalia: number;
  rendimientoAnual: number | null;
  rendimientoMensual: number | null;
}

function parseMxDate(s: string): string {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

function parseMxAmount(s: string): number {
  // "$ 482,986.01" → 482986.01 or "482,986.01" → 482986.01
  const cleaned = s.replace(/\$\s*/g, "").trim();
  const normalized = cleaned.replace(/,/g, "");
  return parseFloat(normalized) || 0;
}

async function extractFullText(data: Uint8Array): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Sort items by Y (descending = top-to-bottom), then X (left-to-right)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (content.items as any[]).sort((a: any, b: any) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 3) return dy; // different line
      return a.transform[4] - b.transform[4]; // same line, sort by X
    });

    // Group by Y to form lines
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineMap = new Map<number, any[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 2) * 2; // round to nearest 2px
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item);
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
      const line = lineItems.map((it) => it.str).join(" ").trim();
      if (line) parts.push(line);
    }
  }

  return parts.join("\n");
}

export async function parseEstadoCuentaPdf(buffer: Buffer | Uint8Array): Promise<WmxnParsedPosition> {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fullText = await extractFullText(uint8);
  const lines = fullText.split("\n");

  let periodoInicio = "";
  let periodoFin = "";
  const fondo = "REGIO1";
  const serie = "M";
  let titulosInicio = 0;
  let titulosCierre = 0;
  let precioValuacion = 0;
  let valorCartera = 0;
  let movimientosNetos = 0;
  let plusvalia = 0;
  let rendimientoAnual: number | null = null;
  let rendimientoMensual: number | null = null;

  // --- Extract dates ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("Inicio de periodo")) {
      const d = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (d) { periodoInicio = parseMxDate(d[1]); }
      else if (i + 1 < lines.length) {
        const d2 = lines[i + 1].match(/(\d{2}\/\d{2}\/\d{4})/);
        if (d2) periodoInicio = parseMxDate(d2[1]);
      }
    }
    if (line.includes("Fin de periodo")) {
      const d = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (d) { periodoFin = parseMxDate(d[1]); }
      else if (i + 1 < lines.length) {
        const d2 = lines[i + 1].match(/(\d{2}\/\d{2}\/\d{4})/);
        if (d2) periodoFin = parseMxDate(d2[1]);
      }
    }
  }

  // --- Extract "Valores en Custodia" row ---
  // Pattern: REGIO1 M DD/MM/YYYY DD/MM/YYYY <titulosInicio> <titulosCierre> $ <precio> $ <valorCartera> <pct>
  // The line with REGIO1 that has dates (not the resumen row, not the ACTINVER row)
  for (const line of lines) {
    // The custodia row has REGIO1 + dates
    const custodiaMatch = line.match(
      /REGIO\d+\s+\w\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+(\d+)\s+(\d+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)/
    );
    if (custodiaMatch) {
      titulosInicio = parseInt(custodiaMatch[1]);
      titulosCierre = parseInt(custodiaMatch[2]);
      precioValuacion = parseMxAmount(custodiaMatch[3]);
      valorCartera = parseMxAmount(custodiaMatch[4]);
      break;
    }
  }

  // --- Extract "Resumen de movimientos" row ---
  // Pattern: REGIO1 M $ <valorInicio> $ <movNetos> $ <valorCierre> $ <plusvalia>
  // This is the REGIO1 row that does NOT have dates and NOT ACTINVER
  for (const line of lines) {
    if (line.includes("ACTINVER")) continue;
    if (line.match(/\d{2}\/\d{2}\/\d{4}/)) continue; // skip custodia row with dates
    const resumenMatch = line.match(
      /REGIO\d+\s+\w\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)/
    );
    if (resumenMatch) {
      // valorInicio, movimientosNetos, valorCierre, plusvalia
      movimientosNetos = parseMxAmount(resumenMatch[2]);
      plusvalia = parseMxAmount(resumenMatch[4]);
      // Also set valorCartera from cierre if not yet set
      if (valorCartera === 0) valorCartera = parseMxAmount(resumenMatch[3]);
      break;
    }
  }

  // --- Extract "Rendimiento" row ---
  // Pattern: ACTINVER REGIO1 M $ <precioInicio> $ <precioFin> <calificacion> ... $ <rendAnual> $ <rendMensual>
  for (const line of lines) {
    if (!line.includes("ACTINVER") || !line.includes("REGIO")) continue;
    const amounts = [...line.matchAll(/\$\s*([\d.,]+)/g)].map((m) => parseMxAmount(m[1]));
    // Amounts: precioInicio, precioFin, rendAnual, rendMensual
    if (amounts.length >= 4) {
      rendimientoAnual = amounts[amounts.length - 2];
      rendimientoMensual = amounts[amounts.length - 1];
    } else if (amounts.length >= 2) {
      rendimientoAnual = amounts[amounts.length - 2];
      rendimientoMensual = amounts[amounts.length - 1];
    }
    break;
  }

  if (!periodoFin) throw new Error("No se pudo extraer la fecha del estado de cuenta");

  return {
    periodoInicio,
    periodoFin,
    fondo,
    serie,
    titulosInicio,
    titulosCierre,
    precioValuacion,
    valorCartera,
    movimientosNetos,
    plusvalia,
    rendimientoAnual,
    rendimientoMensual,
  };
}
