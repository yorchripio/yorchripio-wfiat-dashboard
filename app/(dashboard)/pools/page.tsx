// app/(dashboard)/pools/page.tsx
// Pool fija: World Chain (GeckoTerminal) con gráficos Recharts

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { RefreshCw, BarChart3, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import type { GeckoPool } from "@/lib/geckoterminal/types";
import { getChartColorForToken } from "@/lib/constants/colors";

const CHART_COLOR = getChartColorForToken("wARS"); // #006bb7

type PoolResult =
  | { poolAddress: string; networkId: string; label: string; data: GeckoPool }
  | { poolAddress: string; networkId: string; label: string; error: string };

function formatUsd(value: string): string {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatNum(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** Prepara datos para gráfico de volumen por período */
function buildVolumeChartData(pool: GeckoPool): { period: string; volume: number; volumeUsd: string }[] {
  const a = pool.attributes.volume_usd;
  return [
    { period: "5m", volume: parseFloat(a.m5), volumeUsd: formatUsd(a.m5) },
    { period: "15m", volume: parseFloat(a.m15), volumeUsd: formatUsd(a.m15) },
    { period: "30m", volume: parseFloat(a.m30), volumeUsd: formatUsd(a.m30) },
    { period: "1h", volume: parseFloat(a.h1), volumeUsd: formatUsd(a.h1) },
    { period: "6h", volume: parseFloat(a.h6), volumeUsd: formatUsd(a.h6) },
    { period: "24h", volume: parseFloat(a.h24), volumeUsd: formatUsd(a.h24) },
  ];
}

/** Prepara datos para gráfico de variación de precio por período */
function buildPriceChangeChartData(pool: GeckoPool): { period: string; change: number; changePct: string }[] {
  const a = pool.attributes.price_change_percentage;
  return [
    { period: "5m", change: parseFloat(a.m5), changePct: `${parseFloat(a.m5) >= 0 ? "+" : ""}${a.m5}%` },
    { period: "15m", change: parseFloat(a.m15), changePct: `${parseFloat(a.m15) >= 0 ? "+" : ""}${a.m15}%` },
    { period: "30m", change: parseFloat(a.m30), changePct: `${parseFloat(a.m30) >= 0 ? "+" : ""}${a.m30}%` },
    { period: "1h", change: parseFloat(a.h1), changePct: `${parseFloat(a.h1) >= 0 ? "+" : ""}${a.h1}%` },
    { period: "6h", change: parseFloat(a.h6), changePct: `${parseFloat(a.h6) >= 0 ? "+" : ""}${a.h6}%` },
    { period: "24h", change: parseFloat(a.h24), changePct: `${parseFloat(a.h24) >= 0 ? "+" : ""}${a.h24}%` },
  ];
}

export default function PoolsPage(): React.ReactElement {
  const [pools, setPools] = useState<PoolResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPools = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/geckoterminal/pools");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar pools");
      setPools(json.pools ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const worldChainPool = pools.find((p) => p.networkId === "world-chain");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-8 text-[#5f6e78]" />
          <h1 className="text-2xl font-bold text-[#010103]">Pools</h1>
        </div>
        <button
          type="button"
          onClick={fetchPools}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#5f6e78] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>
      <p className="text-sm text-[#010103]/60 mb-6">
        Pool fija en World Chain (Uniswap). Datos vía GeckoTerminal.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && pools.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[#010103]/50">
          <RefreshCw className="size-6 animate-spin mr-2" />
          Cargando pool...
        </div>
      ) : worldChainPool ? (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[#010103] mb-1">
              {worldChainPool.label}
            </h2>
            <p className="text-xs font-mono text-[#010103]/50 break-all mb-4">
              {worldChainPool.poolAddress}
            </p>

            {"error" in worldChainPool ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                {worldChainPool.error}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">name</p>
                    <p className="text-[#010103] font-medium truncate" title={worldChainPool.data.attributes.name}>
                      {worldChainPool.data.attributes.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">base_token_price_usd</p>
                    <p className="text-[#010103] font-medium">
                      $
                      {parseFloat(worldChainPool.data.attributes.base_token_price_usd).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">quote_token_price_usd</p>
                    <p className="text-[#010103] font-medium">
                      $
                      {parseFloat(worldChainPool.data.attributes.quote_token_price_usd).toLocaleString("en-US", {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 6,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">reserve_in_usd</p>
                    <p className="text-[#010103] font-medium">
                      {formatUsd(worldChainPool.data.attributes.reserve_in_usd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">volume_usd.h24</p>
                    <p className="text-[#010103] font-medium">
                      {formatUsd(worldChainPool.data.attributes.volume_usd.h24)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">transactions.h24.buys</p>
                    <p className="text-[#010103] font-medium">
                      {formatNum(worldChainPool.data.attributes.transactions.h24.buys)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#010103]/60 uppercase tracking-wide">transactions.h24.sells</p>
                    <p className="text-[#010103] font-medium">
                      {formatNum(worldChainPool.data.attributes.transactions.h24.sells)}
                    </p>
                  </div>
                </div>

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#010103]/10">
                    <div>
                      <h3 className="text-sm font-medium text-[#010103] mb-2">
                        Volumen USD por período
                      </h3>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={buildVolumeChartData(worldChainPool.data)}
                            margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,1,3,0.08)" />
                            <XAxis
                              dataKey="period"
                              tick={{ fill: "#010103", fontSize: 11 }}
                              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
                            />
                            <YAxis
                              tick={{ fill: "#010103", fontSize: 11 }}
                              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
                              tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v))}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#FFFFFF",
                                border: "1px solid rgba(1,1,3,0.1)",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number | undefined) => [formatUsd(value != null ? String(value) : "0"), "Volumen"]}
                              labelFormatter={(label) => `Período: ${label}`}
                            />
                            <Bar dataKey="volume" fill={CHART_COLOR} radius={[4, 4, 0, 0]} name="Volumen" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[#010103] mb-2">
                        Variación de precio (%)
                      </h3>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={buildPriceChangeChartData(worldChainPool.data)}
                            margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,1,3,0.08)" />
                            <XAxis
                              dataKey="period"
                              tick={{ fill: "#010103", fontSize: 11 }}
                              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
                            />
                            <YAxis
                              tick={{ fill: "#010103", fontSize: 11 }}
                              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#FFFFFF",
                                border: "1px solid rgba(1,1,3,0.1)",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number | undefined) => [`${value != null && value >= 0 ? "+" : ""}${(value ?? 0).toFixed(2)}%`, "Variación"]}
                              labelFormatter={(label) => `Período: ${label}`}
                            />
                            <Legend formatter={() => "Variación %"} />
                            <Line
                              type="monotone"
                              dataKey="change"
                              stroke={CHART_COLOR}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLOR, r: 4 }}
                              name="Variación %"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              </>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
