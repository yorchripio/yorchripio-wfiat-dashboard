"use client";

import Image from "next/image";

/**
 * Logo oficial de wFIAT. Logo principal de la aplicación.
 */
export function WFIATLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}): React.ReactElement {
  return (
    <Image
      src="/wfiat-logo.webp"
      alt="wFIAT"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
