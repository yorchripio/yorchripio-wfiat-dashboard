// lib/geckoterminal/types.ts
// Tipos para la API de GeckoTerminal (https://api.geckoterminal.com/api/v2)

export interface GeckoNetwork {
  id: string;
  type: "network";
  attributes: {
    name: string;
    coingecko_asset_platform_id: string | null;
  };
}

export interface GeckoNetworksResponse {
  data: GeckoNetwork[];
  links?: {
    first?: string;
    prev?: string | null;
    next?: string | null;
    last?: string;
  };
}

export interface GeckoPoolPriceChange {
  m5: string;
  m15: string;
  m30: string;
  h1: string;
  h6: string;
  h24: string;
}

export interface GeckoPoolTransactions {
  m5: { buys: number; sells: number; buyers: number; sellers: number };
  m15: { buys: number; sells: number; buyers: number; sellers: number };
  m30: { buys: number; sells: number; buyers: number; sellers: number };
  h1: { buys: number; sells: number; buyers: number; sellers: number };
  h6: { buys: number; sells: number; buyers: number; sellers: number };
  h24: { buys: number; sells: number; buyers: number; sellers: number };
}

export interface GeckoPoolVolumeUsd {
  m5: string;
  m15: string;
  m30: string;
  h1: string;
  h6: string;
  h24: string;
}

export interface GeckoPool {
  id: string;
  type: "pool";
  attributes: {
    base_token_price_usd: string;
    base_token_price_native_currency: string;
    quote_token_price_usd: string;
    quote_token_price_native_currency: string;
    base_token_price_quote_token: string;
    quote_token_price_base_token: string;
    address: string;
    name: string;
    pool_name: string;
    pool_fee_percentage: string;
    pool_created_at: string;
    fdv_usd: string;
    market_cap_usd: string;
    price_change_percentage: GeckoPoolPriceChange;
    transactions: GeckoPoolTransactions;
    volume_usd: GeckoPoolVolumeUsd;
    reserve_in_usd: string;
    locked_liquidity_percentage: string;
  };
  relationships?: {
    base_token?: { data: { id: string; type: string } };
    quote_token?: { data: { id: string; type: string } };
    dex?: { data: { id: string; type: string } };
  };
}

export interface GeckoPoolResponse {
  data: GeckoPool;
}

export interface GeckoApiError {
  errors?: Array< { detail?: string; title?: string } >;
}
