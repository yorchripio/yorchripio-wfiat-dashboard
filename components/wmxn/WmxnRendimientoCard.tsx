"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DateTotals {
  fecha: string;
  valorCartera: number;
  plusvalia: number;
  movimientosNetos: number;
}

interface WmxnSummaryData {
  fechaReporte: string;
  earliestInception: string;
  fondo: string;
  serie: string;
  titulosCierre: number;
  precioValuacion: number;
  valorCartera: number;
  valorEstimadoHoy: number;
  daysSinceReport: number;
  plusvalia: number;
  capitalInvertido: number;
  rendimientoAnual: number | null;
  rendimientoMensual: number | null;
  rendimientoDiario: number | null;
  tnaDiario: number | null;
}

function formatMxn(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatPct(n: number, decimals = 2): string {
  return (n * 100).toFixed(decimals) + "%";
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function daysBetween(a: string, b: string): number {
  const d0 = new Date(a + "T12:00:00Z");
  const d1 = new Date(b + "T12:00:00Z");
  return Math.max(1, Math.round((d1.getTime() - d0.getTime()) / 86400000));
}

type QuickRange = "YTD" | "1M" | "3M" | "All";

function computeTargetStart(fechaFin: string, range: QuickRange): string {
  const d = new Date(fechaFin + "T12:00:00Z");
  switch (range) {
    case "YTD":
      return `${d.getUTCFullYear()}-01-01`;
    case "1M": {
      const m = new Date(d);
      m.setUTCMonth(m.getUTCMonth() - 1);
      return m.toISOString().slice(0, 10);
    }
    case "3M": {
      const m = new Date(d);
      m.setUTCMonth(m.getUTCMonth() - 3);
      return m.toISOString().slice(0, 10);
    }
    case "All":
      return "2024-01-01";
  }
}

/** Find the closest date <= target in a sorted array of dates */
function findClosestDate(dates: string[], target: string): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (d <= target) best = d;
    else break;
  }
  return best;
}

