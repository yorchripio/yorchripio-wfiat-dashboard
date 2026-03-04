// app/login/page.tsx
// Página de login: email + contraseña; si el usuario tiene 2FA, se muestra input de código.

"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WFIATLogo } from "@/components/ui/WFIATLogo";

function LoginForm(): React.ReactElement {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "CredentialsSignin"
      ? "Credenciales inválidas o sesión 2FA expirada."
      : null
  );

  async function handleSubmitCredentials(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "same-origin",
      });
      let data: { success?: boolean; requires2FA?: boolean; error?: string };
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        setError("Respuesta inválida del servidor. Intentá de nuevo.");
        setLoading(false);
        return;
      }

      if (!data.success) {
        setError(data.error ?? "Error al iniciar sesión");
        setLoading(false);
        return;
      }

      if (data.requires2FA) {
        setStep("2fa");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Credenciales inválidas");
        setLoading(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = callbackUrl;
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      setLoading(false);
    }
  }

  async function handleSubmit2FA(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        code: code.trim(),
        redirect: false,
      });
      if (result?.error) {
        setError(result.error === "CredentialsSignin" ? "Código 2FA incorrecto o expirado" : result.error);
        setLoading(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = callbackUrl;
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
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
              {step === "2fa" ? "Código 2FA" : "Iniciar sesión"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {step === "credentials" ? (
              <form onSubmit={handleSubmitCredentials} className="space-y-4">
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
                    required
                    autoComplete="email"
                    className="w-full border border-[#010103]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-[#010103] mb-1"
                  >
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full border border-[#010103]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  {loading ? "Verificando..." : "Entrar"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit2FA} className="space-y-4">
                <p className="text-sm text-[#010103]/70">
                  Contraseña correcta. Ingresá el código de 6 dígitos de tu app de autenticación para <strong>{email || "tu cuenta"}</strong>.
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
                    setStep("credentials");
                    setCode("");
                    setError(null);
                  }}
                  className="w-full text-sm text-[#010103]/60 hover:underline"
                >
                  Volver a email y contraseña
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
    <Suspense fallback={<div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">Cargando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
