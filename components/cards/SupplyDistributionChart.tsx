// components/cards/SupplyDistributionChart.tsx
// Gráfico de distribución porcentual del supply por blockchain

"use client";

import { Card } from "@/components/ui/card";
import { type TotalSupply } from "@/lib/blockchain/supply";
import { CHAIN_COLORS } from "@/lib/constants/colors";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface SupplyDistributionChartProps {
  supplyData: TotalSupply;
}

export function SupplyDistributionChart({
  supplyData,
}: SupplyDistributionChartProps) {
  // Preparar datos para el gráfico (solo chains exitosas)
  const chartData = [
    {
      name: "Ethereum",
      supply: supplyData.chains.ethereum.supply,
      porcentaje: supplyData.total > 0
        ? (supplyData.chains.ethereum.supply / supplyData.total) * 100
        : 0,
      success: supplyData.chains.ethereum.success,
    },
    {
      name: "Worldchain",
      supply: supplyData.chains.worldchain.supply,
      porcentaje: supplyData.total > 0
        ? (supplyData.chains.worldchain.supply / supplyData.total) * 100
        : 0,
      success: supplyData.chains.worldchain.success,
    },
    {
      name: "Base",
      supply: supplyData.chains.base.supply,
      porcentaje: supplyData.total > 0
        ? (supplyData.chains.base.supply / supplyData.total) * 100
        : 0,
      success: supplyData.chains.base.success,
    },
  ].filter((chain) => chain.success && chain.supply > 0);

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
            Supply: {formatSupply(data.supply)}
          </p>
          <p className="text-sm font-medium text-[#4A13A5]">
            Porcentaje: {data.porcentaje.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  // Leyenda personalizada
  const CustomLegend = ({
    payload,
  }: {
    payload?: Array<{ value: string; color: string; payload: typeof chartData[0] }>;
  }) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry, index) => {
          const data = entry.payload as typeof chartData[0];
          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-600">{entry.value}</span>
              <span className="text-xs text-gray-400">
                ({data.porcentaje.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-[#010103] mb-2">
        Distribución Porcentual del Supply
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Total: {formatSupply(supplyData.total)}
      </p>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="supply"
              label={({ porcentaje }) => `${porcentaje.toFixed(1)}%`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.name === "Worldchain"
                      ? "#4B5563" // Gris grafito para Worldchain
                      : CHAIN_COLORS[entry.name as keyof typeof CHAIN_COLORS] ||
                        "#94A3B8"
                  }
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle de cada chain */}
      <div className="mt-4 space-y-2">
        {chartData.map((chain) => (
          <div
            key={chain.name}
            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    chain.name === "Worldchain"
                      ? "#4B5563"
                      : CHAIN_COLORS[chain.name as keyof typeof CHAIN_COLORS],
                }}
              />
              <span className="text-xs text-gray-600">{chain.name}</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-[#010103]">
                {chain.porcentaje.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400">
                {formatSupply(chain.supply)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
