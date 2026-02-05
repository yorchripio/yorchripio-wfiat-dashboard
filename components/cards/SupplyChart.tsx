// components/cards/SupplyChart.tsx
// Gráfico de distribución del supply por blockchain

"use client";

import { Card } from "@/components/ui/card";
import { type TotalSupply } from "@/lib/blockchain/supply";
import { CHAIN_COLORS } from "@/lib/constants/colors";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface SupplyChartProps {
  supplyData: TotalSupply;
}

export function SupplyChart({ supplyData }: SupplyChartProps) {
  // Preparar datos para el gráfico
  const chartData = [
    {
      name: "Ethereum",
      supply: supplyData.chains.ethereum.supply,
      success: supplyData.chains.ethereum.success,
    },
    {
      name: "Worldchain",
      supply: supplyData.chains.worldchain.supply,
      success: supplyData.chains.worldchain.success,
    },
    {
      name: "Base",
      supply: supplyData.chains.base.supply,
      success: supplyData.chains.base.success,
    },
  ];

  // Formatear números en formato argentino
  const formatSupply = (value: number) => {
    return `${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })} wARS`;
  };

  // Tooltip personalizado
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: typeof chartData[0]; value: number }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const value = payload[0].value as number;
      return (
        <div className="bg-[#FFFFFF] p-3 rounded-lg shadow-lg border border-[#010103]/10">
          <p className="font-semibold text-[#010103]">{data.name}</p>
          <p className="text-sm text-gray-600">
            Supply: {formatSupply(value)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {data.success ? "✅ Conectado" : "❌ Error"}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-[#010103] mb-2">
        Distribución del Supply
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Total: {formatSupply(supplyData.total)}
      </p>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,1,3,0.08)" />
            <XAxis
              dataKey="name"
              tick={{ fill: "#010103", fontSize: 12 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
            />
            <YAxis
              tick={{ fill: "#010103", fontSize: 12 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
              tickFormatter={(value) =>
                `${(value / 1000000).toFixed(1)}M`
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="supply" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => {
                // Worldchain usa gris grafito en lugar de negro para la barra
                const barColor = entry.name === "Worldchain" && entry.success
                  ? "#4B5563" // Gris grafito
                  : entry.success
                  ? CHAIN_COLORS[entry.name as keyof typeof CHAIN_COLORS] || "#94A3B8"
                  : "#EF4444";
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={barColor}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Leyenda de colores */}
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-[#010103]/10">
        {chartData.map((chain) => {
          // Worldchain usa gris grafito en la leyenda también
          const legendColor = chain.name === "Worldchain" && chain.success
            ? "#4B5563" // Gris grafito
            : chain.success
            ? CHAIN_COLORS[chain.name as keyof typeof CHAIN_COLORS]
            : "#EF4444";
          return (
            <div key={chain.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: legendColor,
                }}
              />
              <span className="text-sm text-gray-600">{chain.name}</span>
              <span className="text-xs text-gray-400">
                ({formatSupply(chain.supply)})
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
