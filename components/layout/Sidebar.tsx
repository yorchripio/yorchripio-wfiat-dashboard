"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { WFIATLogo } from "@/components/ui/WFIATLogo";
import {
  LayoutDashboard,
  Shield,
  Database,
  Settings,
  LogOut,
  User,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/colateral", label: "Colateral", icon: Shield },
  { href: "/pools", label: "Pools", icon: BarChart3 },
  { href: "/data", label: "Data", icon: Database },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-col border-r border-[#010103]/10 bg-[#FFFFFF]">
      {/* Logo / marca */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[#010103]/10 px-4">
        <WFIATLogo size={32} />
        <span className="font-bold text-[#010103]">wFIAT</span>
      </div>

      {/* Navegación */}
      <nav className="shrink-0 space-y-0.5 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#5f6e78] text-white"
                  : "text-[#010103]/80 hover:bg-[#010103]/5 hover:text-[#010103]"
              )}
            >
              <Icon className="size-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Espacio entre nav y perfil */}
      <div className="min-h-[4rem] shrink-0" aria-hidden />

      {/* Espaciador para que el bloque de perfil quede abajo */}
      <div className="flex-1 min-h-0" aria-hidden />

      {/* Usuario y cerrar sesión — fijo abajo a la izquierda al hacer scroll */}
      <div className="shrink-0 border-t border-[#010103]/10 p-3">
        {status === "loading" ? (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#010103]/50">
            <User className="size-5 shrink-0" />
            <span>Cargando...</span>
          </div>
        ) : session?.user ? (
          <>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#010103]/70">
              <User className="size-5 shrink-0" />
              <div className="min-w-0 flex-1 truncate">
                <p className="truncate font-medium text-[#010103]">
                  {session.user.name ?? "Usuario"}
                </p>
                <p className="truncate text-xs text-[#010103]/60">
                  {session.user.email ?? ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#010103]/80 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="size-5 shrink-0" />
              Cerrar sesión
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
