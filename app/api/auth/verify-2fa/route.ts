import { NextResponse } from "next/server";
import { verify as verifyTOTP } from "otplib";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { verify2FAToken } from "@/lib/two-factor-token";
import { checkRateLimit } from "@/lib/rate-limit";
import { verify2FASchema } from "@/lib/validations/auth";

const MAX_2FA_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutos

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = verify2FASchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const { email, code, twoFactorToken: token } = parsed.data;

    const rateLimitKey = `verify-2fa:${email}`;
    if (!checkRateLimit(rateLimitKey, MAX_2FA_ATTEMPTS, WINDOW_MS)) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Esperá 5 minutos." },
        { status: 429 }
      );
    }

    const payload = await verify2FAToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Sesión 2FA expirada. Volvé a iniciar sesión." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (
      !user ||
      !user.isActive ||
      (user.email?.toLowerCase() ?? "") !== email
    ) {
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 }
      );
    }
    if (!user.totpEnabled || !user.totpSecret) {
      return NextResponse.json(
        { success: false, error: "2FA no configurado" },
        { status: 400 }
      );
    }

    let secret: string;
    try {
      secret = decrypt(user.totpSecret);
    } catch {
      console.error("[verify-2fa] decrypt TOTP failed (ENCRYPTION_KEY?)");
      return NextResponse.json(
        { success: false, error: "Error de configuración del servidor" },
        { status: 500 }
      );
    }

    const result = await verifyTOTP({ secret, token: code });
    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: "Código 2FA incorrecto" },
        { status: 401 }
      );
    }

    const { encode } = await import("next-auth/jwt");
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      return NextResponse.json(
        { success: false, error: "Error de configuración del servidor" },
        { status: 500 }
      );
    }

    const isProduction = process.env.NODE_ENV === "production";
    const cookieName = isProduction
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const maxAge = 60 * 60; // 1 hora

    const sessionToken = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sub: user.id,
      },
      secret: authSecret,
      salt: cookieName,
      maxAge,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    return response;
  } catch (e) {
    console.error("[verify-2fa]", e);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
