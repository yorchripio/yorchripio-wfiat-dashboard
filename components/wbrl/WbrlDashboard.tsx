"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface WbrlSummary {
  fechaReporte: string;
  estructura: {
    emisor: string;
    instrumento: string;
    indexador: string;
    cantidadPosiciones: number;
  };
  colateral: {
    positions: {
      id: string;
      fechaInicio: string;
      fechaVencimento: string;
      capitalInicial: number;
      valorBruto: number;
      valorLiquido: number;
      ir: number;
    }[];
    totales: {
      capitalInicial: number;
      valorBruto: number;
      valorLiquido: number;
      ir: number;
    };
  };
  rendimiento: {
    gananciaBruta: number;
    ir: number;
    gananciaLiquida: number;
    pctPeriodoBruto: number;
    pctPeriodoLiquido: number;
    tnaBruto: number;
    tnaLiquido: number;
    teaBruto: number;
    teaLiquido: number;
    diasPeriodo: number;
    fechaInicio: string;
    fechaFin: string;
  };
  cobertura: {
    wbrlCirculante: number | null;
    colateralBruto: number;
    colateralLiquido: number;
    coberturaBruto: number | null;
    coberturaLiquido: number | null;
    sobreColateral: number | null;
  };
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

function ratioColor(pct: number | null): string {
  if (!pct) return "text-[#010103]/50";
  if (pct >= 103) return "text-emerald-600";
  if (pct >= 100) return "text-amber-600";
  return "text-red-600";
}

function ratioBg(pct: number | null): string {
  if (!pct) return "border-[#010103]/10 bg-[#010103]/5";
  if (pct >= 103) return "border-emerald-200 bg-emerald-50";
  if (pct >= 100) return "border-amber-200 bg-amber-50";
  return "border-red-200 bg-red-50";
}

export function WbrlDashboard(): React.ReactElement {
  const [summary, setSummary] = useState<WbrlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/wbrl/summary");
        const json = await res.json();
        if (json.success && json.data) {
          setSummary(json.data);
        } else if (json.success && !json.data) {
          setError("No hay posiciones wBRL cargadas. Ve a Data para subir archivos.");
        } else {
          setError(json.error || "Error cargando datos");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-[280px] w-full rounded-xl" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
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

  if (!summary) return <></>;

  const { estructura, colateral, rendimiento, cobertura } = summary;

  return (
    <div className="space-y-8">
      {/* Ratio Card */}
      <div className={`rounded-xl border p-6 ${ratioBg(cobertura.coberturaBruto)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#010103]/60 uppercase tracking-wide">
              Cobertura wBRL
            </p>
            <p className={`text-4xl font-bold mt-1 ${ratioColor(cobertura.coberturaBruto)}`}>
              {cobertura.coberturaBruto != null
                ? cobertura.coberturaBruto.toFixed(2) + "%"
                : "N/A"}
            </p>
            <p className="text-sm text-[#010103]/50 mt-1">
              Bruto | Liquido: {cobertura.coberturaLiquido?.toFixed(2) ?? "N/A"}%
            </p>
          </div>
          <div className="text-right text-sm space-y-1">
            <p className="text-[#010103]/70">
              wBRL Circulante:{" "}
              <strong>{cobertura.wbrlCirculante != null ? formatBrl(cobertura.wbrlCirculante) : "N/A"}</strong>
            </p>
            <p className="text-[#010103]/70">
              Colateral Bruto: <strong>{formatBrl(cobertura.colateralBruto)}</strong>
            </p>
            <p className="text-[#010103]/70">
              Colateral Liquido: <strong>{formatBrl(cobertura.colateralLiquido)}</strong>
            </p>
            {cobertura.sobreColateral != null && (
              <p className="text-emerald-700">
                Sobre-colateral: <strong>{formatBrl(cobertura.sobreColateral)}</strong>
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-[#010103]/40 mt-3">
          Reporte: {formatDate(summary.fechaReporte)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Estructura del Colateral */}
        <div className="rounded-xl border border-[#010103]/10 bg-white p-6">
          <h3 className="font-semibold text-[#010103] mb-4">Estructura del Colateral</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Emisor</span>
              <span className="font-medium">{estructura.emisor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Instrumento</span>
              <span className="font-medium">{estructura.instrumento}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Posiciones</span>
              <span className="font-medium">{estructura.cantidadPosiciones}</span>
            </div>
            <hr className="border-[#010103]/10" />
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Capital Inicial</span>
              <span className="font-mono font-medium">{formatBrl(colateral.totales.capitalInicial)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Valor Bruto</span>
              <span className="font-mono font-medium">{formatBrl(colateral.totales.valorBruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Valor Liquido</span>
              <span className="font-mono font-medium">{formatBrl(colateral.totales.valorLiquido)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">IR Retenido</span>
              <span className="font-mono font-medium text-red-600">{formatBrl(colateral.totales.ir)}</span>
            </div>
          </div>
        </div>

        {/* Rendimiento YTD */}
        <div className="rounded-xl border border-[#010103]/10 bg-white p-6">
          <h3 className="font-semibold text-[#010103] mb-4">
            Rendimiento YTD ({formatDate(rendimiento.fechaInicio)} → {formatDate(rendimiento.fechaFin)})
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Ganancia Bruta</span>
              <span className="font-mono font-medium text-emerald-700">{formatBrl(rendimiento.gananciaBruta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">IR (22.5%)</span>
              <span className="font-mono font-medium text-red-600">{formatBrl(rendimiento.ir)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">Ganancia Liquida</span>
              <span className="font-mono font-medium text-emerald-700">{formatBrl(rendimiento.gananciaLiquida)}</span>
            </div>
            <hr className="border-[#010103]/10" />
            <div className="flex justify-between">
              <span className="text-[#010103]/60">% Periodo (bruto)</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.pctPeriodoBruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">% Periodo (liquido)</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.pctPeriodoLiquido)}</span>
            </div>
            <hr className="border-[#010103]/10" />
            <div className="flex justify-between">
              <span className="text-[#010103]/60">TNA Bruto</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.tnaBruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">TNA Liquido</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.tnaLiquido)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">TEA Bruto</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.teaBruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#010103]/60">TEA Liquido</span>
              <span className="font-mono font-medium">{formatPct(rendimiento.teaLiquido)}</span>
            </div>
            <p className="text-xs text-[#010103]/40">{rendimiento.diasPeriodo} dias del periodo</p>
          </div>
        </div>
      </div>

      {/* Posiciones CDB */}
      <div className="rounded-xl border border-[#010103]/10 bg-white p-6">
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
      </div>
    </div>
  );
}
