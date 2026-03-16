// lib/wbrl/parse-renda-fixa.ts
// Parsea el PDF de "Posição Renda Fixa" de Banco Genial y extrae posiciones CDB.
// Uses pdfjs-dist legacy build directly (no workers needed for server-side).

import path from "path";
import { pathToFileURL } from "url";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfjsLib: any = require("pdfjs-dist/legacy/build/pdf.mjs");
// Point worker to the actual file using file:// URL (required on Windows/Node.js ESM)
const workerPath = path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export interface CdbPosition {
  fechaPosicao: string;   // YYYY-MM-DD
  fechaInicio: string;    // YYYY-MM-DD
  fechaVencimento: string;// YYYY-MM-DD
  producto: string;       // "CDBPO CDICETIP"
  emisor: string;         // "BANCO GENIAL S.A."
  capitalInicial: number;
  valorBruto: number;
  valorBloqueado: number;
  valorLiquido: number;
  iof: number;
  ir: number;
  indexador: string;      // "CDICETIP"
  pctIndexador: number;   // 99.0
}

function parseBrlAmount(s: string): number {
  // "R$ 378.046,00" -> 378046.00
  const cleaned = s.replace(/R\$\s*/g, "").trim();
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized);
}

function parseBrDate(s: string): string {
  // "11/03/2026" -> "2026-03-11"
  const parts = s.trim().split("/");
  if (parts.length !== 3) return s;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

async function extractTextLines(data: Uint8Array): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by Y coordinate to reconstruct lines
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineMap = new Map<number, { str: string; x: number }[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of content.items as any[]) {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ str: item.str, x: item.transform[4] });
    }

    // Sort Y descending (top-to-bottom), items by X (left-to-right)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.str).join(" ").trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}

export async function parseRendaFixaPdf(buffer: Buffer | Uint8Array): Promise<CdbPosition[]> {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const lines = await extractTextLines(uint8);

  const positions: CdbPosition[] = [];

  for (const line of lines) {
    // Match lines starting with DD/MM/YYYY DD/MM/YYYY DD/MM/YYYY (posicao, inicio, vencimento)
    const dateMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/
    );
    if (!dateMatch) continue;

    // Extract all R$ amounts from the line
    const amounts = [...line.matchAll(/R\$\s*[\d.,]+/g)].map((m) =>
      parseBrlAmount(m[0])
    );
    if (amounts.length < 5) continue;

    // Extract indexador percentage at the end (e.g., "99,0")
    const pctMatch = line.match(/(\d+[,.]?\d*)\s*$/);
    const pctIndexador = pctMatch
      ? parseFloat(pctMatch[1].replace(",", "."))
      : 0;

    // Determine product and emisor from between dates and first R$ amount
    const afterDates = line.substring(dateMatch[0].length);
    const firstRsIdx = afterDates.indexOf("R$");
    const middlePart = firstRsIdx > 0 ? afterDates.substring(0, firstRsIdx).trim() : "";
    const productMatch = middlePart.match(/^[\t\s]*(CDBPO\s+\w+)\s+(.+?)[\t\s]*$/);
    const producto = productMatch ? productMatch[1].trim() : "CDBPO CDICETIP";
    const emisor = productMatch ? productMatch[2].trim() : middlePart.trim();

    // Extract indexador
    const indexadorMatch = line.match(/(CDICETIP|CDI|IPCA|SELIC)/i);
    const indexador = indexadorMatch ? indexadorMatch[1].toUpperCase() : "CDICETIP";

    // amounts: capitalInicial, valorBruto, valorBloqueado, valorLiquido, IOF, IR
    positions.push({
      fechaPosicao: parseBrDate(dateMatch[1]),
      fechaInicio: parseBrDate(dateMatch[2]),
      fechaVencimento: parseBrDate(dateMatch[3]),
      producto,
      emisor: emisor || "BANCO GENIAL S.A.",
      capitalInicial: amounts[0],
      valorBruto: amounts[1],
      valorBloqueado: amounts.length >= 6 ? amounts[2] : 0,
      valorLiquido: amounts.length >= 6 ? amounts[3] : amounts[2],
      iof: amounts.length >= 6 ? amounts[4] : 0,
      ir: amounts.length >= 6 ? amounts[5] : amounts[3],
      indexador,
      pctIndexador,
    });
  }

  return positions;
}