export function WmxnRendimientoCard(): React.ReactElement {
  const [summary, setSummary] = useState<WmxnSummaryData | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [totalsByDate, setTotalsByDate] = useState<DateTotals[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [activeQuick, setActiveQuick] = useState<QuickRange>("YTD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (fecha?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fecha) params.set("fecha", fecha);
      const qs = params.toString();
      const res = await fetch(`/api/wmxn/summary${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSummary(json.data);
        setAvailableDates(json.availableDates ?? []);
        setTotalsByDate(json.totalsByDate ?? []);
        if (!fecha && json.data.fechaReporte) {
          setSelectedDate(json.data.fechaReporte);
        }
      } else if (json.success && !json.data) {
        setError("No hay posiciones wMXN cargadas. Sube el PDF en la seccion de abajo.");
      } else {
        setError(json.error || "Error cargando datos");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Sorted dates from totalsByDate
  const sortedDates = useMemo(() => totalsByDate.map((t) => t.fecha), [totalsByDate]);
  const totalsMap = useMemo(() => {
    const m = new Map<string, DateTotals>();
    for (const t of totalsByDate) m.set(t.fecha, t);
    return m;
  }, [totalsByDate]);

  // Earliest inception date (periodoInicio of first position, from API)
  const earliestInception = useMemo(() => {
    return summary?.earliestInception ?? null;
  }, [summary]);

  // Compute period metrics
  const periodMetrics = useMemo(() => {
    if (!summary || totalsByDate.length === 0) return null;

    // Use today as the effective end date (extrapolated from rendimientoAnual)
    const today = new Date().toISOString().slice(0, 10);
    const fechaFin = today;
    const valorActual = summary.valorEstimadoHoy;

    const endTotals = totalsMap.get(summary.fechaReporte);
    if (!endTotals) return null;

    const targetStart = computeTargetStart(fechaFin, activeQuick);
    const closestStart = findClosestDate(sortedDates, targetStart);

    const hasHistoricalStart = closestStart != null && closestStart < summary.fechaReporte;
    const startTotals = hasHistoricalStart ? totalsMap.get(closestStart) : null;

    let pctPeriodo: number;
    let dias: number;
    let displayStart: string;
    let isEstimated = false;

    if (startTotals) {
      // Case 1: We have actual data at the start of the period
      // Subtract net capital flows between start and end to isolate fund return
      const base = startTotals.valorCartera;
      const flowsDelta = endTotals.movimientosNetos - startTotals.movimientosNetos;
      pctPeriodo = base > 0 ? (valorActual - base - flowsDelta) / base : 0;
      dias = daysBetween(closestStart!, fechaFin);
      displayStart = closestStart!;
      isEstimated = summary.daysSinceReport > 0;
    } else {
      // Case 2: No historical data for start date — use Banregio's rendimientoAnual
      // to derive daily rate and compound for the requested period
      const rendAnual = summary.rendimientoAnual ? summary.rendimientoAnual / 100 : 0;
      const dailyRate = rendAnual > 0 ? Math.pow(1 + rendAnual, 1 / 365) - 1 : 0;

      const realStart = earliestInception ?? summary.fechaReporte;
      const totalDias = daysBetween(realStart, fechaFin);

      // Days for the requested period (capped to totalDias)
      const targetDias = daysBetween(targetStart, fechaFin);
      dias = Math.min(targetDias, totalDias);

      // Estimated return for the requested period using fund's actual daily rate
      pctPeriodo = dailyRate > 0 ? Math.pow(1 + dailyRate, dias) - 1 : 0;

      displayStart = dias < totalDias ? targetStart : realStart;
      isEstimated = true;
    }

    // Plusvalia del periodo: value change minus capital flows
    const flowsDeltaPlusvalia = startTotals
      ? endTotals.movimientosNetos - startTotals.movimientosNetos
      : 0;
    // Plusvalia = rendimiento sobre el valor actual (excluye flujos de capital)
    const plusvaliaPeriodo = startTotals
      ? valorActual - startTotals.valorCartera - flowsDeltaPlusvalia
      : valorActual * pctPeriodo; // Use calculated % applied to current value

    // TNA = % periodo x (365 / dias)
    const tnaPeriodo = dias > 0 ? pctPeriodo * (365 / dias) : 0;

    // TEA = (1 + % periodo) ^ (365/dias) - 1
    const teaPeriodo = dias > 0 ? Math.pow(1 + pctPeriodo, 365 / dias) - 1 : 0;

    return {
      fechaInicio: displayStart,
      fechaFin,
      dias,
      pctPeriodo,
      plusvaliaPeriodo,
      tnaPeriodo,
      teaPeriodo,
      isEstimated,
    };
  }, [summary, activeQuick, totalsByDate, totalsMap, sortedDates, earliestInception]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    fetchSummary(newDate);
  };

  if (loading && !summary) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
        {error}
      </div>
    );
  }

  if (!summary || !periodMetrics) return <></>;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#010103]">
              Rendimiento Fondo REGIO1 — Banregio
            </h3>
            <p className="text-sm text-[#010103]/60">
              {summary.fondo} Serie {summary.serie} &middot; {summary.titulosCierre.toLocaleString("es-MX", { maximumFractionDigits: 6 })} titulos
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSummary(selectedDate)}
            disabled={loading}
          >
            <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        {/* Date picker + Quick filters */}
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <div>
            <label className="block text-xs text-[#010103]/60 mb-1">Fecha reporte</label>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            {(["YTD", "1M", "3M", "All"] as QuickRange[]).map((q) => (
              <Button
                key={q}
                variant={activeQuick === q ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setActiveQuick(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        </div>

        {/* Rendimiento diario destacado */}
        {summary.rendimientoDiario != null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
            <p className="text-xs text-emerald-700/70 uppercase tracking-wide mb-1">
              Rendimiento diario (vs reporte anterior)
            </p>
            <div className="flex flex-wrap items-baseline gap-6">
              <div>
                <span className={`text-2xl font-bold ${summary.rendimientoDiario >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {summary.rendimientoDiario >= 0 ? "+" : ""}{summary.rendimientoDiario.toFixed(4)}%
                </span>
              </div>
              {summary.tnaDiario != null && (
                <div>
                  <span className="text-sm text-[#010103]/60">TNA equiv.: </span>
                  <span className={`text-lg font-semibold ${summary.tnaDiario >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {summary.tnaDiario.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rendimiento del periodo */}
        <div className="bg-[#FFFFFF] rounded-xl p-4 border border-[#010103]/10 mb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-1">
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide mb-1">
                Rendimiento del periodo ({activeQuick}){periodMetrics.isEstimated ? " · estimado" : ""}
              </p>
              <p className={`text-2xl font-bold ${periodMetrics.pctPeriodo >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {periodMetrics.pctPeriodo >= 0 ? "+" : ""}{formatPct(periodMetrics.pctPeriodo, 4)}
              </p>
            </div>
            <div className="text-right text-sm text-[#010103]/60">
              <p>{periodMetrics.dias} dias</p>
              <p>{formatDate(periodMetrics.fechaInicio)} &rarr; {formatDate(periodMetrics.fechaFin)}</p>
              {periodMetrics.isEstimated && (
                <p className="text-xs text-amber-600">
                  Estimado (retorno diario compuesto)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Grid de metricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Plusvalia y ganancias del periodo */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Plusvalia del Periodo ({activeQuick}){periodMetrics.isEstimated ? " · est." : ""}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Plusvalia del periodo</span>
                <span className={`font-mono font-medium ${periodMetrics.plusvaliaPeriodo >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {formatMxn(periodMetrics.plusvaliaPeriodo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Valor Cartera al {summary.fechaReporte.split("-").reverse().join("/")}</span>
                <span className="font-mono font-medium">{formatMxn(summary.valorCartera)}</span>
              </div>
              {summary.daysSinceReport > 0 && summary.valorEstimadoHoy > summary.valorCartera && (
                <div className="flex justify-between">
                  <span className="text-[#010103]/60">Valor estimado hoy (+{summary.daysSinceReport}d)</span>
                  <span className="font-mono font-medium text-emerald-700">{formatMxn(summary.valorEstimadoHoy)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Capital Invertido</span>
                <span className="font-mono font-medium">{formatMxn(summary.capitalInvertido)}</span>
              </div>
            </div>
          </div>

          {/* Tasas anualizadas */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Tasas Anualizadas ({activeQuick}){periodMetrics.isEstimated ? " · est." : ""}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TNA</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.tnaPeriodo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TEA</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.teaPeriodo)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rendimientos Banregio */}
        <div className="mt-4 rounded-xl border border-[#010103]/10 p-4">
          <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Rendimientos Banregio (segun estado de cuenta)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[#010103]/60 text-xs">Precio Valuacion</p>
              <p className="font-mono font-medium">{formatMxn(summary.precioValuacion)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Plusvalia Total</p>
              <p className={`font-mono font-medium ${summary.plusvalia >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {formatMxn(summary.plusvalia)}
              </p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Rendimiento Anual</p>
              <p className="font-mono font-medium">{summary.rendimientoAnual?.toFixed(2) ?? "—"}%</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Rendimiento Mensual</p>
              <p className="font-mono font-medium">{summary.rendimientoMensual?.toFixed(4) ?? "—"}%</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
