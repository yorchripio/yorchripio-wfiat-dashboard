// app/page.tsx
// Página principal del dashboard wARS

"use client";

import { useEffect, useState } from "react";
import { SupplyCard } from "@/components/cards/SupplyCard";
import { RatioCard } from "@/components/cards/RatioCard";
import { CollateralChart } from "@/components/cards/CollateralChart";
import { SupplyChart } from "@/components/cards/SupplyChart";
import { SupplyDistributionChart } from "@/components/cards/SupplyDistributionChart";
import { RendimientoCarteraCard } from "@/components/cards/RendimientoCarteraCard";
import { RendimientosChart } from "@/components/cards/RendimientosChart";
import { RatioHistoryChart } from "@/components/cards/RatioHistoryChart";
import { type TotalSupply } from "@/lib/blockchain/supply";
import { type ColateralData } from "@/lib/sheets/collateral";
import { type HistoricalDataPoint } from "@/lib/sheets/history";
import { type RendimientoDiario } from "@/lib/sheets/rendimiento";
import { RefreshCw } from "lucide-react";
import { RipioLogo } from "@/components/ui/RipioLogo";

export default function Dashboard() {
  const [supplyData, setSupplyData] = useState<TotalSupply | null>(null);
  const [collateralData, setCollateralData] = useState<ColateralData | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [rendimientoData, setRendimientoData] = useState<RendimientoDiario[]>([]);
  const [selectedStable, setSelectedStable] = useState("wARS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // Función para cargar datos
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Cargar supply, colateral e histórico en paralelo
      const [supplyResponse, collateralResponse, historyResponse, rendimientoResponse] = await Promise.all([
        fetch("/api/supply"),
        fetch("/api/collateral"),
        fetch("/api/history"),
        fetch("/api/rendimiento"),
      ]);

      const supplyResult = await supplyResponse.json();
      const collateralResult = await collateralResponse.json();
      const historyResult = await historyResponse.json();
      const rendimientoResult = await rendimientoResponse.json();

      if (supplyResult.success) {
        setSupplyData(supplyResult.data);
      } else {
        setError(supplyResult.error || "Error al cargar supply");
      }

      if (collateralResult.success) {
        setCollateralData(collateralResult.data);
      } else {
        setError((prev) => prev ? `${prev}. ${collateralResult.error}` : collateralResult.error || "Error al cargar colateral");
      }

      if (historyResult.success) {
        setHistoricalData(historyResult.data);
      } else {
        console.warn("Error al cargar datos históricos:", historyResult.error);
      }

      if (rendimientoResult.success) {
        setRendimientoData(rendimientoResult.data);
      } else {
        console.warn("Error al cargar rendimiento:", rendimientoResult.error);
      }

      // Formatear fecha en zona horaria Argentina
      const now = new Date();
      setLastUpdate(
        now.toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) + " hs"
      );
    } catch (err) {
      setError("Error de conexión");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    fetchData();
  }, []);

  // Calcular ratio de colateralización
  const collateralTotal = collateralData?.total ?? 0;
  const ratio = supplyData && collateralTotal > 0 
    ? (collateralTotal / supplyData.total) * 100 
    : 0;

  // Stablecoins por país (agregar más cuando estén listos)
  const stablecoins = [
    { id: "wARS", label: "wARS (Argentina)", available: true },
    { id: "wBRL", label: "wBRL (Brasil)", available: false },
    { id: "wPEN", label: "wPEN (Perú)", available: false },
    { id: "wMXN", label: "wMXN (México)", available: false },
    { id: "wCOP", label: "wCOP (Colombia)", available: false },
    { id: "wCLP", label: "wCLP (Chile)", available: false },
  ];

  return (
    <main className="min-h-screen bg-[#FFFFFF]">
      {/* Header */}
      <header className="bg-[#FFFFFF] border-b border-[#010103]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo y título */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <RipioLogo size={36} />
                <span className="text-3xl font-bold text-[#010103]">RIPIO</span>
              </div>
              <span className="text-[#010103]/30">|</span>
              <span className="text-3xl font-bold text-[#4A13A5]">
                wFIAT
              </span>
              <span className="text-[#010103]/30">|</span>
              <select
                value={selectedStable}
                onChange={(e) => setSelectedStable(e.target.value)}
                className="text-[#010103] font-medium text-base cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4A13A5] rounded-lg border border-[#010103]/15 bg-[#FFFFFF] pl-3 pr-8 py-1.5 appearance-none bg-no-repeat bg-[length:1.25rem_1.25rem] bg-[right_0.35rem_center]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                }}
              >
                {stablecoins.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={!s.available}
                  >
                    {s.label} {!s.available ? "— próximamente" : "— Dashboard"}
                  </option>
                ))}
              </select>
            </div>

            {/* Lado derecho */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#010103]/70">Argentina 🇦🇷</span>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-[#4A13A5] text-[#FFFFFF] rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mensaje de error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && !supplyData && !collateralData && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-[#4A13A5] animate-spin" />
            <span className="ml-3 text-[#010103]">Cargando datos...</span>
          </div>
        )}

        {/* Dashboard */}
        {supplyData && collateralData && (
          <div className="space-y-8">
            {/* Card del Ratio */}
            <RatioCard
              ratio={ratio}
              supplyTotal={supplyData.total}
              collateralTotal={collateralTotal}
              lastUpdate={lastUpdate}
            />

            {/* Grid de gráficos principales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Gráfico de Supply */}
              <SupplyChart supplyData={supplyData} />

              {/* Gráfico de Composición del Colateral */}
              <CollateralChart
                instrumentos={collateralData.instrumentos}
                total={collateralData.total}
              />
            </div>

            {/* Grid: distribución del supply + rendimiento de la cartera */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <SupplyDistributionChart supplyData={supplyData} />
              <RendimientoCarteraCard
                rendimientoData={rendimientoData}
              />
            </div>

            {/* Gráfico histórico del ratio */}
            {historicalData.length > 0 && (
              <RatioHistoryChart
                historicalData={historicalData}
                currentRatio={ratio}
              />
            )}

            {/* Grid de dos columnas: Cards y Rendimientos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Sección Supply por Chain (Cards) */}
              <div>
                <h2 className="text-lg font-semibold text-[#010103] mb-4">
                  Supply por Blockchain
                </h2>
                <div className="space-y-4">
                  <SupplyCard data={supplyData.chains.ethereum} />
                  <SupplyCard data={supplyData.chains.worldchain} />
                  <SupplyCard data={supplyData.chains.base} />
                </div>
              </div>

              {/* Gráfico de Rendimientos */}
              <RendimientosChart
                instrumentos={collateralData.instrumentos}
              />
            </div>

          </div>
        )}
      </div>
    </main>
  );
}