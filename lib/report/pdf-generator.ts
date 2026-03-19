// lib/report/pdf-generator.ts
// Generates a PDF report for a wFIAT asset using PDFKit

import { type ReportData } from "./data-fetcher";
import { drawPieChart, drawLineChart } from "./charts";
import { CHART_TOKEN_COLORS } from "@/lib/constants/colors";

const COLORS = {
  primary: "#010103",
  secondary: "#5f6e78",
  accent: "#006bb7",
  lightGray: "#f5f5f5",
  medGray: "#cccccc",
  text: "#333333",
  textLight: "#666666",
};

const PIE_COLORS = ["#006bb7", "#5f6e78", "#4B5563", "#d4a017", "#0fb800", "#d91023"];

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(d: Date): string {
  return `${d.getUTCDate().toString().padStart(2, "0")}/${(d.getUTCMonth() + 1).toString().padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export async function generateReport(data: ReportData): Promise<Buffer> {
  // Dynamic import for CommonJS module
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Reporte ${data.asset} - ${fmtDate(data.to)}`,
        Author: "wFIAT Dashboard",
      },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28; // A4 width in points
    const contentW = pageW - 100; // margins
    const assetColor = CHART_TOKEN_COLORS[data.asset] ?? COLORS.accent;

    // ═══════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════
    doc.rect(0, 0, pageW, 80).fill(COLORS.primary);
    doc.fontSize(24).fillColor("#FFFFFF").text(data.asset, 50, 25);
    doc.fontSize(10).fillColor("#cccccc").text(data.assetName, 50, 52);
    doc.fontSize(9).fillColor("#999999")
      .text(`Reporte de colateral | ${fmtDate(data.from)} - ${fmtDate(data.to)}`, 50, 65, {
        width: contentW,
        align: "right",
      });

    doc.moveDown(2);
    let curY = 100;

    // ═══════════════════════════════════════════════
    // 1. COLLATERAL SUMMARY
    // ═══════════════════════════════════════════════
    curY = drawSectionTitle(doc, "Colateral", curY, assetColor);

    if (data.collateral) {
      // Total
      doc.fontSize(18).fillColor(COLORS.primary)
        .text(`${data.currencySymbol} ${fmtNum(data.collateral.total, 2)}`, 50, curY);
      curY += 28;

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text(`Actualizado: ${data.collateral.fecha}`, 50, curY);
      curY += 20;

      // Instruments table
      if (data.collateral.instrumentos.length > 0) {
        curY = drawInstrumentTable(doc, data.collateral.instrumentos, curY, data.currencySymbol);
        curY += 10;

        // Pie chart (right side)
        const pieData = data.collateral.instrumentos.map((inst, i) => ({
          label: inst.nombre.slice(0, 30),
          value: inst.porcentaje,
          color: PIE_COLORS[i % PIE_COLORS.length],
        }));
        if (pieData.length > 1) {
          drawPieChart(doc, pieData, pageW - 130, curY - 60, 50, 20);
        }
      }
    } else {
      doc.fontSize(10).fillColor(COLORS.textLight)
        .text("No hay datos de colateral disponibles.", 50, curY);
      curY += 20;
    }

    curY += 15;

    // ═══════════════════════════════════════════════
    // 2. RENDIMIENTO (if available)
    // ═══════════════════════════════════════════════
    if (data.rendimiento) {
      curY = checkPageBreak(doc, curY, 120);
      curY = drawSectionTitle(doc, "Rendimiento del Colateral", curY, assetColor);

      const r = data.rendimiento;
      const metrics = [
        ["Rendimiento del periodo", `${r.periodReturn >= 0 ? "+" : ""}${r.periodReturn.toFixed(4)}%`],
        ["TNA (anualizada lineal)", `${r.tna.toFixed(2)}%`],
        ["VCP inicial", fmtNum(r.vcpInicial, 4)],
        ["VCP final", fmtNum(r.vcpFinal, 4)],
        ["Periodo", `${r.diasCalendario} dias`],
      ];

      for (const [label, value] of metrics) {
        doc.fontSize(9).fillColor(COLORS.textLight).text(label, 50, curY, { continued: true });
        doc.fillColor(COLORS.primary).text(`  ${value}`, { align: "left" });
        curY += 16;
      }
      curY += 10;
    }

    // ═══════════════════════════════════════════════
    // 3. RATIO DE COLATERIZACION
    // ═══════════════════════════════════════════════
    if (data.ratioHistory.length >= 2) {
      curY = checkPageBreak(doc, curY, 180);
      curY = drawSectionTitle(doc, "Ratio de Colaterizacion", curY, assetColor);

      const lineData = data.ratioHistory.map((r) => ({
        date: new Date(r.date + "T00:00:00Z"),
        value: r.ratio,
      }));

      drawLineChart(doc, lineData, 50, curY, contentW, 140, {
        color: assetColor,
        yLabel: "Ratio (%)",
        yFormat: (v) => `${v.toFixed(1)}%`,
        fillArea: true,
      });
      curY += 155;
    }

    // ═══════════════════════════════════════════════
    // 4. SUPPLY
    // ═══════════════════════════════════════════════
    curY = checkPageBreak(doc, curY, 150);
    curY = drawSectionTitle(doc, "Supply", curY, assetColor);

    // Total
    doc.fontSize(14).fillColor(COLORS.primary)
      .text(`${fmtNum(data.supplyTotal, 2)} ${data.asset}`, 50, curY);
    curY += 22;

    // By chain table
    if (data.supplyByChain.length > 0) {
      doc.fontSize(8).fillColor(COLORS.textLight);
      for (const chain of data.supplyByChain) {
        const pct = data.supplyTotal > 0 ? ((chain.supply / data.supplyTotal) * 100).toFixed(1) : "0";
        doc.text(`${chain.chain}: ${fmtNum(chain.supply, 2)} (${pct}%)`, 60, curY);
        curY += 14;
      }
      curY += 5;
    }

    // Supply history chart
    if (data.supplyHistory.length >= 2) {
      curY = checkPageBreak(doc, curY, 160);
      const lineData = data.supplyHistory.map((s) => ({
        date: new Date(s.date + "T00:00:00Z"),
        value: s.total,
      }));
      drawLineChart(doc, lineData, 50, curY, contentW, 130, {
        color: assetColor,
        yLabel: "Supply total",
        yFormat: (v) => fmtNum(v),
        fillArea: true,
      });
      curY += 145;
    }

    // ═══════════════════════════════════════════════
    // 5. POOLS DE LIQUIDEZ
    // ═══════════════════════════════════════════════
    if (data.pools.length > 0) {
      curY = checkPageBreak(doc, curY, 80 + data.pools.length * 18);
      curY = drawSectionTitle(doc, "Pools de Liquidez", curY, assetColor);

      // Table header
      const cols = [
        { label: "Pool", x: 50, w: 120 },
        { label: "Red", x: 170, w: 80 },
        { label: "TVL (USD)", x: 250, w: 100 },
        { label: "Vol 24h (USD)", x: 350, w: 100 },
        { label: "Precio (USD)", x: 450, w: 95 },
      ];

      doc.fontSize(7).fillColor(COLORS.textLight);
      for (const col of cols) {
        doc.text(col.label, col.x, curY, { width: col.w });
      }
      curY += 14;
      doc.strokeColor(COLORS.medGray).lineWidth(0.5)
        .moveTo(50, curY).lineTo(50 + contentW, curY).stroke();
      curY += 5;

      doc.fontSize(8).fillColor(COLORS.text);
      for (const pool of data.pools) {
        doc.text(pool.label, cols[0].x, curY, { width: cols[0].w });
        doc.text(pool.network, cols[1].x, curY, { width: cols[1].w });
        doc.text(`$${fmtNum(pool.reserveUsd, 0)}`, cols[2].x, curY, { width: cols[2].w });
        doc.text(`$${fmtNum(pool.volume24h, 0)}`, cols[3].x, curY, { width: cols[3].w });
        doc.text(`$${pool.priceUsd.toFixed(6)}`, cols[4].x, curY, { width: cols[4].w });
        curY += 18;
      }
    }

    // ═══════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════
    const footerY = doc.page.height - 35;
    doc.fontSize(7).fillColor("#999999")
      .text(
        `Generado: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC | wFIAT Dashboard`,
        50, footerY, { width: contentW, align: "center" }
      );

    doc.end();
  });
}

