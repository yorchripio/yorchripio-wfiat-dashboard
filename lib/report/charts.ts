// lib/report/charts.ts
// Server-side chart rendering using D3 math + PDFKit drawing
// No DOM dependency — pure computation of paths and coordinates

import * as d3Shape from "d3-shape";
import * as d3Scale from "d3-scale";
import * as d3Array from "d3-array";

type PDFDoc = InstanceType<typeof import("pdfkit")>;

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface LinePoint {
  date: Date;
  value: number;
}

/**
 * Draw a pie/donut chart directly on a PDFKit document.
 */
export function drawPieChart(
  doc: PDFDoc,
  data: PieSlice[],
  cx: number,
  cy: number,
  radius: number,
  innerRadius = 0
): void {
  if (data.length === 0) return;

  const pie = d3Shape.pie<PieSlice>().value((d) => d.value).sort(null);
  const arc = d3Shape.arc<d3Shape.PieArcDatum<PieSlice>>()
    .innerRadius(innerRadius)
    .outerRadius(radius);

  const arcs = pie(data);

  for (const a of arcs) {
    const path = arc(a);
    if (path) {
      doc.save();
      doc.translate(cx, cy);
      doc.path(path).fill(a.data.color);
      doc.restore();
    }
  }

  // Legend below chart
  const legendY = cy + radius + 15;
  const legendX = cx - radius;
  const lineHeight = 14;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const y = legendY + i * lineHeight;
    doc.save();
    doc.rect(legendX, y, 8, 8).fill(item.color);
    doc.fillColor("#333333")
      .fontSize(8)
      .text(`${item.label} (${item.value.toFixed(1)}%)`, legendX + 12, y - 1, {
        width: radius * 2 - 12,
      });
    doc.restore();
  }
}

/**
 * Draw a line chart on a PDFKit document with axes and labels.
 */
export function drawLineChart(
  doc: PDFDoc,
  data: LinePoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    color?: string;
    yLabel?: string;
    yFormat?: (v: number) => string;
    fillArea?: boolean;
  } = {}
): void {
  if (data.length < 2) {
    doc.fontSize(9).fillColor("#999999").text("Datos insuficientes", x + width / 2 - 40, y + height / 2);
    return;
  }

  const color = options.color ?? "#006bb7";
  const margin = { top: 10, right: 10, bottom: 25, left: 55 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const plotX = x + margin.left;
  const plotY = y + margin.top;

  const [minDate, maxDate] = d3Array.extent(data, (d) => d.date) as [Date, Date];
  const [minVal, maxVal] = d3Array.extent(data, (d) => d.value) as [number, number];
  const valPad = (maxVal - minVal) * 0.05 || 1;

  const xScale = d3Scale.scaleTime().domain([minDate, maxDate]).range([0, plotW]);
  const yScale = d3Scale.scaleLinear().domain([minVal - valPad, maxVal + valPad]).range([plotH, 0]);

  // Axes
  doc.save();
  doc.strokeColor("#cccccc").lineWidth(0.5);
  // X axis
  doc.moveTo(plotX, plotY + plotH).lineTo(plotX + plotW, plotY + plotH).stroke();
  // Y axis
  doc.moveTo(plotX, plotY).lineTo(plotX, plotY + plotH).stroke();

  // Y ticks (5 ticks)
  const yTicks = yScale.ticks(5);
  const yFormat = options.yFormat ?? ((v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 0 }));
  doc.fontSize(7).fillColor("#666666");
  for (const tick of yTicks) {
    const ty = plotY + yScale(tick);
    doc.strokeColor("#eeeeee").moveTo(plotX, ty).lineTo(plotX + plotW, ty).stroke();
    doc.text(yFormat(tick), x, ty - 4, { width: margin.left - 5, align: "right" });
  }

  // X ticks (dates)
  const xTicks = xScale.ticks(Math.min(data.length, 6));
  for (const tick of xTicks) {
    const tx = plotX + xScale(tick);
    const label = `${tick.getUTCDate()}/${tick.getUTCMonth() + 1}`;
    doc.text(label, tx - 15, plotY + plotH + 5, { width: 30, align: "center" });
  }

  // Line path
  const line = d3Shape.line<LinePoint>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.value));

  const pathStr = line(data);
  if (pathStr) {
    doc.save();
    doc.translate(plotX, plotY);
    doc.path(pathStr).strokeColor(color).lineWidth(1.5).stroke();

    // Fill area under line
    if (options.fillArea) {
      const area = d3Shape.area<LinePoint>()
        .x((d) => xScale(d.date))
        .y0(plotH)
        .y1((d) => yScale(d.value));
      const areaPath = area(data);
      if (areaPath) {
        doc.path(areaPath).fillColor(color).opacity(0.1).fill();
        doc.opacity(1);
      }
    }

    doc.restore();
  }

  // Y label
  if (options.yLabel) {
    doc.save();
    doc.fontSize(7).fillColor("#999999");
    doc.text(options.yLabel, x, plotY - 10, { width: margin.left + plotW });
    doc.restore();
  }

  doc.restore();
}
