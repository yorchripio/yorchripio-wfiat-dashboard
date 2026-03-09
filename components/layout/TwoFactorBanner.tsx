"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";
import Link from "next/link";

export function TwoFactorBanner(): React.ReactElement | null {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const res = await fetch("/api/auth/2fa/status");
        if (!res.ok) return;
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled && data.enabled === false) {
          setShow(true);
        }
      } catch {
        // silencioso
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <ShieldAlert className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        Configurá tu{" "}
        <Link href="/configuracion" className="font-semibold underline hover:text-red-900">
          autenticación de dos factores (2FA)
        </Link>{" "}
        para mayor seguridad.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 hover:bg-red-100 transition-colors"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