// ── Helpers ──────────────────────────────────────────

function drawSectionTitle(doc: InstanceType<typeof import("pdfkit")>, title: string, y: number, color: string): number {
  doc.rect(50, y, 4, 16).fill(color);
  doc.fontSize(12).fillColor(COLORS.primary).text(title, 60, y + 1);
  return y + 25;
}

function checkPageBreak(doc: InstanceType<typeof import("pdfkit")>, curY: number, needed: number): number {
  if (curY + needed > doc.page.height - 60) {
    doc.addPage();
    return 50;
  }
  return curY;
}

interface Instrumento {
  nombre: string;
  tipo: string;
  entidad: string;
  valorTotal: number;
  porcentaje: number;
  rendimientoDiario: number;
}

function drawInstrumentTable(
  doc: InstanceType<typeof import("pdfkit")>,
  instrumentos: Instrumento[],
  startY: number,
  currencySymbol: string
): number {
  const cols = [
    { label: "Instrumento", x: 50, w: 160 },
    { label: "Entidad", x: 210, w: 80 },
    { label: "Valor", x: 290, w: 100 },
    { label: "%", x: 390, w: 40 },
    { label: "Rend. diario", x: 430, w: 65 },
  ];

  let y = startY;

  // Header
  doc.fontSize(7).fillColor(COLORS.textLight);
  for (const col of cols) {
    doc.text(col.label, col.x, y, { width: col.w });
  }
  y += 12;
  doc.strokeColor(COLORS.medGray).lineWidth(0.5)
    .moveTo(50, y).lineTo(495, y).stroke();
  y += 5;

  // Rows
  doc.fontSize(8).fillColor(COLORS.text);
  for (const inst of instrumentos) {
    doc.text(inst.nombre.slice(0, 35), cols[0].x, y, { width: cols[0].w });
    doc.text(inst.entidad, cols[1].x, y, { width: cols[1].w });
    doc.text(`${currencySymbol} ${fmtNum(inst.valorTotal, 2)}`, cols[2].x, y, { width: cols[2].w });
    doc.text(`${inst.porcentaje.toFixed(1)}%`, cols[3].x, y, { width: cols[3].w });
    doc.text(
      inst.rendimientoDiario > 0 ? `${inst.rendimientoDiario.toFixed(4)}%` : "-",
      cols[4].x, y, { width: cols[4].w }
    );
    y += 16;
  }

  return y;
}
