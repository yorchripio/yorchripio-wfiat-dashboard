"use client";

import { useEffect, useState, useRef } from "react";
import { CollateralChart } from "@/components/cards/CollateralChart";
import { RendimientoCarteraCard } from "@/components/cards/RendimientoCarteraCard";
import { RendimientosChart } from "@/components/cards/RendimientosChart";
import { RatioHistoryChart } from "@/components/cards/RatioHistoryChart";
import { type ColateralData } from "@/lib/sheets/collateral";
import { type RendimientoDiario } from "@/lib/types/rendimiento";
import { type HistoricalDataPoint } from "@/lib/sheets/history";
import { RefreshCw, FileDown, ChevronDown } from "lucide-react";
import { TokenSelect } from "@/components/ui/TokenSelect";
import { WbrlDataSection } from "@/components/wbrl/WbrlDataSection";
import { WbrlRendimientoCard } from "@/components/wbrl/WbrlRendimientoCard";
import { WmxnDataSection } from "@/components/wmxn/WmxnDataSection";
import { WmxnRendimientoCard } from "@/components/wmxn/WmxnRendimientoCard";
import { WcopDataSection } from "@/components/wcop/WcopDataSection";
import { WcopRendimientoCard } from "@/components/wcop/WcopRendimientoCard";
import { WpenDataSection } from "@/components/wpen/WpenDataSection";
import { WclpDataSection } from "@/components/wclp/WclpDataSection";

