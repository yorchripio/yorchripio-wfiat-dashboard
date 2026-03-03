// proxy.ts (antes middleware.ts)
// Protege rutas usando JWT de NextAuth. Next.js 16+ usa "proxy" en lugar de "middleware".

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname ?? "";

  if (path === "/login") return NextResponse.next();
  if (path.startsWith("/api/auth")) return NextResponse.next();

  const token = await getToken({
    req: request,
    secret:
      process.env.AUTH_SECRET ||
      (process.env.NODE_ENV === "development"
        ? "wfiat-dev-secret-cambiar-en-produccion"
        : undefined),
  });

  if (token) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", path);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
