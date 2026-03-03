// components/cards/RendimientoCarteraCard.tsx
// Card profesional: rendimiento de la cartera con filtro de fechas y desglose

"use client";

import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type RendimientoDiario } from "@/lib/sheets/rendimiento";
import { COLLATERAL_COLORS } from "@/lib/constants/colors";

interface RendimientoCarteraCardProps {
  rendimientoData: RendimientoDiario[];
  tiposQueRinden: string[];
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
  tiposQueRinden,
}: RendimientoCarteraCardProps) {
  // Rango de fechas de los datos
  const dataRange = useMemo(() => {
    if (rendimientoData.length === 0) return { min: "", max: "" };
    return {
      min: rendimientoData[0].dateKey,
      max: rendimientoData[rendimientoData.length - 1].dateKey,
    };
  }, [rendimientoData]);

  const [startDate, setStartDate] = useState(dataRange.max); // Hoy por defecto
  const [endDate, setEndDate] = useState(dataRange.max);
  const [activeQuick, setActiveQuick] = useState<QuickRange>("Today");

  // Cuando llegan los datos, auto-seleccionar el último día (Today)
  useEffect(() => {
    if (dataRange.max) {
      setStartDate(dataRange.max);
      setEndDate(dataRange.max);
    }
  }, [dataRange.max]);

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

  const rindenSet = useMemo(() => new Set(tiposQueRinden), [tiposQueRinden]);

  /**
   * Rendimiento del periodo usando TWR (Time-Weighted Return):
   * - % rendimiento = composición de retornos diarios: ∏(1 + r_i/100) - 1
   * - ARS ganados = Σ(totalColateral_ayer × r_i/100) para cada día del periodo
   *
   * Los retornos diarios vienen del Sheet (fila 37), importados a la DB.
   */
  const metrics = useMemo(() => {
    if (filtered.length === 0) {
      return {
        rendimientoAcumulado: 0,
        valorGanadoARS: 0,
        diasEnPeriodo: 0,
        avgAllocation: {} as Record<string, number>,
      };
    }

    let compounded = 1;
    let valorGanadoARS = 0;

    for (let i = 0; i < filtered.length; i++) {
      const d = filtered[i];
      const dailyReturn = d.rendimiento ?? 0;
      compounded *= (1 + dailyReturn / 100);

      const prevTotal = i > 0 ? (filtered[i - 1].totalColateral ?? 0) : (d.totalColateral ?? 0);
      valorGanadoARS += prevTotal * (dailyReturn / 100);
    }

    const rendimientoAcumulado = (compounded - 1) * 100;

    const sumByTipo: Record<string, number> = {};
    for (const d of filtered) {
      for (const [tipo, pct] of Object.entries(d.allocation ?? {})) {
        sumByTipo[tipo] = (sumByTipo[tipo] ?? 0) + pct;
      }
    }

    const n = filtered.length;
    const avgAllocation: Record<string, number> = {};
    for (const [tipo, sum] of Object.entries(sumByTipo)) {
      avgAllocation[tipo] = sum / n;
    }

    return {
      rendimientoAcumulado,
      valorGanadoARS,
      diasEnPeriodo: n,
      avgAllocation,
    };
  }, [filtered]);

  const rendColor =
    metrics.rendimientoAcumulado > 0
      ? "text-emerald-600"
      : metrics.rendimientoAcumulado < 0
        ? "text-red-600"
        : "text-[#010103]";

  const TIPO_LABEL: Record<string, string> = {
    FCI: "FCI",
    Cuenta_Remunerada: "Cta. Remunerada",
    A_la_Vista: "Saldo Vista",
  };
  const TIPO_COLOR: Record<string, string> = {
    FCI: "#5f6e78",
    Cuenta_Remunerada: "#010103",
    A_la_Vista: COLLATERAL_COLORS.A_la_Vista,
  };

  const instrumentos = useMemo(() => {
    return Object.entries(metrics.avgAllocation)
      .filter(([, pct]) => pct > 0)
      .map(([tipo, avgAlloc]) => ({
        tipo,
        nombre: TIPO_LABEL[tipo] ?? tipo.replace(/_/g, " "),
        color: TIPO_COLOR[tipo] ?? "#6B7280",
        avgAlloc,
      }));
  }, [metrics.avgAllocation]);

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
        Retorno compuesto (TWR) desde rendimiento diario de la cartera
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
            className="w-full border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
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
            className="w-full border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
          />
        </div>
      </div>

      {/* Rendimiento acumulado y valor en ARS */}
      <div className="bg-[#FFFFFF] rounded-xl p-4 mb-5 border border-[#010103]/10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide mb-1">
              Rendimiento del período
            </p>
            <p className={`text-3xl font-bold ${rendColor}`}>
              {metrics.rendimientoAcumulado >= 0 ? "+" : ""}
              {metrics.rendimientoAcumulado.toFixed(4)}%
            </p>
            {metrics.valorGanadoARS !== 0 && (
              <p className={`text-lg font-semibold mt-2 ${metrics.valorGanadoARS > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {metrics.valorGanadoARS >= 0 ? "+" : ""}$
                {metrics.valorGanadoARS.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
              </p>
            )}
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
        <div className="grid grid-cols-12 gap-2 text-xs text-[#010103]/50 uppercase tracking-wide pb-2 border-b border-[#010103]/10">
          <div className="col-span-6">Instrumento</div>
          <div className="col-span-3 text-right">Allocation</div>
          <div className="col-span-3 text-right">Rinde</div>
        </div>

        {instrumentos.map((inst) => (
          <div
            key={inst.tipo}
            className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-[#010103]/5"
          >
            <div className="col-span-6 flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: inst.color }}
              />
              <span className="text-sm text-[#010103] truncate">{inst.nombre}</span>
            </div>
            <div className="col-span-3 text-right">
              <span className="text-sm font-medium text-[#010103]">
                {inst.avgAlloc.toFixed(1)}%
              </span>
            </div>
            <div className="col-span-3 text-right">
              {rindenSet.has(inst.tipo) ? (
                <span className="text-xs text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">Sí</span>
              ) : (
                <span className="text-xs text-[#010103]/40 bg-[#010103]/5 rounded px-1.5 py-0.5">No</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Barra de composición */}
      <div className="mt-4">
        <p className="text-xs text-[#010103]/50 mb-1.5">Composición promedio del período</p>
        <div className="h-3 rounded-full overflow-hidden flex">
          {instrumentos.map((inst) => (
              <div
                key={inst.tipo}
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
          {instrumentos.map((inst) => (
              <span key={inst.tipo} className="text-[10px] text-[#010103]/50">
                {inst.nombre} ({inst.avgAlloc.toFixed(0)}%)
              </span>
            ))}
        </div>
      </div>
    </Card>
  );
}
