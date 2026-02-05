// lib/constants/colors.ts
// Colores centralizados para mantener consistencia en toda la aplicación

// Colores de las blockchains (basados en sus colores oficiales)
export const CHAIN_COLORS = {
  Ethereum: "#627EEA", // Azul Ethereum
  Worldchain: "#010103", // Negro marca
  Base: "#0052FF", // Azul Base
} as const;

// Colores de los instrumentos de colateral
export const COLLATERAL_COLORS = {
  FCI: "#4A13A5", // Violeta marca (FCI Adcap)
  Cuenta_Remunerada: "#4A13A5", // Violeta marca
  A_la_Vista: "#4B5563", // Gris grafito (Saldo a la vista)
} as const;

// Colores de marca (Ripio / wFIAT)
export const BRAND_COLORS = {
  violet: "#4A13A5",
  black: "#010103",
  white: "#FFFFFF",
} as const;

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

// Colores de fondo para las cards de supply (versión más suave)
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
