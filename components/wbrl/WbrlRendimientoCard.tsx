"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CdbPosition {
  id: string;
  fechaInicio: string;
  fechaVencimento: string;
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
}

interface DateTotals {
  fecha: string;
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
}

interface WbrlSummaryData {
  fechaReporte: string;
  estructura: {
    emisor: string;
    instrumento: string;
    indexador: string;
    cantidadPosiciones: number;
  };
  colateral: {
    positions: CdbPosition[];
    totales: {
      capitalInicial: number;
      valorBruto: number;
      valorLiquido: number;
      ir: number;
    };
  };
  rendimientoDiario: number | null;
  tnaDiario: number | null;
}

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

export function WbrlRendimientoCard(): React.ReactElement {
  const [summary, setSummary] = useState<WbrlSummaryData | null>(null);
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
      const res = await fetch(`/api/wbrl/summary${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSummary(json.data);
        setAvailableDates(json.availableDates ?? []);
        setTotalsByDate(json.totalsByDate ?? []);
        if (!fecha && json.data.fechaReporte) {
          setSelectedDate(json.data.fechaReporte);
        }
      } else if (json.success && !json.data) {
        setError("No hay posiciones wBRL cargadas. Subí el PDF en la sección de abajo.");
      } else {
        setError(json.error || "Error cargando datos");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Sorted dates from totalsByDate (already sorted from API)
  const sortedDates = useMemo(() => totalsByDate.map((t) => t.fecha), [totalsByDate]);
  const totalsMap = useMemo(() => {
    const m = new Map<string, DateTotals>();
    for (const t of totalsByDate) m.set(t.fecha, t);
    return m;
  }, [totalsByDate]);

  // Earliest CDB start date (from positions) — used when no historical data available
  const earliestInception = useMemo(() => {
    if (!summary?.colateral.positions.length) return null;
    return summary.colateral.positions.reduce(
      (min, p) => (p.fechaInicio < min ? p.fechaInicio : min),
      summary.colateral.positions[0].fechaInicio
    );
  }, [summary]);

  // Compute real period metrics using actual data at start and end dates
  // When only 1 data point exists, we interpolate using compound daily return
  const periodMetrics = useMemo(() => {
    if (!summary || totalsByDate.length === 0) return null;

    const fechaFin = summary.fechaReporte;
    const endTotals = totalsMap.get(fechaFin);
    if (!endTotals) return null;

    const targetStart = computeTargetStart(fechaFin, activeQuick);
    const closestStart = findClosestDate(sortedDates, targetStart);

    // Do we have actual historical data for this period?
    const hasHistoricalStart = closestStart != null && closestStart < fechaFin;
    const startTotals = hasHistoricalStart ? totalsMap.get(closestStart) : null;

    let pctBruto: number;
    let pctLiquido: number;
    let dias: number;
    let displayStart: string;
    let isEstimated = false;

    if (startTotals) {
      // Case 1: We have actual data at the start of the period
      const baseBruto = startTotals.valorBruto;
      const baseLiquido = startTotals.valorLiquido;
      pctBruto = baseBruto > 0 ? (endTotals.valorBruto - baseBruto) / baseBruto : 0;
      pctLiquido = baseLiquido > 0 ? (endTotals.valorLiquido - baseLiquido) / baseLiquido : 0;
      dias = daysBetween(closestStart!, fechaFin);
      displayStart = closestStart!;
    } else {
      // Case 2: No historical data — interpolate from inception return
      // Total return since inception (capital → bruto)
      const totalRetBruto = endTotals.capitalInicial > 0
        ? (endTotals.valorBruto - endTotals.capitalInicial) / endTotals.capitalInicial : 0;
      const totalRetLiquido = endTotals.capitalInicial > 0
        ? (endTotals.valorLiquido - endTotals.capitalInicial) / endTotals.capitalInicial : 0;

      // Days since CDB inception
      const realStart = earliestInception ?? fechaFin;
      const totalDias = daysBetween(realStart, fechaFin);

      // Daily compound rate: (1 + totalRet)^(1/totalDias) - 1
      const dailyBruto = Math.pow(1 + totalRetBruto, 1 / totalDias) - 1;
      const dailyLiquido = Math.pow(1 + totalRetLiquido, 1 / totalDias) - 1;

      // Days for the requested period (capped to totalDias)
      const targetDias = daysBetween(targetStart, fechaFin);
      dias = Math.min(targetDias, totalDias);

      // Estimated return for the requested period
      pctBruto = Math.pow(1 + dailyBruto, dias) - 1;
      pctLiquido = Math.pow(1 + dailyLiquido, dias) - 1;

      displayStart = dias < totalDias ? targetStart : realStart;
      isEstimated = true;
    }

    // TNA = % periodo × (365 / dias)
    const tnaBruto = pctBruto * (365 / dias);
    const tnaLiquido = pctLiquido * (365 / dias);

    // TEA = (1 + % periodo) ^ (365/dias) - 1
    const teaBruto = Math.pow(1 + pctBruto, 365 / dias) - 1;
    const teaLiquido = Math.pow(1 + pctLiquido, 365 / dias) - 1;

    // Ganancias estimated from pct × capital
    const gananciaBruta = isEstimated
      ? pctBruto * endTotals.capitalInicial
      : endTotals.valorBruto - (startTotals ? startTotals.valorBruto : endTotals.capitalInicial);
    const gananciaLiquida = isEstimated
      ? pctLiquido * endTotals.capitalInicial
      : endTotals.valorLiquido - (startTotals ? startTotals.valorLiquido : endTotals.capitalInicial);

    return {
      fechaInicio: displayStart,
      fechaFin,
      dias,
      pctBruto,
      pctLiquido,
      tnaBruto,
      tnaLiquido,
      teaBruto,
      teaLiquido,
      gananciaBruta,
      gananciaLiquida,
      ir: endTotals.ir,
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

  const { estructura, colateral, rendimientoDiario, tnaDiario } = summary;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#010103]">
              Rendimiento CDB — {estructura.emisor}
            </h3>
            <p className="text-sm text-[#010103]/60">
              {estructura.instrumento} · {estructura.cantidadPosiciones} posiciones
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
        {rendimientoDiario != null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
            <p className="text-xs text-emerald-700/70 uppercase tracking-wide mb-1">
              Rendimiento diario (vs reporte anterior)
            </p>
            <div className="flex flex-wrap items-baseline gap-6">
              <div>
                <span className={`text-2xl font-bold ${rendimientoDiario >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {rendimientoDiario >= 0 ? "+" : ""}{rendimientoDiario.toFixed(4)}%
                </span>
              </div>
              {tnaDiario != null && (
                <div>
                  <span className="text-sm text-[#010103]/60">TNA equiv.: </span>
                  <span className={`text-lg font-semibold ${tnaDiario >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {tnaDiario.toFixed(2)}%
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
              <p className={`text-2xl font-bold ${periodMetrics.pctBruto >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {periodMetrics.pctBruto >= 0 ? "+" : ""}{formatPct(periodMetrics.pctBruto, 4)}
                <span className="text-base font-normal text-[#010103]/50 ml-2">bruto</span>
              </p>
              <p className={`text-lg font-semibold ${periodMetrics.pctLiquido >= 0 ? "text-emerald-700/80" : "text-red-500"}`}>
                {periodMetrics.pctLiquido >= 0 ? "+" : ""}{formatPct(periodMetrics.pctLiquido, 4)}
                <span className="text-sm font-normal text-[#010103]/50 ml-2">liquido</span>
              </p>
            </div>
            <div className="text-right text-sm text-[#010103]/60">
              <p>{periodMetrics.dias} días</p>
              <p>{formatDate(periodMetrics.fechaInicio)} → {formatDate(periodMetrics.fechaFin)}</p>
              {periodMetrics.isEstimated && (
                <p className="text-xs text-amber-600">
                  Estimado (retorno diario compuesto)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Grid de métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ganancias del periodo */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Ganancias {`(${activeQuick})${periodMetrics.isEstimated ? " · est." : ""}`}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Ganancia Bruta</span>
                <span className={`font-mono font-medium ${periodMetrics.gananciaBruta >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {formatBrl(periodMetrics.gananciaBruta)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">IR Retenido</span>
                <span className="font-mono font-medium text-red-600">{formatBrl(periodMetrics.ir)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Ganancia Liquida</span>
                <span className={`font-mono font-medium ${periodMetrics.gananciaLiquida >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {formatBrl(periodMetrics.gananciaLiquida)}
                </span>
              </div>
            </div>
          </div>

          {/* Tasas anualizadas */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Tasas Anualizadas {`(${activeQuick})${periodMetrics.isEstimated ? " · est." : ""}`}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TNA Bruto</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.tnaBruto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TNA Liquido</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.tnaLiquido)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TEA Bruto</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.teaBruto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TEA Liquido</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.teaLiquido)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Totales colateral */}
        <div className="mt-4 rounded-xl border border-[#010103]/10 p-4">
          <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Totales Colateral</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[#010103]/60 text-xs">Capital Inicial</p>
              <p className="font-mono font-medium">{formatBrl(colateral.totales.capitalInicial)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Valor Bruto</p>
              <p className="font-mono font-medium">{formatBrl(colateral.totales.valorBruto)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Valor Liquido</p>
              <p className="font-mono font-medium">{formatBrl(colateral.totales.valorLiquido)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">IR Retenido</p>
              <p className="font-mono font-medium text-red-600">{formatBrl(colateral.totales.ir)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabla de posiciones CDB */}
      <Card className="p-6">
        <h3 className="font-semibold text-[#010103] mb-4">
          Posiciones CDB Colateral ({colateral.positions.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#010103]/5">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[#010103]/60">Inicio</th>
                <th className="px-3 py-2 text-left font-medium text-[#010103]/60">Vencimiento</th>
                <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Capital</th>
                <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Bruto</th>
                <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Liquido</th>
                <th className="px-3 py-2 text-right font-medium text-[#010103]/60">IR</th>
              </tr>
            </thead>
            <tbody>
              {colateral.positions.map((p) => (
                <tr key={p.id} className="border-t border-[#010103]/5">
                  <td className="px-3 py-2">{formatDate(p.fechaInicio)}</td>
                  <td className="px-3 py-2">{formatDate(p.fechaVencimento)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatBrl(p.capitalInicial)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatBrl(p.valorBruto)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatBrl(p.valorLiquido)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{formatBrl(p.ir)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#010103]/5 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-right font-mono">{formatBrl(colateral.totales.capitalInicial)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatBrl(colateral.totales.valorBruto)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatBrl(colateral.totales.valorLiquido)}</td>
                <td className="px-3 py-2 text-right font-mono text-red-600">{formatBrl(colateral.totales.ir)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
