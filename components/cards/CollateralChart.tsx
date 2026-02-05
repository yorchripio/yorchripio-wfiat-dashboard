// components/cards/CollateralChart.tsx
// Gráfico de composición del colateral

"use client";

import { Card } from "@/components/ui/card";
import { type InstrumentoColateral } from "@/lib/sheets/collateral";
import { COLLATERAL_COLORS } from "@/lib/constants/colors";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface CollateralChartProps {
  instrumentos: InstrumentoColateral[];
  total: number;
}

// Nombres más amigables para mostrar
const NOMBRES_CORTOS: Record<string, string> = {
  FCI: "FCI Adcap",
  Cuenta_Remunerada: "Cta. Remunerada",
  A_la_Vista: "Saldo Vista",
};

export function CollateralChart({ instrumentos, total }: CollateralChartProps) {
  // Preparar datos para el gráfico (solo instrumentos activos)
  const chartData = instrumentos
    .filter((inst) => inst.activo && inst.valorTotal > 0)
    .map((inst) => ({
      name: NOMBRES_CORTOS[inst.tipo] || inst.nombre,
      value: inst.valorTotal,
      porcentaje: inst.porcentaje,
      tipo: inst.tipo,
      rendimiento: inst.rendimientoDiario,
    }));

  // Formatear números en formato argentino
  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  };

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof chartData[0] }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#FFFFFF] p-3 rounded-lg shadow-lg border border-[#010103]/10">
          <p className="font-semibold text-[#010103]">{data.name}</p>
          <p className="text-sm text-gray-600">
            Valor: {formatCurrency(data.value)}
          </p>
          <p className="text-sm text-gray-600">
            Porcentaje: {data.porcentaje.toFixed(1)}%
          </p>
          {data.rendimiento > 0 && (
            <p className="text-sm text-green-600">
              Rend. diario: {data.rendimiento.toFixed(3)}%
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Leyenda personalizada
  const CustomLegend = ({ payload }: { payload?: Array<{ value: string; color: string }> }) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-600">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-[#010103] mb-2">
        Composición del Colateral
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Total: {formatCurrency(total)}
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
              dataKey="value"
              label={({ porcentaje }: { porcentaje: number }) => `${porcentaje.toFixed(1)}%`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLLATERAL_COLORS[entry.tipo as keyof typeof COLLATERAL_COLORS] || "#94A3B8"}
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

      {/* Detalle de instrumentos */}
      <div className="mt-4 space-y-3">
        {chartData.map((inst) => (
          <div
            key={inst.tipo}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLLATERAL_COLORS[inst.tipo as keyof typeof COLLATERAL_COLORS] }}
              />
              <span className="text-sm font-medium text-[#010103]">
                {inst.name}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#010103]">
                {formatCurrency(inst.value)}
              </p>
              {inst.rendimiento > 0 && (
                <p className="text-xs text-green-600">
                  +{inst.rendimiento.toFixed(3)}% diario
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
