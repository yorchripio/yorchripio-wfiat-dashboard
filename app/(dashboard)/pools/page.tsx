// app/(dashboard)/pools/page.tsx
// Pools de liquidez wARS y wBRL en múltiples chains (GeckoTerminal)

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
import { getChartColorForToken, CHAIN_COLORS } from "@/lib/constants/colors";
import { TokenSelect } from "@/components/ui/TokenSelect";

type PoolResult =
  | { poolAddress: string; networkId: string; label: string; token: string; data: GeckoPool }
  | { poolAddress: string; networkId: string; label: string; token: string; error: string };

function formatUsd(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatNum(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function buildVolumeChartData(pool: GeckoPool) {
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

function buildPriceChangeChartData(pool: GeckoPool) {
  const a = pool.attributes.price_change_percentage;
  return [
    { period: "5m", change: parseFloat(a.m5) },
    { period: "15m", change: parseFloat(a.m15) },
    { period: "30m", change: parseFloat(a.m30) },
    { period: "1h", change: parseFloat(a.h1) },
    { period: "6h", change: parseFloat(a.h6) },
    { period: "24h", change: parseFloat(a.h24) },
  ];
}

function getChainColor(networkId: string): string {
  if (networkId === "eth") return CHAIN_COLORS.Ethereum;
  if (networkId === "base") return CHAIN_COLORS.Base;
  return CHAIN_COLORS.Worldchain;
}

function PoolCard({ pool, chartColor }: { pool: PoolResult; chartColor: string }): React.ReactElement {
  const chainColor = getChainColor(pool.networkId);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: chainColor }}
        />
        <h2 className="text-lg font-semibold text-[#010103]">
          {pool.label}
        </h2>
      </div>
      <p className="text-xs font-mono text-[#010103]/50 break-all mb-4 ml-6">
        {pool.poolAddress}
      </p>

      {"error" in pool ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
          {pool.error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Pool</p>
              <p className="text-[#010103] font-medium truncate" title={pool.data.attributes.name}>
                {pool.data.attributes.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Precio base (USD)</p>
              <p className="text-[#010103] font-medium">
                ${parseFloat(pool.data.attributes.base_token_price_usd).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Reserva</p>
              <p className="text-[#010103] font-medium">
                {formatUsd(pool.data.attributes.reserve_in_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Vol. 24h</p>
              <p className="text-[#010103] font-medium">
                {formatUsd(pool.data.attributes.volume_usd.h24)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Buys 24h</p>
              <p className="text-[#010103] font-medium">
                {formatNum(pool.data.attributes.transactions.h24.buys)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Sells 24h</p>
              <p className="text-[#010103] font-medium">
                {formatNum(pool.data.attributes.transactions.h24.sells)}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#010103]/10">
            <div>
              <h3 className="text-sm font-medium text-[#010103] mb-2">
                Volumen USD por período
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={buildVolumeChartData(pool.data)}
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
                      tickFormatter={(v) =>
                        v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid rgba(1,1,3,0.1)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number | undefined) => [
                        formatUsd(value ?? 0),
                        "Volumen",
                      ]}
                      labelFormatter={(label) => `Período: ${label}`}
                    />
                    <Bar dataKey="volume" fill={chartColor} radius={[4, 4, 0, 0]} name="Volumen" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#010103] mb-2">
                Variación de precio (%)
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={buildPriceChangeChartData(pool.data)}
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
                      formatter={(value: number | undefined) => [
                        `${value != null && value >= 0 ? "+" : ""}${(value ?? 0).toFixed(2)}%`,
                        "Variación",
                      ]}
                      labelFormatter={(label) => `Período: ${label}`}
                    />
                    <Legend formatter={() => "Variación %"} />
                    <Line
                      type="monotone"
                      dataKey="change"
                      stroke={chartColor}
                      strokeWidth={2}
                      dot={{ fill: chartColor, r: 4 }}
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
  );
}

export default function PoolsPage(): React.ReactElement {
  const [pools, setPools] = useState<PoolResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState("wARS");

  const assetOptions = [
    { id: "wARS", label: "wARS", available: true },
    { id: "wBRL", label: "wBRL", available: true },
    { id: "wMXN", label: "wMXN", available: true },
    { id: "wCOP", label: "wCOP", available: true },
    { id: "wPEN", label: "wPEN", available: true },
    { id: "wCLP", label: "wCLP", available: true },
  ];

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

  const filteredPools = pools.filter((p) => p.token === selectedAsset);
  const chartColor = getChartColorForToken(selectedAsset);

  // Aggregate totals for the selected token
  const totalReserve = filteredPools.reduce((sum, p) => {
    if ("data" in p) return sum + parseFloat(p.data.attributes.reserve_in_usd || "0");
    return sum;
  }, 0);
  const totalVolume24h = filteredPools.reduce((sum, p) => {
    if ("data" in p) return sum + parseFloat(p.data.attributes.volume_usd.h24 || "0");
    return sum;
  }, 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#010103]/10 bg-[#FFFFFF] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="size-7 text-[#5f6e78]" />
              <div>
                <h1 className="text-2xl font-bold text-[#010103]">Pools de Liquidez</h1>
                <p className="text-sm text-[#010103]/60">
                  Uniswap V4 · Datos vía GeckoTerminal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TokenSelect
                value={selectedAsset}
                options={assetOptions}
                onChange={setSelectedAsset}
                className="w-[140px]"
              />
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
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Totales agregados */}
        {!loading && filteredPools.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Pools</p>
              <p className="text-2xl font-bold text-[#010103]">{filteredPools.length}</p>
              <p className="text-xs text-[#010103]/50">
                {filteredPools.map((p) => p.label).join(" · ")}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Reserva Total</p>
              <p className="text-2xl font-bold text-[#010103]">{formatUsd(totalReserve)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Volumen 24h Total</p>
              <p className="text-2xl font-bold text-[#010103]">{formatUsd(totalVolume24h)}</p>
            </Card>
          </div>
        )}

        {loading && pools.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[#010103]/50">
            <RefreshCw className="size-6 animate-spin mr-2" />
            Cargando pools...
          </div>
        ) : filteredPools.length > 0 ? (
          <div className="space-y-6">
            {filteredPools.map((pool) => (
              <PoolCard
                key={`${pool.networkId}-${pool.poolAddress}`}
                pool={pool}
                chartColor={chartColor}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[#010103]/50">
            No hay pools configuradas para {selectedAsset}
          </div>
        )}
      </div>
    </div>
  );
}
