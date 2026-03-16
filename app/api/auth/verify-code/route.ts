import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCode } from "@/lib/auth-codes";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();

    if (!email || !code) {
      return NextResponse.json(
        { success: false, error: "Email y código requeridos." },
        { status: 400 }
      );
    }

    if (!email.endsWith("@ripio.com")) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten emails @ripio.com" },
        { status: 403 }
      );
    }

    // Verify the code
    const result = verifyCode(email, code);
    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Auto-create user on first login
      const name = email.split("@")[0];
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: "email-login-no-password",
          name,
          role: "VIEWER",
          isActive: true,
        },
      });
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: "Usuario desactivado." },
        { status: 403 }
      );
    }

    // Create session cookie (same pattern as existing verify-2fa)
    const { encode } = await import("next-auth/jwt");
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      return NextResponse.json(
        { success: false, error: "Error de configuración del servidor." },
        { status: 500 }
      );
    }

    const isProduction = process.env.NODE_ENV === "production";
    const cookieName = isProduction
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const maxAge = 60 * 60; // 1 hour

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
    console.error("[verify-code]", e);
    return NextResponse.json(
      { success: false, error: "Error interno." },
      { status: 500 }
    );
  }
}