function ReportDownload({ asset }: { asset: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const periods = [
    { label: "Últimos 7 días", days: 7 },
    { label: "Últimos 30 días", days: 30 },
    { label: "Últimos 90 días", days: 90 },
    { label: "YTD", days: -1 },
    { label: "Último año", days: 365 },
  ];

  const buildUrl = (days: number) => {
    const to = new Date();
    const toStr = to.toISOString().slice(0, 10);
    let fromStr: string;
    if (days === -1) {
      fromStr = `${to.getFullYear()}-01-01`;
    } else {
      const from = new Date(to);
      from.setDate(from.getDate() - days);
      fromStr = from.toISOString().slice(0, 10);
    }
    return `/api/report/${asset}?from=${fromStr}&to=${toStr}`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5f6e78] border border-[#010103]/20 rounded-lg hover:bg-[#f5f5f5] transition-colors"
      >
        <FileDown className="w-3.5 h-3.5" />
        Reporte
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-[#010103]/10 py-1 z-50">
          {periods.map((p) => (
            <a
              key={p.days}
              href={buildUrl(p.days)}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-sm text-[#010103]/80 hover:bg-[#f5f5f5] transition-colors"
              onClick={() => setOpen(false)}
            >
              {p.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ColateralPage(): React.ReactElement {
  const [selectedAsset, setSelectedAsset] = useState("wARS");
  const assetOptions = [
    { id: "wARS", label: "wARS", available: true },
    { id: "wBRL", label: "wBRL", available: true },
    { id: "wMXN", label: "wMXN", available: true },
    { id: "wCOP", label: "wCOP", available: true },
    { id: "wPEN", label: "wPEN", available: true },
    { id: "wCLP", label: "wCLP", available: true },
  ];
  const [collateralData, setCollateralData] = useState<ColateralData | null>(null);
  const [rendimientoData, setRendimientoData] = useState<RendimientoDiario[]>([]);
  const [tiposQueRinden, setTiposQueRinden] = useState<string[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [supplyTotal, setSupplyTotal] = useState<number>(0);
  const [portfolioVCP, setPortfolioVCP] = useState<{ fecha: string; dateKey: string; timestamp: number; vcp: number; cuotapartesTotales: number; patrimonio: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Increment to force rendimiento cards to re-fetch after confirm
  const [refreshKey, setRefreshKey] = useState(0);
  const handleDataConfirmed = () => setRefreshKey((k) => k + 1);

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [collateralRes, rendimientoRes, historyRes, supplyRes, vcpRes] = await Promise.all([
        fetch("/api/collateral"),
        fetch("/api/rendimiento"),
        fetch("/api/history"),
        fetch("/api/supply"),
        fetch("/api/portfolio-vcp?asset=wARS"),
      ]);
      const collateralResult = await collateralRes.json();
      const rendimientoResult = await rendimientoRes.json();
      const historyResult = await historyRes.json();
      const supplyResult = await supplyRes.json();
      const vcpResult = await vcpRes.json();
      if (collateralResult.success) setCollateralData(collateralResult.data);
      else setError(collateralResult.error ?? "Error al cargar colateral");
      if (rendimientoResult.success) {
        setRendimientoData(rendimientoResult.data ?? []);
        if (Array.isArray(rendimientoResult.tiposQueRinden)) {
          setTiposQueRinden(rendimientoResult.tiposQueRinden);
        }
      }
      if (historyResult.success && Array.isArray(historyResult.data)) {
        setHistoricalData(historyResult.data);
      }
      if (supplyResult.success && supplyResult.data?.total != null) {
        setSupplyTotal(supplyResult.data.total);
      }
      if (Array.isArray(vcpResult?.data)) {
        setPortfolioVCP(vcpResult.data);
      }
    } catch (err) {
      setError("Error de conexión");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#010103]/10 bg-[#FFFFFF] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#010103]">Colateral</h1>
              <p className="text-[#010103]/70 mt-1">
                {selectedAsset === "wBRL" && "Gestión de colateral wBRL — CDBs en Banco Genial"}
                {selectedAsset === "wMXN" && "Gestión de colateral wMXN — Fondo REGIO1 en Banregio"}
                {selectedAsset === "wCOP" && "Gestión de colateral wCOP — Cuenta ahorro en Finandina"}
                {selectedAsset === "wPEN" && "Gestión de colateral wPEN — Balance en Buda.com"}
                {selectedAsset === "wCLP" && "Gestión de colateral wCLP — Cuenta Corriente BCI"}
                {selectedAsset === "wARS" && "Composición del colateral y rendimientos por instrumento"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ReportDownload asset={selectedAsset} />
              <TokenSelect
                value={selectedAsset}
                options={assetOptions}
                onChange={setSelectedAsset}
                className="w-[160px]"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedAsset === "wBRL" ? (
          <div className="space-y-6">
            <WbrlRendimientoCard key={`wbrl-rend-${refreshKey}`} />
            <WbrlDataSection onConfirmed={handleDataConfirmed} />
          </div>
        ) : selectedAsset === "wMXN" ? (
          <div className="space-y-6">
            <WmxnRendimientoCard key={`wmxn-rend-${refreshKey}`} />
            <WmxnDataSection onConfirmed={handleDataConfirmed} />
          </div>
        ) : selectedAsset === "wCOP" ? (
          <div className="space-y-6">
            <WcopRendimientoCard key={`wcop-rend-${refreshKey}`} />
            <WcopDataSection onConfirmed={handleDataConfirmed} />
          </div>
        ) : selectedAsset === "wPEN" ? (
          <div className="space-y-6">
            <WpenDataSection key={`wpen-data-${refreshKey}`} />
          </div>
        ) : selectedAsset === "wCLP" ? (
          <div className="space-y-6">
            <WclpDataSection key={`wclp-data-${refreshKey}`} />
          </div>
        ) : (
        <>
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {loading && !collateralData ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-[#5f6e78] animate-spin" />
            <span className="ml-3 text-[#010103]">Cargando...</span>
          </div>
        ) : collateralData ? (
          <div className="space-y-8">
            <RendimientoCarteraCard rendimientoData={rendimientoData} tiposQueRinden={tiposQueRinden} portfolioVCP={portfolioVCP} collateralData={collateralData} />
            {historicalData.length > 0 && (
              <RatioHistoryChart
                historicalData={historicalData}
                currentRatio={
                  supplyTotal > 0 && collateralData
                    ? (collateralData.total / supplyTotal) * 100
                    : 0
                }
                tokenId="wARS"
              />
            )}
            <RendimientosChart instrumentos={collateralData.instrumentos} tokenId="wARS" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <CollateralChart
                instrumentos={collateralData.instrumentos}
                total={collateralData.total}
                tokenId="wARS"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-[#5f6e78] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </div>
        ) : null}
        </>
        )}
      </div>
    </div>
  );
}
