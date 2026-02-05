// components/cards/RatioCard.tsx
// Card principal que muestra el ratio de colateralización

"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RatioCardProps {
  ratio: number;
  supplyTotal: number;
  collateralTotal: number;
  lastUpdate: string;
}

export function RatioCard({
  ratio,
  supplyTotal,
  collateralTotal,
  lastUpdate,
}: RatioCardProps) {
  // Determinar estado según el ratio
  const getStatus = (ratio: number) => {
    if (ratio > 103) {
      return {
        label: "Saludable",
        emoji: "🟢",
        color: "bg-green-100 text-green-800",
        barColor: "bg-green-500",
      };
    } else if (ratio >= 100) {
      return {
        label: "Moderado",
        emoji: "🟡",
        color: "bg-yellow-100 text-yellow-800",
        barColor: "bg-yellow-500",
      };
    } else {
      return {
        label: "Crítico",
        emoji: "🔴",
        color: "bg-red-100 text-red-800",
        barColor: "bg-red-500",
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

  // Calcular el ancho de la barra (máximo 100%)
  const barWidth = Math.min(ratio, 120);

  // Buffer (diferencia entre colateral y supply)
  const buffer = collateralTotal - supplyTotal;

  return (
    <Card className="p-8 border-2 border-blue-500 shadow-lg">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Lado izquierdo: Ratio */}
        <div className="flex-1">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            Ratio de Colateralización
          </h2>

          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-blue-600">
              {ratio.toFixed(1)}%
            </span>
            <Badge className={status.color}>
              {status.emoji} {status.label}
            </Badge>
          </div>

          {/* Barra de progreso */}
          <div className="mt-6 mb-2">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${status.barColor} transition-all duration-500`}
                style={{ width: `${(barWidth / 120) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-red-400">100%</span>
              <span>120%</span>
            </div>
          </div>
        </div>

        {/* Lado derecho: Métricas */}
        <div className="flex-1 space-y-4 md:text-right">
          <div>
            <p className="text-sm text-gray-500">Supply Total</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatNumber(supplyTotal)} wARS
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Colateral Total</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(collateralTotal)} ARS
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Buffer</p>
            <p className={`text-xl font-semibold ${buffer >= 0 ? "text-green-600" : "text-red-600"}`}>
              {buffer >= 0 ? "+" : ""}{formatCurrency(buffer)} ARS
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Última actualización: {lastUpdate}
        </p>
      </div>
    </Card>
  );
}