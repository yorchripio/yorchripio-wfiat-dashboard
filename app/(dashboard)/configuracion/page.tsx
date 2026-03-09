"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { User, Shield, Loader2, TrendingUp, RefreshCw, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RoleSelect } from "@/components/ui/RoleSelect";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() ?? null;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

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

  // Panel de usuarios (solo admin@ripio.com)
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<"VIEWER" | "TRADER">("VIEWER");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async (): Promise<void> => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      const json: { success: boolean; data?: UserRow[] } = await res.json();
      if (json.success && json.data) setUsersList(json.data);
    } catch {
      /* ignore */
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.email?.toLowerCase() === ADMIN_EMAIL) {
      fetchUsers();
    }
  }, [session?.user?.email, fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(false);
    if (!createEmail.trim() || !createPassword || !createName.trim()) {
      setCreateError("Email, contraseña y nombre son obligatorios");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          name: createName.trim(),
          role: createRole,
        }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (json.success) {
        setCreateSuccess(true);
        setCreateEmail("");
        setCreatePassword("");
        setCreateName("");
        setCreateRole("VIEWER");
        fetchUsers();
      } else {
        setCreateError(json.error ?? "Error al crear usuario");
      }
    } catch {
      setCreateError("Error de conexión");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "VIEWER" | "TRADER"): Promise<void> => {
    setRoleUpdatingId(userId);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (json.success) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        setCreateError(json.error ?? "Error al actualizar rol");
      }
    } catch {
      setCreateError("Error de conexión");
    } finally {
      setRoleUpdatingId(null);
    }
  };

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

        {/* Panel de usuarios (solo admin@ripio.com) */}
        {session?.user?.email?.toLowerCase() === ADMIN_EMAIL && (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#010103]">
                <Users className="size-5" />
                Usuarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-[#010103]/70">
                Gestioná usuarios: creá nuevos o editá el rol de los existentes.
              </p>

              {!showCreateForm ? (
                <Button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(true);
                    setCreateError(null);
                    setCreateSuccess(false);
                  }}
                  className="bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  Crear usuario
                </Button>
              ) : (
                <form onSubmit={handleCreateUser} className="space-y-4 rounded-lg border border-[#010103]/10 p-4">
                  <h3 className="text-sm font-semibold text-[#010103]">Crear usuario</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="user-email" className="block text-sm font-medium text-[#010103] mb-1">Email</label>
                      <input
                        id="user-email"
                        type="email"
                        value={createEmail}
                        onChange={(e) => setCreateEmail(e.target.value)}
                        className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                        placeholder="usuario@ejemplo.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="user-password" className="block text-sm font-medium text-[#010103] mb-1">Contraseña</label>
                      <input
                        id="user-password"
                        type="password"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="user-name" className="block text-sm font-medium text-[#010103] mb-1">Nombre</label>
                      <input
                        id="user-name"
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                        placeholder="Nombre del usuario"
                      />
                    </div>
                    <div>
                      <label htmlFor="user-role" className="block text-sm font-medium text-[#010103] mb-1">Rol</label>
                      <RoleSelect
                        value={createRole}
                        onChange={setCreateRole}
                        className="w-full max-w-[180px]"
                      />
                    </div>
                  </div>
                  {createError && <p className="text-sm text-red-600">{createError}</p>}
                  {createSuccess && <p className="text-sm text-green-600">Usuario creado correctamente.</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={createLoading} className="bg-[#5f6e78] hover:bg-[#5f6e78]/90">
                      {createLoading ? <> <Loader2 className="size-4 animate-spin" /> Creando... </> : "Crear usuario"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCreateForm(false);
                        setCreateError(null);
                        setCreateSuccess(false);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}

              <div>
                <h3 className="text-sm font-semibold text-[#010103] mb-2">Usuarios existentes</h3>
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-[#010103]/60">
                    <RefreshCw className="size-4 animate-spin" /> Cargando...
                  </div>
                ) : usersList.length === 0 ? (
                  <p className="text-sm text-[#010103]/50">No hay usuarios.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#010103]/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#010103]/10 bg-[#010103]/5">
                          <th className="text-left py-2 px-3 font-medium text-[#010103]">Email</th>
                          <th className="text-left py-2 px-3 font-medium text-[#010103]">Nombre</th>
                          <th className="text-left py-2 px-3 font-medium text-[#010103]">Rol</th>
                          <th className="text-left py-2 px-3 font-medium text-[#010103]">2FA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u.id} className="border-b border-[#010103]/5 last:border-0">
                            <td className="py-2 px-3 text-[#010103]/90">{u.email}</td>
                            <td className="py-2 px-3 text-[#010103]/90">{u.name}</td>
                            <td className="py-2 px-3 text-[#010103]/90">
                              {u.role === "ADMIN" ? (
                                <div className="flex min-h-[36px] min-w-[120px] items-center rounded-lg border border-[#010103]/15 bg-[#FFFFFF] px-3 py-2 text-sm text-[#010103]">
                                  Admin
                                </div>
                              ) : (
                                <RoleSelect
                                  value={u.role as "VIEWER" | "TRADER"}
                                  onChange={(newRole) => handleRoleChange(u.id, newRole)}
                                  disabled={roleUpdatingId === u.id}
                                  compact
                                  className="min-w-[120px]"
                                />
                              )}
                            </td>
                            <td className="py-2 px-3 text-[#010103]/70">{u.totpEnabled ? "Sí" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
