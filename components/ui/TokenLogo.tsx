"use client";

import Image from "next/image";

const TOKEN_LOGO_MAP: Record<string, string> = {
  wARS: "/token-logos/wars_logo.svg",
  wBRL: "/token-logos/wbrl_logo.svg",
  wCLP: "/token-logos/wclp_logo.svg",
  wCOP: "/token-logos/wcop_logo.svg",
  wMXN: "/token-logos/wmxn_logo.svg",
  wPEN: "/token-logos/wpen_logo.svg",
};

/**
 * Logo del token (wARS, wBRL, etc.). Usar junto al nombre del token en el dashboard.
 */
export function TokenLogo({
  tokenId = "wARS",
  size = 24,
  className,
}: {
  tokenId?: string;
  size?: number;
  className?: string;
}): React.ReactElement | null {
  const src = TOKEN_LOGO_MAP[tokenId];
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={tokenId}
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      unoptimized
    />
  );
}
