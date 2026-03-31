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
      const metrics: [string, string][] = [
        ["Rendimiento del periodo", `${r.periodReturn >= 0 ? "+" : ""}${r.periodReturn.toFixed(4)}%`],
        ["TNA (anualizada lineal)", `${r.tna.toFixed(2)}%`],
      ];
      if (r.vcpInicial > 0) metrics.push(["VCP inicial", fmtNum(r.vcpInicial, 4)]);
      if (r.vcpFinal > 0) metrics.push(["VCP final", fmtNum(r.vcpFinal, 4)]);
      metrics.push(["Periodo", `${r.diasCalendario} dias`]);

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
    // 6. HISTORIAL DE EVENTOS (Suscripciones/Rescates) — AUDITORÍA
    // ═══════════════════════════════════════════════
    if (data.cuotaparteEvents.length > 0) {
      doc.addPage();
      let evY = 50;

      // Audit banner
      doc.rect(0, 0, pageW, 35).fill(COLORS.primary);
      doc.fontSize(11).fillColor("#FFFFFF").text("SECCIÓN DE AUDITORÍA", 50, 10, { width: contentW, align: "center" });
      evY = 50;

      evY = drawSectionTitle(doc, "Historial de Eventos de Capital", evY, assetColor);

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text("Registro de todas las suscripciones y rescates de cuotapartes del FCI, conciliados con extractos bancarios.", 50, evY, { width: contentW });
      evY += 18;

      // Table header
      const evCols = [
        { label: "Fecha", x: 50, w: 55 },
        { label: "Tipo", x: 105, w: 50 },
        { label: "Monto (ARS)", x: 155, w: 85 },
        { label: "VCP FCI", x: 240, w: 55 },
        { label: "Cuotapartes", x: 295, w: 70 },
        { label: "CP Acum.", x: 365, w: 60 },
        { label: "Descripción", x: 425, w: 120 },
      ];

      doc.fontSize(6.5).fillColor(COLORS.textLight);
      for (const col of evCols) {
        doc.text(col.label, col.x, evY, { width: col.w });
      }
      evY += 11;
      doc.strokeColor(COLORS.medGray).lineWidth(0.5)
        .moveTo(50, evY).lineTo(50 + contentW, evY).stroke();
      evY += 4;

      for (const ev of data.cuotaparteEvents) {
        evY = checkPageBreak(doc, evY, 14);
        const isRescate = ev.tipo === "RESCATE";
        const rowColor = isRescate ? "#b91c1c" : "#15803d";

        doc.fontSize(7).fillColor(COLORS.text);
        doc.text(ev.fecha.split("-").reverse().join("/"), evCols[0].x, evY, { width: evCols[0].w });
        doc.fillColor(rowColor).text(ev.tipo, evCols[1].x, evY, { width: evCols[1].w });
        doc.fillColor(COLORS.text)
          .text(`$ ${fmtNum(ev.montoARS, 0)}`, evCols[2].x, evY, { width: evCols[2].w })
          .text(fmtNum(ev.vcpFCI, 4), evCols[3].x, evY, { width: evCols[3].w })
          .text(fmtNum(ev.cuotapartes, 2), evCols[4].x, evY, { width: evCols[4].w })
          .text(fmtNum(ev.cuotapartesAcum, 2), evCols[5].x, evY, { width: evCols[5].w });
        doc.fontSize(6).fillColor(COLORS.textLight)
          .text(ev.descripcion.slice(0, 40), evCols[6].x, evY, { width: evCols[6].w });
        evY += 13;
      }

      // Summary
      evY += 8;
      const totalSusc = data.cuotaparteEvents.filter((e) => e.tipo === "SUSCRIPCION").reduce((s, e) => s + e.montoARS, 0);
      const totalResc = data.cuotaparteEvents.filter((e) => e.tipo === "RESCATE").reduce((s, e) => s + e.montoARS, 0);
      const lastCpAcum = data.cuotaparteEvents[data.cuotaparteEvents.length - 1]?.cuotapartesAcum ?? 0;

      doc.fontSize(8).fillColor(COLORS.primary)
        .text(`Total suscripciones: $ ${fmtNum(totalSusc, 0)}  |  Total rescates: $ ${fmtNum(totalResc, 0)}  |  Cuotapartes finales: ${fmtNum(lastCpAcum, 2)}`, 50, evY, { width: contentW });
      evY += 20;

      curY = evY;
    }

    // ═══════════════════════════════════════════════
    // 7. CONCILIACIÓN DE COBERTURA — AUDITORÍA
    // ═══════════════════════════════════════════════
    if (data.coverageHistory.length > 0) {
      curY = checkPageBreak(doc, curY, 200);
      if (curY < 60) {
        // New page was added by checkPageBreak
        curY = 50;
      }
      curY = drawSectionTitle(doc, "Conciliación de Cobertura (Supply vs Colateral)", curY, assetColor);

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text("Verificación diaria de que el colateral total cubre el 100% del supply emitido en todas las cadenas.", 50, curY, { width: contentW });
      curY += 18;

      // Find min ratio
      const minCov = data.coverageHistory.reduce((min, c) => c.ratio < min.ratio ? c : min, data.coverageHistory[0]);
      const avgCov = data.coverageHistory.reduce((s, c) => s + c.ratio, 0) / data.coverageHistory.length;
      const allAbove100 = data.coverageHistory.every((c) => c.ratio >= 100);

      // Status box
      const statusColor = allAbove100 ? "#15803d" : "#b91c1c";
      const statusText = allAbove100
        ? "✓ COBERTURA COMPLETA — El colateral cubrió el 100% del supply en todo el período"
        : "✗ ALERTA — Hubo días con cobertura inferior al 100%";

      doc.rect(50, curY, contentW, 22).fillAndStroke(allAbove100 ? "#f0fdf4" : "#fef2f2", statusColor);
      doc.fontSize(8).fillColor(statusColor)
        .text(statusText, 58, curY + 6, { width: contentW - 16 });
      curY += 30;

      // Metrics
      doc.fontSize(8).fillColor(COLORS.text);
      doc.text(`Ratio promedio: ${avgCov.toFixed(2)}%  |  Ratio mínimo: ${minCov.ratio.toFixed(2)}% (${minCov.date.split("-").reverse().join("/")})  |  Días analizados: ${data.coverageHistory.length}`, 50, curY, { width: contentW });
      curY += 18;

      // Chart
      if (data.coverageHistory.length >= 2) {
        curY = checkPageBreak(doc, curY, 160);
        const covLineData = data.coverageHistory.map((c) => ({
          date: new Date(c.date + "T00:00:00Z"),
          value: c.ratio,
        }));
        drawLineChart(doc, covLineData, 50, curY, contentW, 130, {
          color: allAbove100 ? "#15803d" : "#b91c1c",
          yLabel: "Cobertura (%)",
          yFormat: (v) => `${v.toFixed(1)}%`,
          fillArea: true,
        });
        curY += 145;
      }

      // Sample table (key dates)
      curY = checkPageBreak(doc, curY, 100);
      doc.fontSize(7).fillColor(COLORS.textLight).text("Detalle de fechas clave:", 50, curY);
      curY += 12;

      const covCols = [
        { label: "Fecha", x: 50, w: 70 },
        { label: "Colateral (ARS)", x: 120, w: 120 },
        { label: "Supply", x: 240, w: 100 },
        { label: "Ratio", x: 340, w: 60 },
        { label: "Estado", x: 400, w: 60 },
      ];

      doc.fontSize(6.5).fillColor(COLORS.textLight);
      for (const col of covCols) doc.text(col.label, col.x, curY, { width: col.w });
      curY += 10;
      doc.strokeColor(COLORS.medGray).lineWidth(0.5)
        .moveTo(50, curY).lineTo(50 + contentW, curY).stroke();
      curY += 4;

      // Sample: first, last, monthly, min ratio
      const covSampled = sampleCoverageRows(data.coverageHistory, minCov.date);
      for (const c of covSampled) {
        curY = checkPageBreak(doc, curY, 13);
        const ok = c.ratio >= 100;
        doc.fontSize(7).fillColor(COLORS.text)
          .text(c.date.split("-").reverse().join("/"), covCols[0].x, curY, { width: covCols[0].w })
          .text(`$ ${fmtNum(c.collateral, 0)}`, covCols[1].x, curY, { width: covCols[1].w })
          .text(fmtNum(c.supply, 2), covCols[2].x, curY, { width: covCols[2].w })
          .text(`${c.ratio.toFixed(2)}%`, covCols[3].x, curY, { width: covCols[3].w });
        doc.fillColor(ok ? "#15803d" : "#b91c1c")
          .text(ok ? "OK" : "DEFICIT", covCols[4].x, curY, { width: covCols[4].w });
        curY += 12;
      }
      curY += 10;
    }

    // ═══════════════════════════════════════════════
    // 8. COMPOSICIÓN HISTÓRICA DEL COLATERAL — AUDITORÍA
    // ═══════════════════════════════════════════════
    if (data.collateralBreakdown.length > 0) {
      curY = checkPageBreak(doc, curY, 180);
      curY = drawSectionTitle(doc, "Composición Histórica del Colateral", curY, assetColor);

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text("Distribución del colateral por instrumento en fechas clave. Muestra dónde estaba invertido el respaldo.", 50, curY, { width: contentW });
      curY += 18;

      for (const snapshot of data.collateralBreakdown) {
        curY = checkPageBreak(doc, curY, 40 + snapshot.items.length * 12);

        // Date header
        doc.fontSize(8).fillColor(COLORS.primary)
          .text(`${snapshot.date.split("-").reverse().join("/")}  —  Total: $ ${fmtNum(snapshot.total, 0)}`, 50, curY);
        curY += 13;

        for (const item of snapshot.items) {
          const pct = snapshot.total > 0 ? ((item.valor / snapshot.total) * 100).toFixed(1) : "0";
          doc.fontSize(7).fillColor(COLORS.text)
            .text(`  ${item.tipo}`, 60, curY, { width: 90 });
          doc.text(item.nombre.slice(0, 30), 150, curY, { width: 150 });
          doc.text(`$ ${fmtNum(item.valor, 0)}`, 300, curY, { width: 100 });
          doc.fillColor(COLORS.textLight).text(`${pct}%`, 400, curY, { width: 40 });
          curY += 11;
        }

        curY += 6;
        doc.strokeColor("#eeeeee").lineWidth(0.3)
          .moveTo(50, curY).lineTo(50 + contentW, curY).stroke();
        curY += 6;
      }
    }

    // ═══════════════════════════════════════════════
    // 9. EVOLUCIÓN VCP DEL PORTFOLIO — AUDITORÍA
    // ═══════════════════════════════════════════════
    if (data.vcpHistory.length >= 2) {
      curY = checkPageBreak(doc, curY, 200);
      curY = drawSectionTitle(doc, "Evolución del VCP (Valor Cuotaparte del Portfolio)", curY, assetColor);

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text("El VCP mide el rendimiento real del colateral, eliminando la distorsión por entradas/salidas de capital (minteos y rescates).", 50, curY, { width: contentW });
      curY += 18;

      const firstVcp = data.vcpHistory[0];
      const lastVcp = data.vcpHistory[data.vcpHistory.length - 1];
      const vcpReturn = ((lastVcp.vcp / firstVcp.vcp) - 1) * 100;
      const vcpDias = Math.round((new Date(lastVcp.date).getTime() - new Date(firstVcp.date).getTime()) / 86400000);
      const vcpTNA = vcpDias > 0 ? (vcpReturn / vcpDias) * 365 : 0;

      doc.fontSize(8).fillColor(COLORS.text)
        .text(`VCP inicial: ${fmtNum(firstVcp.vcp, 6)} (${firstVcp.date.split("-").reverse().join("/")})  →  VCP final: ${fmtNum(lastVcp.vcp, 6)} (${lastVcp.date.split("-").reverse().join("/")})`, 50, curY, { width: contentW });
      curY += 14;
      doc.text(`Rendimiento del periodo: ${vcpReturn >= 0 ? "+" : ""}${vcpReturn.toFixed(4)}%  |  TNA: ${vcpTNA.toFixed(2)}%  |  Días: ${vcpDias}`, 50, curY, { width: contentW });
      curY += 18;

      // VCP chart
      curY = checkPageBreak(doc, curY, 160);
      const vcpLineData = data.vcpHistory.map((v) => ({
        date: new Date(v.date + "T00:00:00Z"),
        value: v.vcp,
      }));
      drawLineChart(doc, vcpLineData, 50, curY, contentW, 130, {
        color: assetColor,
        yLabel: "VCP",
        yFormat: (v) => fmtNum(v, 4),
        fillArea: true,
      });
      curY += 155;

      // Patrimonio chart
      curY = checkPageBreak(doc, curY, 160);
      doc.fontSize(8).fillColor(COLORS.textLight).text("Patrimonio total (cuotapartes × VCP):", 50, curY);
      curY += 14;
      const patLineData = data.vcpHistory.map((v) => ({
        date: new Date(v.date + "T00:00:00Z"),
        value: v.patrimonio,
      }));
      drawLineChart(doc, patLineData, 50, curY, contentW, 130, {
        color: COLORS.secondary,
        yLabel: "Patrimonio (ARS)",
        yFormat: (v) => `$${fmtNum(v)}`,
        fillArea: true,
      });
      curY += 155;
    }

    // ═══════════════════════════════════════════════
    // 10. HISTORIAL DE POSICIONES (non-wARS assets) — AUDITORÍA
    // ═══════════════════════════════════════════════
    if (data.positionHistory.length > 0) {
      curY = checkPageBreak(doc, curY, 200);
      curY = drawSectionTitle(doc, "Historial de Posiciones", curY, assetColor);

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text("Detalle de las posiciones que respaldan el colateral en cada fecha reportada.", 50, curY, { width: contentW });
      curY += 18;

      // Group by date
      const byDate = new Map<string, typeof data.positionHistory>();
      for (const p of data.positionHistory) {
        if (!byDate.has(p.date)) byDate.set(p.date, []);
        byDate.get(p.date)!.push(p);
      }

      for (const [date, positions] of Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        curY = checkPageBreak(doc, curY, 30 + positions.length * 22);
        const dateTotal = positions.reduce((s, p) => s + p.valor, 0);

        doc.fontSize(8).fillColor(COLORS.primary)
          .text(`${date.split("-").reverse().join("/")}  —  Total: ${data.currencySymbol} ${fmtNum(dateTotal, 2)}`, 50, curY);
        curY += 14;

        for (const pos of positions) {
          doc.fontSize(7).fillColor(COLORS.text)
            .text(`${pos.detail}`, 60, curY, { width: 250 });
          doc.text(`${data.currencySymbol} ${fmtNum(pos.valor, 2)}`, 310, curY, { width: 120 });
          curY += 11;
          if (pos.extra) {
            doc.fontSize(6).fillColor(COLORS.textLight)
              .text(pos.extra, 65, curY, { width: contentW - 20 });
            curY += 10;
          }
        }
        curY += 5;
        doc.strokeColor("#eeeeee").lineWidth(0.3)
          .moveTo(50, curY).lineTo(50 + contentW, curY).stroke();
        curY += 6;
      }
    }

    // ═══════════════════════════════════════════════
    // 11. RENDIMIENTO HISTÓRICO — AUDITORÍA (non-wARS; wARS uses VCP section above)
    // ═══════════════════════════════════════════════
    if (data.rendimientoHistory.length >= 2 && data.asset !== "wARS") {
      curY = checkPageBreak(doc, curY, 200);
      curY = drawSectionTitle(doc, "Rendimiento Histórico del Colateral", curY, assetColor);

      // Compound return: (1 + r1/100) * (1 + r2/100) * ... - 1
      let compoundFactor = 1;
      for (const r of data.rendimientoHistory) {
        compoundFactor *= (1 + r.rendimiento / 100);
      }
      const totalReturn = (compoundFactor - 1) * 100;
      const dias = data.rendimientoHistory.length;
      const tnaEst = dias > 0 ? (totalReturn / dias) * 365 : 0;
      const avgDaily = dias > 0 ? totalReturn / dias : 0;

      doc.fontSize(8).fillColor(COLORS.text)
        .text(`Rendimiento acumulado del período: ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(4)}%  |  Promedio diario: ${avgDaily.toFixed(4)}%  |  TNA estimada: ${tnaEst.toFixed(2)}%  |  Registros: ${dias}`, 50, curY, { width: contentW });
      curY += 18;

      // Chart — cumulative compound return
      curY = checkPageBreak(doc, curY, 160);
      let cumFactor = 1;
      const cumData = data.rendimientoHistory.map((r) => {
        cumFactor *= (1 + r.rendimiento / 100);
        return { date: new Date(r.date + "T00:00:00Z"), value: (cumFactor - 1) * 100 };
      });

      drawLineChart(doc, cumData, 50, curY, contentW, 130, {
        color: assetColor,
        yLabel: "Rendimiento acumulado (%)",
        yFormat: (v) => `${v.toFixed(2)}%`,
        fillArea: true,
      });
      curY += 155;
    }

    // ═══════════════════════════════════════════════
    // FOOTER (last page only — avoids blank page bug with switchToPage)
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

import { type CoverageRow, type PositionSnapshotRow } from "./data-fetcher";

/** Pick ~15 representative rows from coverage history: first, last, monthly, min ratio */
function sampleCoverageRows(rows: CoverageRow[], minDate: string): CoverageRow[] {
  if (rows.length <= 15) return rows;

  const sampled = new Map<string, CoverageRow>();
  // Always first and last
  sampled.set(rows[0].date, rows[0]);
  sampled.set(rows[rows.length - 1].date, rows[rows.length - 1]);
  // Min ratio date
  const minRow = rows.find((r) => r.date === minDate);
  if (minRow) sampled.set(minRow.date, minRow);
  // Monthly (first of each month or closest)
  const seen = new Set<string>();
  for (const r of rows) {
    const month = r.date.slice(0, 7); // YYYY-MM
    if (!seen.has(month)) {
      seen.add(month);
      sampled.set(r.date, r);
    }
  }
  // If still < 12, fill evenly
  if (sampled.size < 12) {
    const step = Math.floor(rows.length / 12);
    for (let i = 0; i < rows.length; i += step) {
      sampled.set(rows[i].date, rows[i]);
    }
  }
  return Array.from(sampled.values()).sort((a, b) => a.date.localeCompare(b.date));
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
