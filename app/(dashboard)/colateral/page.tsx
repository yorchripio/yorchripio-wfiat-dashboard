"use client";

import { useEffect, useState } from "react";
import { CollateralChart } from "@/components/cards/CollateralChart";
import { RendimientoCarteraCard } from "@/components/cards/RendimientoCarteraCard";
import { RendimientosChart } from "@/components/cards/RendimientosChart";
import { type ColateralData } from "@/lib/sheets/collateral";
import { type RendimientoDiario } from "@/lib/sheets/rendimiento";
import { RefreshCw } from "lucide-react";

export default function ColateralPage(): React.ReactElement {
  const [collateralData, setCollateralData] = useState<ColateralData | null>(null);
  const [rendimientoData, setRendimientoData] = useState<RendimientoDiario[]>([]);
  const [tiposQueRinden, setTiposQueRinden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [collateralRes, rendimientoRes] = await Promise.all([
        fetch("/api/collateral"),
        fetch("/api/rendimiento"),
      ]);
      const collateralResult = await collateralRes.json();
      const rendimientoResult = await rendimientoRes.json();
      if (collateralResult.success) setCollateralData(collateralResult.data);
      else setError(collateralResult.error ?? "Error al cargar colateral");
      if (rendimientoResult.success) {
        setRendimientoData(rendimientoResult.data);
        if (Array.isArray(rendimientoResult.tiposQueRinden)) {
          setTiposQueRinden(rendimientoResult.tiposQueRinden);
        }
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
          <h1 className="text-2xl font-bold text-[#010103]">Colateral</h1>
          <p className="text-[#010103]/70 mt-1">
            Composición del colateral y rendimientos por instrumento
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <CollateralChart
                instrumentos={collateralData.instrumentos}
                total={collateralData.total}
              />
              <RendimientoCarteraCard rendimientoData={rendimientoData} tiposQueRinden={tiposQueRinden} />
            </div>
            <RendimientosChart instrumentos={collateralData.instrumentos} />
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
      </div>
    </div>
  );
}
