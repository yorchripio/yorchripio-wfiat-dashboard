// app/login/page.tsx
// Login page: email @ripio.com → verification code → enter

"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WFIATLogo } from "@/components/ui/WFIATLogo";

function LoginForm(): React.ReactElement {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!data.success) {
        setError(data.error ?? "Error al enviar el código.");
        setLoading(false);
        return;
      }

      setStep("code");
      setLoading(false);
    } catch {
      setError("Error de conexión.");
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!data.success) {
        setError(data.error ?? "Código incorrecto.");
        setLoading(false);
        return;
      }

      window.location.replace(callbackUrl);
    } catch {
      setError("Error de conexión.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFFFFF] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex items-center gap-2">
          <WFIATLogo size={40} />
          <span className="text-2xl font-bold text-[#5f6e78]">wFIAT</span>
        </div>

        <Card className="w-full border-[#010103]/10">
          <CardHeader>
            <CardTitle className="text-xl">
              {step === "code" ? "Verificar código" : "Iniciar sesión"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {step === "email" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[#010103] mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@ripio.com"
                    required
                    autoComplete="email"
                    className="w-full border border-[#010103]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                  />
                  <p className="text-xs text-[#010103]/50 mt-1">
                    Solo emails @ripio.com
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  {loading ? "Enviando..." : "Enviar código"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="text-sm text-[#010103]/70">
                  Enviamos un código de 6 dígitos a{" "}
                  <strong>{email}</strong>.
                </p>
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-[#010103] mb-1"
                  >
                    Código
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    autoFocus
                    className="w-full border border-[#010103]/20 rounded-lg px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  {loading ? "Verificando..." : "Verificar"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  className="w-full text-sm text-[#010103]/60 hover:underline"
                >
                  Cambiar email
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
          Cargando...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
