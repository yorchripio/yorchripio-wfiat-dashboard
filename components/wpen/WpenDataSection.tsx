// components/wpen/WpenDataSection.tsx
// Muestra el balance de wPEN en Buda.com (colateral sin colocar, sin rendimiento).

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { RefreshCw, Wallet, ShieldCheck, AlertCircle } from "lucide-react";

interface WpenSummary {
  currency: string;
  amount: number;
  available: number;
  frozen: number;
  pendingWithdrawal: number;
  rendimiento: null;
  cobertura: {
    supply: number | null;
    colateral: number;
    ratio: number | null;
  };
}

function formatPen(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WpenDataSection(): React.ReactElement {
  const [data, setData] = useState<WpenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wpen/summary");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error cargando wPEN");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-[#010103]/50">
        <RefreshCw className="size-5 animate-spin mr-2" />
        Consultando Buda.com...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
        <AlertCircle className="size-5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return <></>;

  const ratioColor =
    data.cobertura.ratio == null
      ? "text-[#010103]/50"
      : data.cobertura.ratio >= 100
        ? "text-green-600"
        : data.cobertura.ratio >= 90
          ? "text-yellow-600"
          : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wallet className="size-6 text-[#d91023]" />
            <div>
              <h2 className="text-lg font-semibold text-[#010103]">Balance Buda.com</h2>
              <p className="text-sm text-[#010103]/60">Colateral wPEN — sin colocar (a la vista)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#5f6e78] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Balance Total</p>
            <p className="text-2xl font-bold text-[#010103]">{formatPen(data.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Disponible</p>
            <p className="text-lg font-semibold text-[#010103]">{formatPen(data.available)}</p>
          </div>
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Congelado</p>
            <p className="text-lg font-semibold text-[#010103]">{formatPen(data.frozen)}</p>
          </div>
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Retiro Pendiente</p>
            <p className="text-lg font-semibold text-[#010103]">{formatPen(data.pendingWithdrawal)}</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-[#010103]/5 rounded-lg text-sm text-[#010103]/70">
          Este colateral está en la cuenta de Buda.com sin colocar. No genera rendimiento.
        </div>
      </Card>

      {/* Coverage card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck className="size-6 text-[#d91023]" />
          <h2 className="text-lg font-semibold text-[#010103]">Cobertura</h2>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Supply wPEN</p>
            <p className="text-lg font-semibold text-[#010103]">
              {data.cobertura.supply != null
                ? data.cobertura.supply.toLocaleString("es-PE", { maximumFractionDigits: 0 })
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Colateral</p>
            <p className="text-lg font-semibold text-[#010103]">{formatPen(data.cobertura.colateral)}</p>
          </div>
          <div>
            <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Ratio</p>
            <p className={`text-lg font-semibold ${ratioColor}`}>
              {data.cobertura.ratio != null ? `${data.cobertura.ratio.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
