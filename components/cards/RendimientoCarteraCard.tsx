// components/cards/RendimientoCarteraCard.tsx
// Card profesional: rendimiento de la cartera con filtro de fechas y desglose

"use client";

import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type RendimientoDiario } from "@/lib/types/rendimiento";
import { COLLATERAL_COLORS } from "@/lib/constants/colors";

interface PortfolioVCPPoint {
  fecha: string;
  dateKey: string;
  timestamp: number;
  vcp: number;
  cuotapartesTotales: number;
  patrimonio: number;
}

interface CollateralInstrument {
  nombre: string;
  tipo: string;
  entidad: string;
}

interface CollateralInfo {
  instrumentos: CollateralInstrument[];
}

interface RendimientoCarteraCardProps {
  rendimientoData: RendimientoDiario[];
  tiposQueRinden: string[];
  portfolioVCP?: PortfolioVCPPoint[];
  collateralData?: CollateralInfo | null;
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
  portfolioVCP = [],
  collateralData,
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

  // Filtrar VCP por rango de fechas, incluyendo anchor del día anterior al start
  // y estimación del día actual si CAFCI aún no publicó
  const filteredVCP = useMemo(() => {
    if (portfolioVCP.length === 0 || !startDate || !endDate) return [];
    const startTs = dateInputToTimestamp(startDate);
    const endTs = dateInputToTimestamp(endDate) + 86400000 - 1;

    // Buscar los últimos 2 VCP antes del startDate (para anchor + tasa diaria)
    const anchors: typeof portfolioVCP = [];
    for (let i = portfolioVCP.length - 1; i >= 0 && anchors.length < 2; i--) {
      if (portfolioVCP[i].timestamp < startTs) {
        anchors.unshift(portfolioVCP[i]); // mantener orden cronológico
      }
    }

    // Puntos dentro del rango
    const inRange = portfolioVCP.filter((d) => d.timestamp >= startTs && d.timestamp <= endTs);

    // Construir resultado: anchors + in-range
    const result: typeof portfolioVCP = [];
    // Solo incluir el anchor más reciente como punto base
    if (anchors.length > 0) result.push(anchors[anchors.length - 1]);
    result.push(...inRange);

    // Calcular tasa diaria promedio de los últimos VCP conocidos
    // Usar los últimos 5 puntos del portfolioVCP para una tasa estable
    const calcTasaDiaria = (): number => {
      if (portfolioVCP.length < 2) return 0;
      let sumRate = 0;
      let count = 0;
      const startIdx = Math.max(0, portfolioVCP.length - 6);
      for (let i = startIdx + 1; i < portfolioVCP.length; i++) {
        const dias = Math.max(1, Math.round((portfolioVCP[i].timestamp - portfolioVCP[i-1].timestamp) / 86400000));
        const rate = (portfolioVCP[i].vcp / portfolioVCP[i-1].vcp) ** (1 / dias) - 1;
        sumRate += rate;
        count++;
      }
      return count > 0 ? sumRate / count : 0;
    };

    // Estimar VCP si el último dato disponible es anterior a endDate
    if (result.length >= 1) {
      const last = result[result.length - 1];
      const todayTs = dateInputToTimestamp(endDate);
      if (last.timestamp < todayTs) {
        const tasaDiaria = calcTasaDiaria();
        const diasAEstimar = Math.round((todayTs - last.timestamp) / 86400000);
        if (tasaDiaria > 0 && diasAEstimar > 0 && diasAEstimar <= 5) {
          const vcpEstimado = last.vcp * (1 + tasaDiaria) ** diasAEstimar;
          result.push({
            ...last,
            fecha: endDate,
            dateKey: endDate,
            timestamp: todayTs,
            vcp: vcpEstimado,
            patrimonio: vcpEstimado * last.cuotapartesTotales,
          });
        }
      }
    }

    return result;
  }, [portfolioVCP, startDate, endDate, filtered]);

