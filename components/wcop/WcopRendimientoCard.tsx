"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DateTotals {
  fecha: string;
  saldoFinal: number;
  capitalWcop: number;
  rendimientos: number;
  rendimientosAcum: number;
}

interface WcopSummaryData {
  fechaCorte: string;
  earliestInception: string;
  periodoInicio: string;
  periodoFin: string;
  saldoFinal: number;
  capitalWcop: number;
  rendimientos: number;
  retirosMM: number;
  depositosMM: number;
  impuestos: number;
}

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
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

export function WcopRendimientoCard(): React.ReactElement {
  const [summary, setSummary] = useState<WcopSummaryData | null>(null);
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
      const res = await fetch(`/api/wcop/summary${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSummary(json.data);
        setAvailableDates(json.availableDates ?? []);
        setTotalsByDate(json.totalsByDate ?? []);
        if (!fecha && json.data.fechaCorte) {
          setSelectedDate(json.data.fechaCorte);
        }
      } else if (json.success && !json.data) {
        setError("No hay snapshots wCOP cargados. Subi el CSV en la seccion de abajo.");
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

  // Earliest inception date (periodoInicio of first snapshot, from API)
  const earliestInception = useMemo(() => {
    return summary?.earliestInception ?? null;
  }, [summary]);

  // Compute period metrics
  const periodMetrics = useMemo(() => {
    if (!summary || totalsByDate.length === 0) return null;

    const fechaFin = summary.fechaCorte;
    const endTotals = totalsMap.get(fechaFin);
    if (!endTotals) {
      // Fall back to last entry
      const lastEntry = totalsByDate[totalsByDate.length - 1];
      if (!lastEntry) return null;
    }

    const end = endTotals ?? totalsByDate[totalsByDate.length - 1];
    const targetStart = computeTargetStart(fechaFin, activeQuick);
    const closestStart = findClosestDate(sortedDates, targetStart);

    const hasHistoricalStart = closestStart != null && closestStart < fechaFin;
    const startTotals = hasHistoricalStart ? totalsMap.get(closestStart) : null;

    let periodPct: number;
    let dias: number;
    let displayStart: string;
    let isEstimated = false;
    let periodRendimientos: number;

    if (startTotals) {
      // Case 1: We have actual historical data at start of period
      // Sum rendimientos in the period
      periodRendimientos = 0;
      for (const t of totalsByDate) {
        if (t.fecha > closestStart! && t.fecha <= fechaFin) {
          periodRendimientos += t.rendimientos;
        }
      }
      const base = startTotals.capitalWcop > 0 ? startTotals.capitalWcop : end.capitalWcop;
      periodPct = base > 0 ? periodRendimientos / base : 0;
      dias = daysBetween(closestStart!, fechaFin);
      displayStart = closestStart!;
    } else {
      // Case 2: No historical data (single snapshot)
      periodRendimientos = end.rendimientos;
      const realStart = earliestInception ?? fechaFin;
      const totalDias = daysBetween(realStart, fechaFin);
      const totalPct = end.capitalWcop > 0 ? end.rendimientosAcum / end.capitalWcop : 0;

      // Daily compound rate
      const dailyRate = Math.pow(1 + totalPct, 1 / totalDias) - 1;

      const targetDias = daysBetween(targetStart, fechaFin);
      dias = Math.min(targetDias, totalDias);

      periodPct = Math.pow(1 + dailyRate, dias) - 1;
      periodRendimientos = periodPct * end.capitalWcop;
      displayStart = dias < totalDias ? targetStart : realStart;
      isEstimated = true;
    }

    // Daily return
    const rendimientoDiario = dias > 0 ? periodPct / dias : 0;

    // TNA = % periodo x (365 / dias)
    const tna = periodPct * (365 / dias);

    // TEA = (1 + % periodo) ^ (365/dias) - 1
    const tea = Math.pow(1 + periodPct, 365 / dias) - 1;

    // Ratio de cobertura
    const ratioCobertura = end.capitalWcop > 0 ? end.saldoFinal / end.capitalWcop : 0;

    return {
      fechaInicio: displayStart,
      fechaFin,
      dias,
      periodPct,
      rendimientoDiario,
      tna,
      tea,
      periodRendimientos,
      saldoFinal: end.saldoFinal,
      capitalWcop: end.capitalWcop,
      ratioCobertura,
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
              Rendimiento Cuenta Ahorro — Finandina
            </h3>
            <p className="text-sm text-[#010103]/60">
              Cuenta de ahorro COP &middot; Intereses diarios
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
              className="border border-[#010103]/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
          <p className="text-xs text-emerald-700/70 uppercase tracking-wide mb-1">
            Rendimiento diario (promedio del periodo)
          </p>
          <div className="flex flex-wrap items-baseline gap-6">
            <div>
              <span
                className={`text-2xl font-bold ${
                  periodMetrics.rendimientoDiario >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {periodMetrics.rendimientoDiario >= 0 ? "+" : ""}
                {(periodMetrics.rendimientoDiario * 100).toFixed(4)}%
              </span>
            </div>
            <div>
              <span className="text-sm text-[#010103]/60">TNA equiv.: </span>
              <span
                className={`text-lg font-semibold ${
                  periodMetrics.tna >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {(periodMetrics.tna * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Rendimiento del periodo */}
        <div className="bg-[#FFFFFF] rounded-xl p-4 border border-[#010103]/10 mb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-1">
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide mb-1">
                Rendimiento del periodo ({activeQuick})
                {periodMetrics.isEstimated ? " · estimado" : ""}
              </p>
              <p
                className={`text-2xl font-bold ${
                  periodMetrics.periodPct >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {periodMetrics.periodPct >= 0 ? "+" : ""}
                {formatPct(periodMetrics.periodPct, 4)}
              </p>
            </div>
            <div className="text-right text-sm text-[#010103]/60">
              <p>{periodMetrics.dias} dias</p>
              <p>
                {formatDate(periodMetrics.fechaInicio)} &rarr; {formatDate(periodMetrics.fechaFin)}
              </p>
              {periodMetrics.isEstimated && (
                <p className="text-xs text-amber-600">Estimado (retorno diario compuesto)</p>
              )}
            </div>
          </div>
        </div>

        {/* Grid de metricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ganancias del periodo */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">
              Ganancias ({activeQuick}){periodMetrics.isEstimated ? " · est." : ""}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">Rendimientos</span>
                <span
                  className={`font-mono font-medium ${
                    periodMetrics.periodRendimientos >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {formatCop(periodMetrics.periodRendimientos)}
                </span>
              </div>
            </div>
          </div>

          {/* Tasas anualizadas */}
          <div className="rounded-xl border border-[#010103]/10 p-4">
            <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">
              Tasas Anualizadas ({activeQuick}){periodMetrics.isEstimated ? " · est." : ""}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TNA</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.tna)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#010103]/60">TEA</span>
                <span className="font-mono font-medium">{formatPct(periodMetrics.tea)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Totales cuenta */}
        <div className="mt-4 rounded-xl border border-[#010103]/10 p-4">
          <h4 className="text-sm font-semibold text-[#010103]/70 mb-3">Totales Cuenta</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[#010103]/60 text-xs">Saldo Final</p>
              <p className="font-mono font-medium">{formatCop(periodMetrics.saldoFinal)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Capital wCOP</p>
              <p className="font-mono font-medium">{formatCop(periodMetrics.capitalWcop)}</p>
            </div>
            <div>
              <p className="text-[#010103]/60 text-xs">Ratio Cobertura</p>
              <p className="font-mono font-medium">{formatPct(periodMetrics.ratioCobertura)}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
