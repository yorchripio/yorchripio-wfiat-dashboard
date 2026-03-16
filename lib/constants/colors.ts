// lib/constants/colors.ts
// Colores centralizados para mantener consistencia en toda la aplicación.
// Marca wFIAT: gris tipo Vercel (ds-gray). Gráficos por token: azul wARS, verde wBRL, etc.

// Marca principal wFIAT (estilo Vercel ds-gray-alpha / neutral)
export const BRAND_PRIMARY = "#5f6e78"; // Vercel unified grays.8

// Colores de las blockchains (basados en sus colores oficiales)
export const CHAIN_COLORS = {
  Ethereum: "#627EEA",
  Worldchain: "#010103",
  Base: "#0052FF",
} as const;

// Colores de los instrumentos de colateral
export const COLLATERAL_COLORS = {
  FCI: BRAND_PRIMARY,
  Cuenta_Remunerada: BRAND_PRIMARY,
  A_la_Vista: "#4B5563",
} as const;

// Colores de marca wFIAT
export const BRAND_COLORS = {
  primary: BRAND_PRIMARY,
  black: "#010103",
  white: "#FFFFFF",
} as const;

// Colores de gráficos por token (Vercel unified: blues.6, greens.6, etc.)
export const CHART_TOKEN_COLORS: Record<string, string> = {
  wARS: "#006bb7", // Vercel blues.6
  wBRL: "#0fb800", // Vercel greens.6
  wMXN: "#006341", // Verde mexicano
  wCOP: "#d4a017", // Dorado colombiano
  wPEN: "#d91023", // Rojo peruano
  wCLP: "#0033A0", // Azul chileno
};

/** Color para líneas/áreas de gráficos según el token seleccionado. Por defecto wARS (azul). */
export function getChartColorForToken(tokenId: string): string {
  return CHART_TOKEN_COLORS[tokenId] ?? CHART_TOKEN_COLORS.wARS;
}

// Colores de estado para el ratio
export const RATIO_STATUS_COLORS = {
  saludable: {
    bg: "bg-green-100",
    text: "text-green-800",
    bar: "bg-green-500",
    emoji: "🟢",
  },
  moderado: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    bar: "bg-yellow-500",
    emoji: "🟡",
  },
  critico: {
    bg: "bg-red-100",
    text: "text-red-800",
    bar: "bg-red-500",
    emoji: "🔴",
  },
} as const;

// Colores de fondo para las cards de supply
export const CHAIN_CARD_COLORS = {
  ethereum: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-800",
  },
  worldchain: {
    bg: "bg-[#FFFFFF]",
    text: "text-[#010103]",
    badge: "bg-[#010103]/10 text-[#010103]",
  },
  base: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    badge: "bg-sky-100 text-sky-800",
  },
} as const;
