// components/cards/RatioHistoryChart.tsx
// Gráfico de evolución histórica del ratio de colateralización

"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type HistoricalDataPoint } from "@/lib/sheets/history";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface RatioHistoryChartProps {
  historicalData: HistoricalDataPoint[];
  currentRatio: number;
}

type TimeFilter = "1W" | "1M" | "YTD" | "Historic";

export function RatioHistoryChart({
  historicalData,
  currentRatio,
}: RatioHistoryChartProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("Historic");

  // Filtrar datos según el filtro de tiempo seleccionado
  const filteredData = useMemo(() => {
    if (historicalData.length === 0) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let cutoff: Date;

    switch (timeFilter) {
      case "1W":
        cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case "1M":
        cutoff = new Date(today);
        cutoff.setMonth(cutoff.getMonth() - 1);
        break;
      case "YTD":
        cutoff = new Date(today.getFullYear(), 0, 1);
        break;
      case "Historic":
      default:
        return historicalData;
    }

    return historicalData.filter((point) => point.timestamp >= cutoff.getTime());
  }, [historicalData, timeFilter]);

  // Calcular eje Y dinámico basado en los datos filtrados
  const yAxisConfig = useMemo(() => {
    if (filteredData.length === 0) {
      return { min: 90, max: 120, ticks: [90, 95, 100, 105, 110, 115, 120] };
    }

    const ratios = filteredData.map((d) => d.ratio);
    const dataMin = Math.min(...ratios);
    const dataMax = Math.max(...ratios);

    // Redondear hacia abajo al múltiplo de 5 más cercano, con margen
    const min = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
    // Redondear hacia arriba al múltiplo de 5 más cercano, con margen
    const max = Math.ceil((dataMax + 5) / 5) * 5;

    // Generar ticks cada 5%
    const ticks: number[] = [];
    for (let t = min; t <= max; t += 5) {
      ticks.push(t);
    }

    return { min, max, ticks };
  }, [filteredData]);

  // Formatear ratio para mostrar
  const formatRatio = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Tooltip personalizado
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: HistoricalDataPoint; value: number }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#FFFFFF] p-3 rounded-lg shadow-lg border border-[#010103]/10">
          <p className="font-semibold text-[#010103] mb-2">
            {data.fechaFormatted}
          </p>
          <p className="text-sm text-[#4A13A5] font-medium">
            Ratio: {formatRatio(data.ratio)}
          </p>
          <p className="text-xs text-[#010103]/60 mt-1">
            Colateral: ${data.colateralTotal.toLocaleString("es-AR", {
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-xs text-[#010103]/60">
            Supply: {data.supplyTotal.toLocaleString("es-AR", {
              maximumFractionDigits: 0,
            })} wARS
          </p>
        </div>
      );
    }
    return null;
  };

  // Determinar color de la línea según el ratio actual
  const getLineColor = () => {
    if (currentRatio > 103) return "#4A13A5"; // Violeta marca
    if (currentRatio >= 100) return "#F59E0B"; // Amarillo
    return "#EF4444"; // Rojo
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[#010103] mb-1">
            Evolución del Ratio de Colateralización
          </h3>
          <p className="text-sm text-[#010103]/60">
            Ratio actual: <span className="font-semibold text-[#4A13A5]">{formatRatio(currentRatio)}</span>
          </p>
        </div>
        {/* Filtros de tiempo */}
        <div className="flex gap-2">
          {(["1W", "1M", "YTD", "Historic"] as TimeFilter[]).map((filter) => (
            <Button
              key={filter}
              variant={timeFilter === filter ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter(filter)}
              className="text-xs"
            >
              {filter === "Historic" ? "History" : filter}
            </Button>
          ))}
        </div>
      </div>

      <div className="h-[450px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filteredData}
            margin={{ top: 10, right: 30, left: 10, bottom: 100 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,1,3,0.08)" />
            <XAxis
              dataKey="fechaFormatted"
              tick={{ fill: "#010103", fontSize: 10 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
              angle={-60}
              textAnchor="end"
              interval="preserveStartEnd"
              height={110}
              dy={10}
            />
            <YAxis
              tick={{ fill: "#010103", fontSize: 12 }}
              axisLine={{ stroke: "rgba(1,1,3,0.12)" }}
              tickFormatter={(value) => `${value}%`}
              domain={[yAxisConfig.min, yAxisConfig.max]}
              ticks={yAxisConfig.ticks}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Línea de referencia en 100% */}
            <ReferenceLine
              y={100}
              stroke="#EF4444"
              strokeDasharray="5 5"
              label={{ value: "100%", position: "right", fill: "#EF4444", fontSize: 10 }}
            />
            {/* Línea de referencia en 103% (saludable) */}
            <ReferenceLine
              y={103}
              stroke="#4A13A5"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
            <Line
              type="monotone"
              dataKey="ratio"
              stroke={getLineColor()}
              strokeWidth={2}
              dot={{ fill: getLineColor(), r: 2 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Leyenda de zonas */}
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-100 border border-red-300" />
          <span className="text-[#010103]">&lt; 100% (Crítico)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-100 border border-yellow-300" />
          <span className="text-[#010103]">100% - 103% (Moderado)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-100 border border-green-300" />
          <span className="text-[#010103]">&gt; 103% (Saludable)</span>
        </div>
      </div>
    </Card>
  );
}
