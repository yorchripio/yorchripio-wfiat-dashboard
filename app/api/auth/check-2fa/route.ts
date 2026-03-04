// app/api/auth/check-2fa/route.ts
// Valida email+password y, si el usuario tiene 2FA, setea cookie temporal y devuelve requires2FA.
// El cliente debe entonces mostrar el input de código y llamar a signIn("credentials", { email, code }).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { create2FAToken } from "@/lib/two-factor-token";
import { get2FACookieName } from "@/lib/two-factor-token";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_KEY_PREFIX = "check2fa:";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const key = `${RATE_LIMIT_KEY_PREFIX}${email.toLowerCase()}`;
    if (!checkRateLimit(key, MAX_ATTEMPTS, WINDOW_MS)) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Espera 15 minutos." },
        { status: 429 }
      );
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
    } catch (dbErr) {
      console.error("[check-2fa] DB error:", dbErr);
      return NextResponse.json(
        { success: false, error: "Servicio no disponible. Intente más tarde." },
        { status: 503 }
      );
    }
    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const validPassword = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash
    );
    if (!validPassword) {
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (!user.totpEnabled) {
      // Sin 2FA: el cliente puede llamar directamente a signIn("credentials", { email, password })
      return NextResponse.json({
        success: true,
        requires2FA: false,
      });
    }

    let tempToken: string;
    try {
      tempToken = await create2FAToken(user.id);
    } catch (tokenError) {
      const msg = tokenError instanceof Error ? tokenError.message : "";
      if (msg.includes("AUTH_SECRET")) {
        console.error("[check-2fa] AUTH_SECRET no configurado en el servidor (Vercel → Settings → Environment Variables).");
        return NextResponse.json(
          {
            success: false,
            error: "Configuración del servidor: falta AUTH_SECRET. Definilo en Vercel → proyecto → Settings → Environment Variables.",
          },
          { status: 503 }
        );
      }
      throw tokenError;
    }
    const cookieName = get2FACookieName();
    const response = NextResponse.json({
      success: true,
      requires2FA: true,
    });
    response.cookies.set(cookieName, tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60, // 5 min
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("[check-2fa]", e);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
