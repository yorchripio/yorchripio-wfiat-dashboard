// components/cards/SupplyCard.tsx
// Card que muestra el supply de wARS en cada blockchain

"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type ChainSupply } from "@/lib/blockchain/supply";

interface SupplyCardProps {
  data: ChainSupply;
}

// Colores por chain
const chainColors: Record<string, { bg: string; text: string; badge: string }> = {
  ethereum: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-800",
  },
  worldchain: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-800",
  },
  base: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    badge: "bg-sky-100 text-sky-800",
  },
};

export function SupplyCard({ data }: SupplyCardProps) {
  const colors = chainColors[data.chain] || chainColors.ethereum;

  // Formatear el supply con separador de miles argentino
  const supplyFormatted = data.supply.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });

  return (
    <Card className={`p-6 ${colors.bg} border-none`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-semibold ${colors.text}`}>{data.chainName}</h3>
        {data.success ? (
          <Badge className={colors.badge}>Conectado</Badge>
        ) : (
          <Badge variant="destructive">Error</Badge>
        )}
      </div>

      {data.success ? (
        <div>
          <p className="text-3xl font-bold text-gray-900">{supplyFormatted}</p>
          <p className="text-sm text-gray-500 mt-1">wARS</p>
        </div>
      ) : (
        <p className="text-sm text-red-600">{data.error}</p>
      )}
    </Card>
  );
}