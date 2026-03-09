// app/(dashboard)/page.tsx
// Página principal del dashboard wARS

"use client";

import { useMemo, useState } from "react";
import { SupplyCard } from "@/components/cards/SupplyCard";
import { RatioCard } from "@/components/cards/RatioCard";
import { CollateralChart } from "@/components/cards/CollateralChart";
import { SupplyChart } from "@/components/cards/SupplyChart";
import { SupplyDistributionChart } from "@/components/cards/SupplyDistributionChart";
import { type TotalSupply } from "@/lib/blockchain/supply";
import { type ColateralData } from "@/lib/sheets/collateral";
import { RefreshCw } from "lucide-react";
import { WFIATLogo } from "@/components/ui/WFIATLogo";
import { TokenSelect } from "@/components/ui/TokenSelect";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPayload {
  supplyData: TotalSupply;
  collateralData: ColateralData;
  timestamp: string;
  source: "live" | "snapshot";
  isStale: boolean;
}

interface DashboardApiSuccess {
  success: true;
  data: DashboardPayload;
}

interface DashboardApiError {
  success: false;
  error: string;
}

type DashboardApiResponse = DashboardApiSuccess | DashboardApiError;

async function fetchDashboard(url: string): Promise<DashboardPayload> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
    });
    const body = (await response.json()) as DashboardApiResponse;
    if (!response.ok || body.success !== true) {
      const message =
        body.success === false
          ? body.error
          : `Error HTTP ${response.status} al cargar dashboard`;
      throw new Error(message);
    }
    return body.data;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Error desconocido al cargar dashboard");
  }
}

function formatLastUpdate(timestamp: string): string {
  return (
    new Date(timestamp).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " hs"
  );
}

export default function Dashboard(): React.ReactElement {
  const [selectedStable, setSelectedStable] = useState("wARS");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const {
    data: dashboardData,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<DashboardPayload>("/api/dashboard", fetchDashboard, {
    keepPreviousData: true,
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const supplyData = dashboardData?.supplyData ?? null;
  const collateralData = dashboardData?.collateralData ?? null;
  const lastUpdate = dashboardData ? formatLastUpdate(dashboardData.timestamp) : "";
  const dataSource = dashboardData?.source ?? "live";
  const isStale = dashboardData?.isStale ?? false;

  const collateralTotal = collateralData?.total ?? 0;
  const ratio = supplyData && collateralTotal > 0
    ? (collateralTotal / supplyData.total) * 100
    : 0;
  const canRenderDashboard = supplyData != null && collateralData != null;
  const staleMessage = useMemo(() => {
    if (refreshError && canRenderDashboard) {
      return "Error al actualizar datos. Mostrando último valor conocido.";
    }
    if (error && canRenderDashboard) {
      return "No se pudo refrescar en este intento. Mostrando último valor conocido.";
    }
    return null;
  }, [canRenderDashboard, error, refreshError]);

  const onRefresh = async (): Promise<void> => {
    setRefreshError(null);
    try {
      await mutate();
    } catch (refreshErr) {
      const message =
        refreshErr instanceof Error ? refreshErr.message : "Error al actualizar datos";
      setRefreshError(message);
    }
  };

  const stablecoins = [
    { id: "wARS", label: "wARS", available: true },
    { id: "wBRL", label: "wBRL", available: false, disabledLabel: "(v2.1)" },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-[#FFFFFF] border-b border-[#010103]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <WFIATLogo size={36} />
                <span className="text-3xl font-bold text-[#010103]">wFIAT</span>
              </div>
              <span className="text-[#010103]/30">|</span>
              <TokenSelect
                value={selectedStable}
                options={stablecoins}
                onChange={setSelectedStable}
                className="w-[180px]"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#010103]/70">Argentina 🇦🇷</span>
              {dashboardData && (
                <span
                  className={`text-xs px-2 py-1 rounded-md border ${
                    isStale
                      ? "text-amber-700 border-amber-300 bg-amber-50"
                      : "text-emerald-700 border-emerald-300 bg-emerald-50"
                  }`}
                >
                  Fuente: {dataSource === "live" ? "Live" : "Snapshot"}
                </span>
              )}
              <button
                onClick={onRefresh}
                disabled={isValidating}
                className="flex items-center gap-2 px-4 py-2 bg-[#5f6e78] text-[#FFFFFF] rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <RefreshCw className={`w-4 h-4 ${isValidating ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {staleMessage && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
            <p className="font-medium">{staleMessage}</p>
            <p className="mt-1 text-sm text-amber-700">
              {refreshError ?? (error instanceof Error ? error.message : "")}
            </p>
          </div>
        )}
        {!dashboardData && error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error instanceof Error ? error.message : "Error al cargar datos"}
          </div>
        )}

        {isLoading && !dashboardData && (
          <div className="space-y-8">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Skeleton className="h-[320px] w-full rounded-xl" />
              <Skeleton className="h-[320px] w-full rounded-xl" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Skeleton className="h-[320px] w-full rounded-xl" />
              <Skeleton className="h-[320px] w-full rounded-xl" />
            </div>
            <Skeleton className="h-[340px] w-full rounded-xl" />
          </div>
        )}

        {canRenderDashboard && (
          <div className="space-y-8">
            <RatioCard
              ratio={ratio}
              supplyTotal={supplyData.total}
              collateralTotal={collateralTotal}
              lastUpdate={lastUpdate}
              tokenId={selectedStable}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <SupplyChart supplyData={supplyData} />
              <CollateralChart
                instrumentos={collateralData.instrumentos}
                total={collateralData.total}
                tokenId={selectedStable}
              />
            </div>
            <SupplyDistributionChart supplyData={supplyData} tokenId={selectedStable} />
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
          </div>
        )}
      </div>
    </div>
  );
}