  /**
   * Rendimiento del periodo usando sistema de cuotapartes:
   * - Si hay datos de VCP del portfolio: rendimiento = (VCP_final / VCP_inicial - 1) × 100
   *   Esto es independiente de flujos de capital (minteos/burns)
   * - Fallback: TWR compuesto de rendimientos diarios
   */
  const metrics = useMemo(() => {
    if (filtered.length === 0) {
      return {
        rendimientoAcumulado: 0,
        rendimientoReal: 0,
        tna: 0,
        valorGanadoARS: 0,
        diasEnPeriodo: 0,
        avgAllocation: {} as Record<string, number>,
        vcpInicial: 0,
        vcpFinal: 0,
        vcpEstimado: false,
      };
    }

    const startTs = startDate ? dateInputToTimestamp(startDate) : filtered[0].timestamp;
    const endTs = endDate ? dateInputToTimestamp(endDate) : filtered[filtered.length - 1].timestamp;
    let diasCalendario = Math.round((endTs - startTs) / 86400000) + 1;

    let rendimientoReal: number;
    let valorGanadoARS: number;
    let vcpInicial = 0;
    let vcpFinal = 0;
    let vcpEstimado = false;

    if (filteredVCP.length >= 2) {
      // Detectar si el último punto es estimado (no existe en portfolioVCP original)
      const lastVCPPoint = filteredVCP[filteredVCP.length - 1];
      const existsInOriginal = portfolioVCP.some(
        (p) => p.dateKey === lastVCPPoint.dateKey && Math.abs(p.vcp - lastVCPPoint.vcp) < 0.01
      );
      vcpEstimado = !existsInOriginal;
      // === MÉTODO CUOTAPARTES (preferido) ===
      // Rendimiento = cambio de VCP, independiente de flujos de capital
      vcpInicial = filteredVCP[0].vcp;
      vcpFinal = filteredVCP[filteredVCP.length - 1].vcp;
      rendimientoReal = ((vcpFinal / vcpInicial) - 1) * 100;
      // Ajustar diasCalendario al span real del VCP (incluye anchor pre-start)
      const vcpSpanDias = Math.round((filteredVCP[filteredVCP.length - 1].timestamp - filteredVCP[0].timestamp) / 86400000);
      if (vcpSpanDias > diasCalendario) {
        diasCalendario = vcpSpanDias;
      }

      // ARS ganados: promedio de cuotapartes en el período × cambio de VCP
      let sumaCuotasPonderada = 0;
      let totalPeso = 0;
      for (let i = 0; i < filteredVCP.length; i++) {
        let diasPeso: number;
        if (i < filteredVCP.length - 1) {
          diasPeso = Math.round((filteredVCP[i + 1].timestamp - filteredVCP[i].timestamp) / 86400000);
        } else {
          diasPeso = 1;
        }
        sumaCuotasPonderada += filteredVCP[i].cuotapartesTotales * diasPeso;
        totalPeso += diasPeso;
      }
      const cuotasPromedio = totalPeso > 0 ? sumaCuotasPonderada / totalPeso : 0;
      valorGanadoARS = cuotasPromedio * (vcpFinal - vcpInicial);
    } else {
      // === FALLBACK: TWR compuesto ===
      let compounded = 1;
      valorGanadoARS = 0;
      for (let i = 0; i < filtered.length; i++) {
        const dailyReturn = filtered[i].rendimiento ?? 0;
        compounded *= (1 + dailyReturn / 100);
        const prevTotal = i > 0 ? (filtered[i - 1].totalColateral ?? 0) : (filtered[i].totalColateral ?? 0);
        valorGanadoARS += prevTotal * (dailyReturn / 100);
      }
      rendimientoReal = (compounded - 1) * 100;
    }

    // TNA = anualización lineal
    const tna = diasCalendario > 0 ? (rendimientoReal / diasCalendario) * 365 : 0;

    // Allocation breakdown (same as before)
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
      rendimientoAcumulado: rendimientoReal,
      rendimientoReal,
      tna,
      valorGanadoARS,
      diasEnPeriodo: diasCalendario,
      avgAllocation,
      vcpInicial,
      vcpFinal,
      vcpEstimado,
    };
  }, [filtered, filteredVCP, portfolioVCP, startDate, endDate]);

  const rendColor =
    metrics.rendimientoReal > 0
      ? "text-emerald-600"
      : metrics.rendimientoReal < 0
        ? "text-red-600"
        : "text-[#010103]";

  // Map tipo → full instrument name from collateral data (if available)
  const TIPO_LABEL_FALLBACK: Record<string, string> = {
    FCI: "FCI",
    Cuenta_Remunerada: "Cuenta Remunerada",
    A_la_Vista: "Saldo a la Vista",
    CDB: "CDB",
  };
  const TIPO_COLOR: Record<string, string> = {
    FCI: "#5f6e78",
    Cuenta_Remunerada: "#010103",
    A_la_Vista: COLLATERAL_COLORS.A_la_Vista,
  };

  // Build a tipo→nombre map from the actual collateral instrumentos
  const tipoNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (collateralData?.instrumentos) {
      for (const inst of collateralData.instrumentos) {
        if (inst.nombre && !map.has(inst.tipo)) {
          map.set(inst.tipo, inst.nombre);
        }
      }
    }
    return map;
  }, [collateralData]);

  const instrumentos = useMemo(() => {
    return Object.entries(metrics.avgAllocation)
      .filter(([, pct]) => pct > 0)
      .map(([tipo, avgAlloc]) => ({
        tipo,
        nombre: tipoNameMap.get(tipo) ?? TIPO_LABEL_FALLBACK[tipo] ?? tipo.replace(/_/g, " "),
        color: TIPO_COLOR[tipo] ?? "#6B7280",
        avgAlloc,
      }));
  }, [metrics.avgAllocation, tipoNameMap]);

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
        {filteredVCP.length >= 2
          ? `Rendimiento basado en cuotapartes${metrics.vcpEstimado ? " — VCP estimado hasta publicación CAFCI (~18hs)" : ""}`
          : "Retorno compuesto (TWR) desde rendimiento diario de la cartera"}
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

      {/* Rendimiento acumulado, TNA y valor en ARS */}
      <div className="bg-[#FFFFFF] rounded-xl p-4 mb-5 border border-[#010103]/10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide mb-1">
              Rendimiento del período
            </p>
            <p className={`text-3xl font-bold ${rendColor}`}>
              {metrics.rendimientoReal >= 0 ? "+" : ""}
              {metrics.rendimientoReal.toFixed(4)}%
            </p>
            {metrics.diasEnPeriodo > 0 && (
              <p className="text-sm font-medium text-[#d4a017] mt-1">
                TNA: {metrics.tna.toFixed(2)}%
              </p>
            )}
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
            {metrics.vcpFinal > 0 && (
              <p className="text-xs text-[#010103]/40 mt-1">
                VCP: {metrics.vcpInicial.toFixed(2)} → {metrics.vcpFinal.toFixed(2)}
                {metrics.vcpEstimado && <span className="text-amber-500 ml-1">(est.)</span>}
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
