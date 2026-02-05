// components/cards/RendimientosChart.tsx
// Gráfico comparativo de rendimientos diarios

"use client";

import { Card } from "@/components/ui/card";
import { type InstrumentoColateral } from "@/lib/sheets/collateral";
import { COLLATERAL_COLORS } from "@/lib/constants/colors";
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

interface RendimientosChartProps {
  instrumentos: InstrumentoColateral[];
}

// Nombres más amigables para mostrar
const NOMBRES_CORTOS: Record<string, string> = {
  FCI: "FCI Adcap",
  Cuenta_Remunerada: "Cta. Remunerada",
  A_la_Vista: "Saldo Vista",
};

export function RendimientosChart({
  instrumentos,
}: RendimientosChartProps) {
  // Preparar datos para el gráfico (solo instrumentos activos con rendimiento)
  const chartData = instrumentos
    .filter((inst) => inst.activo && inst.valorTotal > 0)
    .map((inst) => ({
      name: NOMBRES_CORTOS[inst.tipo] || inst.nombre,
      rendimiento: inst.rendimientoDiario,
      tipo: inst.tipo,
      valorTotal: inst.valorTotal,
    }))
    .sort((a, b) => b.rendimiento - a.rendimiento); // Ordenar por rendimiento descendente

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
          <p className="text-sm text-green-600 font-medium">
            Rendimiento: {value.toFixed(3)}% diario
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Valor: ${data.valorTotal.toLocaleString("es-AR", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  // Si no hay rendimientos para mostrar
  if (chartData.length === 0 || chartData.every((d) => d.rendimiento === 0)) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-[#010103] mb-2">
          Rendimientos Diarios
        </h3>
        <div className="h-[300px] flex items-center justify-center">
          <p className="text-sm text-gray-500">
            No hay datos de rendimiento disponibles
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Rendimientos Diarios
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Comparación de rendimientos por instrumento
      </p>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,1,3,0.08)" />
            <XAxis
              type="number"
              tick={{ fill: "#010103", fontSize: 12 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
              tickFormatter={(value) => `${value.toFixed(3)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: "#010103", fontSize: 12 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
              width={120}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="rendimiento" radius={[0, 8, 8, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLLATERAL_COLORS[entry.tipo as keyof typeof COLLATERAL_COLORS] || "#94A3B8"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle de rendimientos */}
      <div className="mt-4 space-y-2">
        {chartData.map((inst) => (
          <div
            key={inst.tipo}
            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLLATERAL_COLORS[inst.tipo as keyof typeof COLLATERAL_COLORS] }}
              />
              <span className="text-xs text-gray-600">{inst.name}</span>
            </div>
            <span className="text-xs font-semibold text-green-600">
              {inst.rendimiento.toFixed(3)}% diario
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
