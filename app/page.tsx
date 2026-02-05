// app/page.tsx
// Página principal del dashboard wARS

"use client";

import { useEffect, useState } from "react";
import { SupplyCard } from "@/components/cards/SupplyCard";
import { RatioCard } from "@/components/cards/RatioCard";
import { type TotalSupply } from "@/lib/blockchain/supply";
import { type ColateralData } from "@/lib/sheets/collateral";
import { RefreshCw } from "lucide-react";

export default function Dashboard() {
  const [supplyData, setSupplyData] = useState<TotalSupply | null>(null);
  const [collateralData, setCollateralData] = useState<ColateralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // Función para cargar datos
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Cargar supply y colateral en paralelo
      const [supplyResponse, collateralResponse] = await Promise.all([
        fetch("/api/supply"),
        fetch("/api/collateral"),
      ]);

      const supplyResult = await supplyResponse.json();
      const collateralResult = await collateralResponse.json();

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

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo y título */}
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                wFIAT
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600 font-medium">wARS Dashboard</span>
            </div>

            {/* Lado derecho */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Argentina 🇦🇷</span>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="ml-3 text-gray-600">Cargando datos...</span>
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

            {/* Sección Supply por Chain */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Supply por Blockchain
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SupplyCard data={supplyData.chains.ethereum} />
                <SupplyCard data={supplyData.chains.worldchain} />
                <SupplyCard data={supplyData.chains.base} />
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}