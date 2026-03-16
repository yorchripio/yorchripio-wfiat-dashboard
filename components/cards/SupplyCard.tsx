// components/cards/SupplyCard.tsx
// Card que muestra el supply de wARS en cada blockchain

"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChainLogo } from "@/components/ui/ChainLogo";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { type ChainSupply } from "@/lib/blockchain/supply";
import { CHAIN_CARD_COLORS } from "@/lib/constants/colors";

interface SupplyCardProps {
  data: ChainSupply;
  tokenId?: string;
}

export function SupplyCard({ data, tokenId = "wARS" }: SupplyCardProps) {
  const colors = CHAIN_CARD_COLORS[data.chain] || CHAIN_CARD_COLORS.ethereum;

  // Formatear el supply con separador de miles argentino
  const supplyFormatted = data.supply.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });

  return (
    <Card className={`p-6 ${colors.bg} border-none`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ChainLogo chain={data.chain} size={28} />
          <h3 className={`font-semibold ${colors.text}`}>{data.chainName}</h3>
        </div>
        {data.success ? (
          <Badge className={colors.badge}>Conectado</Badge>
        ) : (
          <Badge variant="destructive">Error</Badge>
        )}
      </div>

      {data.success ? (
        <div>
          <p className="text-3xl font-bold text-[#010103]">{supplyFormatted}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <TokenLogo tokenId={tokenId} size={18} />
            <p className="text-sm text-[#010103]/60">{tokenId}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-red-600">{data.error}</p>
      )}
    </Card>
  );
}