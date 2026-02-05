// components/cards/RendimientoCarteraCard.tsx
// Card profesional: rendimiento de la cartera con filtro de fechas y desglose

"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type RendimientoDiario } from "@/lib/sheets/rendimiento";
import { COLLATERAL_COLORS } from "@/lib/constants/colors";

interface RendimientoCarteraCardProps {
  rendimientoData: RendimientoDiario[];
}

type QuickRange = "Today" | "1W" | "1M" | "3M" | "YTD" | "All";

// Convertir "YYYY-MM-DD" a timestamp UTC
function dateInputToTimestamp(val: string): number {
  const [y, m, d] = val.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Convertir timestamp a "YYYY-MM-DD" para el input
function timestampToDateInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function RendimientoCarteraCard({
  rendimientoData,
}: RendimientoCarteraCardProps) {
  // Rango de fechas de los datos
  const dataRange = useMemo(() => {
    if (rendimientoData.length === 0) return { min: "", max: "" };
    return {
      min: rendimientoData[0].dateKey,
      max: rendimientoData[rendimientoData.length - 1].dateKey,
    };
  }, [rendimientoData]);

  const [startDate, setStartDate] = useState(dataRange.min);
  const [endDate, setEndDate] = useState(dataRange.max);
  const [activeQuick, setActiveQuick] = useState<QuickRange>("All");

  // Aplicar filtro rápido
  const applyQuick = (range: QuickRange) => {
    setActiveQuick(range);
    if (rendimientoData.length === 0) return;

    const maxTs = rendimientoData[rendimientoData.length - 1].timestamp;
    const maxDate = new Date(maxTs);
    const newEnd = timestampToDateInput(maxTs);
    setEndDate(newEnd);

    let cutoff: Date;
    switch (range) {
      case "Today":
        // Mismo día que la última fecha
        setStartDate(newEnd);
        return;
      case "1W":
        cutoff = new Date(maxDate);
        cutoff.setUTCDate(cutoff.getUTCDate() - 7);
        break;
      case "1M":
        cutoff = new Date(maxDate);
        cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
        break;
      case "3M":
        cutoff = new Date(maxDate);
        cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
        break;
      case "YTD":
        cutoff = new Date(Date.UTC(maxDate.getUTCFullYear(), 0, 1));
        break;
      case "All":
      default:
        setStartDate(dataRange.min);
        return;
    }
    setStartDate(timestampToDateInput(cutoff.getTime()));
  };

  // Filtrar datos por rango
  const filtered = useMemo(() => {
    if (!startDate || !endDate) return rendimientoData;
    const startTs = dateInputToTimestamp(startDate);
    const endTs = dateInputToTimestamp(endDate) + 86400000 - 1; // incluir el día completo
    return rendimientoData.filter((d) => d.timestamp >= startTs && d.timestamp <= endTs);
  }, [rendimientoData, startDate, endDate]);

  // Calcular métricas del periodo
  const metrics = useMemo(() => {
    if (filtered.length === 0) {
      return {
        rendimientoAcumulado: 0,
        diasEnPeriodo: 0,
        avgAllocation: { fci: 0, ctaRem: 0, saldoVista: 0 },
        totalAportes: { fci: 0, ctaRem: 0, saldoVista: 0 },
      };
    }

    // Rendimiento acumulado = suma de rendimientos diarios
    // (para períodos cortos la suma es una buena aproximación;
    //  para períodos largos se puede componer, pero la diferencia es mínima con tasas diarias pequeñas)
    let rendimientoAcumulado = 0;
    let sumAllocFci = 0,
      sumAllocCtaRem = 0,
      sumAllocSaldo = 0;
    let sumAporteFci = 0,
      sumAporteCtaRem = 0,
      sumAporteSaldo = 0;

    for (const d of filtered) {
      rendimientoAcumulado += d.rendimiento;
      sumAllocFci += d.allocation.fci;
      sumAllocCtaRem += d.allocation.ctaRem;
      sumAllocSaldo += d.allocation.saldoVista;
      sumAporteFci += d.aportes.fci;
      sumAporteCtaRem += d.aportes.ctaRem;
      sumAporteSaldo += d.aportes.saldoVista;
    }

    const n = filtered.length;

    return {
      rendimientoAcumulado,
      diasEnPeriodo: n,
      avgAllocation: {
        fci: sumAllocFci / n,
        ctaRem: sumAllocCtaRem / n,
        saldoVista: sumAllocSaldo / n,
      },
      totalAportes: {
        fci: sumAporteFci,
        ctaRem: sumAporteCtaRem,
        saldoVista: sumAporteSaldo,
      },
    };
  }, [filtered]);

  // Color del rendimiento
  const rendColor =
    metrics.rendimientoAcumulado > 0
      ? "text-emerald-600"
      : metrics.rendimientoAcumulado < 0
        ? "text-red-600"
        : "text-[#010103]";

  // Instrumentos para la tabla
  const instrumentos = [
    {
      nombre: "FCI Comercio",
      color: "#4A13A5",
      avgAlloc: metrics.avgAllocation.fci,
      aporte: metrics.totalAportes.fci,
    },
    {
      nombre: "Cta. Remunerada",
      color: "#010103",
      avgAlloc: metrics.avgAllocation.ctaRem,
      aporte: metrics.totalAportes.ctaRem,
    },
    {
      nombre: "Saldo Vista",
      color: COLLATERAL_COLORS.A_la_Vista,
      avgAlloc: metrics.avgAllocation.saldoVista,
      aporte: metrics.totalAportes.saldoVista,
    },
  ];

  if (rendimientoData.length === 0) {
    return (
      <Card className="p-6 flex items-center justify-center text-[#010103]/50 text-sm min-h-[320px]">
        Cargando datos de rendimiento...
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* Header */}
      <h3 className="text-lg font-semibold text-[#010103] mb-1">
        Rendimiento de la cartera
      </h3>
      <p className="text-sm text-[#010103]/60 mb-4">
        Rendimiento ponderado por allocación en cada instrumento
      </p>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(["Today", "1W", "1M", "3M", "YTD", "All"] as QuickRange[]).map((q) => (
          <Button
            key={q}
            variant={activeQuick === q ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => applyQuick(q)}
          >
            {q === "All" ? "History" : q}
          </Button>
        ))}
      </div>

      {/* Date pickers */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <label className="block text-xs text-[#010103]/60 mb-1">Desde</label>
          <input
            type="date"
            value={startDate}
            min={dataRange.min}
            max={dataRange.max}
            onChange={(e) => {
              setStartDate(e.target.value);
              setActiveQuick("All"); // desactivar quick filters
            }}
            className="w-full border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A13A5]"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-[#010103]/60 mb-1">Hasta</label>
          <input
            type="date"
            value={endDate}
            min={dataRange.min}
            max={dataRange.max}
            onChange={(e) => {
              setEndDate(e.target.value);
              setActiveQuick("All");
            }}
            className="w-full border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A13A5]"
          />
        </div>
      </div>

      {/* Rendimiento acumulado */}
      <div className="bg-[#FFFFFF] rounded-xl p-4 mb-5 border border-[#010103]/10">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide mb-1">
              Rendimiento del período
            </p>
            <p className={`text-3xl font-bold ${rendColor}`}>
              {metrics.rendimientoAcumulado >= 0 ? "+" : ""}
              {metrics.rendimientoAcumulado.toFixed(4)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#010103]/60">{metrics.diasEnPeriodo} días</p>
            {filtered.length > 0 && (
              <p className="text-xs text-[#010103]/50">
                {filtered[0].fecha} → {filtered[filtered.length - 1].fecha}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de instrumentos */}
      <div className="space-y-0">
        {/* Header de tabla */}
        <div className="grid grid-cols-12 gap-2 text-xs text-[#010103]/50 uppercase tracking-wide pb-2 border-b border-[#010103]/10">
          <div className="col-span-5">Instrumento</div>
          <div className="col-span-3 text-right">Allocation</div>
          <div className="col-span-4 text-right">Aporte al rend.</div>
        </div>

        {instrumentos.map((inst) => (
          <div
            key={inst.nombre}
            className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-[#010103]/5"
          >
            {/* Nombre con indicador de color */}
            <div className="col-span-5 flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: inst.color }}
              />
              <span className="text-sm text-[#010103] truncate">{inst.nombre}</span>
            </div>
            {/* Allocation promedio */}
            <div className="col-span-3 text-right">
              <span className="text-sm font-medium text-[#010103]">
                {inst.avgAlloc.toFixed(1)}%
              </span>
            </div>
            {/* Aporte acumulado */}
            <div className="col-span-4 text-right">
              <span
                className={`text-sm font-medium ${
                  inst.aporte > 0
                    ? "text-emerald-600"
                    : inst.aporte < 0
                      ? "text-red-600"
                      : "text-[#010103]/60"
                }`}
              >
                {inst.aporte >= 0 ? "+" : ""}
                {inst.aporte.toFixed(4)}%
              </span>
            </div>
          </div>
        ))}

        {/* Fila total */}
        <div className="grid grid-cols-12 gap-2 items-center pt-3">
          <div className="col-span-5">
            <span className="text-sm font-semibold text-[#010103]">Total</span>
          </div>
          <div className="col-span-3 text-right">
            <span className="text-sm font-semibold text-[#010103]">100%</span>
          </div>
          <div className="col-span-4 text-right">
            <span className={`text-sm font-semibold ${rendColor}`}>
              {metrics.rendimientoAcumulado >= 0 ? "+" : ""}
              {metrics.rendimientoAcumulado.toFixed(4)}%
            </span>
          </div>
        </div>
      </div>

      {/* Barra de composición */}
      <div className="mt-4">
        <p className="text-xs text-[#010103]/50 mb-1.5">Composición promedio del período</p>
        <div className="h-3 rounded-full overflow-hidden flex">
          {instrumentos
            .filter((i) => i.avgAlloc > 0)
            .map((inst) => (
              <div
                key={inst.nombre}
                className="h-full transition-all"
                style={{
                  width: `${inst.avgAlloc}%`,
                  backgroundColor: inst.color,
                }}
                title={`${inst.nombre}: ${inst.avgAlloc.toFixed(1)}%`}
              />
            ))}
        </div>
        <div className="flex justify-between mt-1">
          {instrumentos
            .filter((i) => i.avgAlloc > 0)
            .map((inst) => (
              <span key={inst.nombre} className="text-[10px] text-[#010103]/50">
                {inst.nombre} ({inst.avgAlloc.toFixed(0)}%)
              </span>
            ))}
        </div>
      </div>
    </Card>
  );
}
