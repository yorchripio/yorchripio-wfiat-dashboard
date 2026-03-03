"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { User, Shield, Loader2, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TwoFAStatus = "idle" | "loading" | "enabled" | "setup";

interface InstrumentoConfigRow {
  id: string;
  tipo: string;
  label: string;
  generaRendimiento: boolean;
}

export default function ConfiguracionPage(): React.ReactElement {
  const { data: session, status: sessionStatus } = useSession();
  const [twoFAStatus, setTwoFAStatus] = useState<TwoFAStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>("");
  const [code, setCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState(false);

  // Consultar si 2FA está activado
  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const res = await fetch("/api/auth/2fa/status");
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.enabled) {
          setTwoFAStatus("enabled");
        } else {
          setTwoFAStatus("loading");
        }
      } catch {
        if (!cancelled) setTwoFAStatus("loading");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Si no está activado, cargar setup (QR)
  useEffect(() => {
    if (twoFAStatus !== "loading") return;
    let cancelled = false;
    async function loadSetup(): Promise<void> {
      try {
        const res = await fetch("/api/auth/2fa/setup");
        const json = await res.json();
        if (cancelled) return;
        if (!json.success || !json.data?.qrUrl || !json.data?.secret) {
          setTwoFAStatus("idle");
          return;
        }
        setSecret(json.data.secret);
        const QRCode = (await import("qrcode")).default;
        const dataUrl = await QRCode.toDataURL(json.data.qrUrl, {
          width: 200,
          margin: 2,
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setTwoFAStatus("setup");
        }
      } catch {
        if (!cancelled) setTwoFAStatus("idle");
      }
    }
    loadSetup();
    return () => {
      cancelled = true;
    };
  }, [twoFAStatus]);

  const handleEnable2FA = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSetupError(null);
    if (!code.trim() || code.trim().length !== 6 || !secret) {
      setSetupError("Ingresá el código de 6 dígitos de tu app");
      return;
    }
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), secret }),
      });
      const json = await res.json();
      if (json.success) {
        setSetupSuccess(true);
        setTwoFAStatus("enabled");
        setQrDataUrl(null);
        setSecret("");
        setCode("");
      } else {
        setSetupError(json.error ?? "Código incorrecto");
      }
    } catch {
      setSetupError("Error de conexión");
    } finally {
      setSetupLoading(false);
    }
  };

  // --- Instrumentos config ---
  const [instrumentos, setInstrumentos] = useState<InstrumentoConfigRow[]>([]);
  const [instrumentosLoading, setInstrumentosLoading] = useState(true);
  const [instrumentosToggling, setInstrumentosToggling] = useState<string | null>(null);

  const fetchInstrumentos = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/instrumentos");
      const json: { success: boolean; data?: InstrumentoConfigRow[] } = await res.json();
      if (json.success && json.data) setInstrumentos(json.data);
    } catch {
      /* silently fail */
    } finally {
      setInstrumentosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstrumentos();
  }, [fetchInstrumentos]);

  const handleToggleRendimiento = async (inst: InstrumentoConfigRow): Promise<void> => {
    setInstrumentosToggling(inst.id);
    try {
      const res = await fetch("/api/instrumentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inst.id, generaRendimiento: !inst.generaRendimiento }),
      });
      const json: { success: boolean } = await res.json();
      if (json.success) {
        setInstrumentos((prev) =>
          prev.map((i) => (i.id === inst.id ? { ...i, generaRendimiento: !i.generaRendimiento } : i))
        );
      }
    } catch {
      /* silently fail */
    } finally {
      setInstrumentosToggling(null);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#010103]/10 bg-[#FFFFFF] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-[#010103]">Configuración</h1>
          <p className="text-[#010103]/70 mt-1">
            Perfil, instrumentos y autenticación en dos pasos (2FA)
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Perfil */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#010103]">
              <User className="size-5" />
              Perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessionStatus === "loading" ? (
              <p className="text-[#010103]/60">Cargando...</p>
            ) : session?.user ? (
              <>
                <p><span className="font-medium text-[#010103]/80">Nombre:</span> {session.user.name ?? "—"}</p>
                <p><span className="font-medium text-[#010103]/80">Email:</span> {session.user.email ?? "—"}</p>
                <p><span className="font-medium text-[#010103]/80">Rol:</span> {session.user.role ?? "—"}</p>
              </>
            ) : (
              <p className="text-[#010103]/60">No hay sesión</p>
            )}
          </CardContent>
        </Card>

        {/* 2FA */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#010103]">
              <Shield className="size-5" />
              Autenticación en dos pasos (2FA)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {twoFAStatus === "idle" && (
              <p className="text-[#010103]/70">Comprobando estado...</p>
            )}
            {twoFAStatus === "loading" && (
              <div className="flex items-center gap-2 text-[#010103]/70">
                <Loader2 className="size-5 animate-spin" />
                <span>Preparando configuración...</span>
              </div>
            )}
            {twoFAStatus === "enabled" && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
                <p className="font-medium">2FA activado</p>
                <p className="text-sm mt-1">
                  Tu cuenta está protegida con autenticación en dos pasos. En el próximo inicio de sesión se te pedirá el código de tu app.
                </p>
              </div>
            )}
            {twoFAStatus === "setup" && !setupSuccess && (
              <form onSubmit={handleEnable2FA} className="space-y-4">
                <p className="text-[#010103]/80 text-sm">
                  Escaneá el código con tu app de autenticación (Google Authenticator, Authy, etc.) y luego ingresá el código de 6 dígitos.
                </p>
                {qrDataUrl && (
                  <div className="flex justify-center p-4 bg-white rounded-lg border border-[#010103]/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt="QR para 2FA"
                      width={200}
                      height={200}
                      className="size-[200px]"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="code-2fa" className="block text-sm font-medium text-[#010103] mb-1">
                    Código de 6 dígitos
                  </label>
                  <input
                    id="code-2fa"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full max-w-[8rem] rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                    placeholder="000000"
                  />
                </div>
                {setupError && (
                  <p className="text-sm text-red-600">{setupError}</p>
                )}
                <Button
                  type="submit"
                  disabled={setupLoading || code.length !== 6}
                  className="bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  {setupLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    "Activar 2FA"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        {/* Instrumentos */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#010103]">
              <TrendingUp className="size-5" />
              Instrumentos de colateral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[#010103]/70">
              Configurá qué tipos de instrumento generan rendimiento. Solo los instrumentos marcados como &quot;Rinde&quot; se incluyen en el cálculo de rendimiento de la cartera.
            </p>
            {instrumentosLoading ? (
              <div className="flex items-center gap-2 text-[#010103]/60">
                <RefreshCw className="size-4 animate-spin" /> Cargando...
              </div>
            ) : instrumentos.length === 0 ? (
              <p className="text-sm text-[#010103]/50">No hay instrumentos configurados.</p>
            ) : (
              <div className="space-y-2">
                {instrumentos.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between rounded-lg border border-[#010103]/10 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#010103]">{inst.label}</p>
                      <p className="text-xs text-[#010103]/50">Tipo: {inst.tipo.replace(/_/g, " ")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleRendimiento(inst)}
                      disabled={instrumentosToggling === inst.id}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5f6e78] focus:ring-offset-2 ${
                        inst.generaRendimiento ? "bg-emerald-500" : "bg-[#010103]/20"
                      } ${instrumentosToggling === inst.id ? "opacity-50" : ""}`}
                      title={inst.generaRendimiento ? "Rinde — click para desactivar" : "No rinde — click para activar"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                          inst.generaRendimiento ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-[#010103]/40 mt-2">
              Ejemplo: FCI y Cuenta Remunerada generan rendimiento; Saldo a la Vista no.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
