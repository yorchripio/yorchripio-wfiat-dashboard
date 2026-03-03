// components/cards/RatioCard.tsx
// Card principal que muestra el ratio de colateralización

"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getChartColorForToken } from "@/lib/constants/colors";

interface RatioCardProps {
  ratio: number;
  supplyTotal: number;
  collateralTotal: number;
  lastUpdate: string;
  /** Token seleccionado (wARS, wBRL…) para color de acento en la card */
  tokenId?: string;
}

export function RatioCard({
  ratio,
  supplyTotal,
  collateralTotal,
  lastUpdate,
  tokenId = "wARS",
}: RatioCardProps) {
  const chartColor = getChartColorForToken(tokenId);

  // Determinar estado según el ratio (saludable usa color del token)
  const getStatus = (ratio: number) => {
    if (ratio > 103) {
      return {
        label: "Saludable",
        emoji: "🟢",
        color: "",
        barColor: "",
        useChartColor: true as const,
      };
    } else if (ratio >= 100) {
      return {
        label: "Moderado",
        emoji: "🟡",
        color: "bg-yellow-100 text-yellow-800",
        barColor: "bg-yellow-500",
        useChartColor: false as const,
      };
    } else {
      return {
        label: "Crítico",
        emoji: "🔴",
        color: "bg-red-100 text-red-800",
        barColor: "bg-red-500",
        useChartColor: false as const,
      };
    }
  };

  const status = getStatus(ratio);

  // Formatear números
  const formatNumber = (num: number) => {
    return num.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  };

  const formatCurrency = (num: number) => {
    return `$${num.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  };

  // Calcular el ancho de la barra proporcionalmente (0-120%)
  const barWidth = Math.min(Math.max(ratio, 0), 120);
  const barWidthPercent = (barWidth / 120) * 100;

  // Posiciones proporcionales de los marcadores
  const marker100Percent = (100 / 120) * 100; // 83.33%

  // Buffer (diferencia entre colateral y supply)
  const buffer = collateralTotal - supplyTotal;

  return (
    <Card
      className="p-8 border-2 shadow-lg"
      style={{ borderColor: chartColor }}
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Lado izquierdo: Ratio */}
        <div className="flex-1">
          <h2 className="text-sm font-medium text-[#010103]/60 uppercase tracking-wide mb-2">
            Ratio de Colateralización
          </h2>

          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-[#010103]">
              {ratio.toFixed(1)}%
            </span>
            <Badge
              className={status.useChartColor ? "" : status.color}
              style={
                status.useChartColor
                  ? { backgroundColor: `${chartColor}20`, color: chartColor }
                  : undefined
              }
            >
              {status.emoji} {status.label}
            </Badge>
          </div>

          {/* Barra de progreso */}
          <div className="mt-6 mb-2">
            <div className="h-4 bg-[#010103]/10 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${status.useChartColor ? "" : status.barColor}`}
                style={{
                  width: `${barWidthPercent}%`,
                  ...(status.useChartColor ? { backgroundColor: chartColor } : {}),
                }}
              />
              {/* Marcador de 100% */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#010103]"
                style={{ left: `${marker100Percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#010103]/50 mt-1 relative">
              <span>0%</span>
              <span 
                className="text-[#010103] font-medium absolute"
                style={{ left: `${marker100Percent}%`, transform: 'translateX(-50%)' }}
              >
                100%
              </span>
              <span>120%</span>
            </div>
          </div>
        </div>

        {/* Lado derecho: Métricas */}
        <div className="flex-1 space-y-4 md:text-right">
          <div>
            <p className="text-sm text-[#010103]/60">Supply Total</p>
            <p className="text-xl font-semibold text-[#010103]">
              {formatNumber(supplyTotal)} wARS
            </p>
          </div>

          <div>
            <p className="text-sm text-[#010103]/60">Colateral Total</p>
            <p className="text-xl font-semibold text-[#010103]">
              {formatCurrency(collateralTotal)} ARS
            </p>
          </div>

          <div>
            <p className="text-sm text-[#010103]/60">Buffer</p>
            <p className={`text-xl font-semibold ${buffer >= 0 ? "text-green-600" : "text-red-600"}`}>
              {buffer >= 0 ? "+" : ""}{formatCurrency(buffer)} ARS
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-[#010103]/10">
        <p className="text-xs text-[#010103]/50">
          Última actualización: {lastUpdate}
        </p>
      </div>
    </Card>
  );
}