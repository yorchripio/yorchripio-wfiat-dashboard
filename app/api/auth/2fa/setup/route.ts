// app/api/auth/2fa/setup/route.ts
// GET: genera secreto TOTP y devuelve { secret, qrUrl } (para mostrar QR).
// POST: verifica código y activa 2FA guardando el secreto cifrado.

import { NextResponse } from "next/server";
import { generateSecret, generateURI, verify } from "otplib";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const secret = generateSecret();
    const appName = "wFIAT Dashboard";
    const qrUrl = generateURI({
      issuer: appName,
      label: session.user.email ?? session.user.id,
      secret,
    });

    return NextResponse.json({
      success: true,
      data: { secret, qrUrl },
    });
  } catch (e) {
    console.error("[2fa setup GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al generar 2FA" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";

    if (!code || !secret || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: "Código y secreto requeridos (6 dígitos)" },
        { status: 400 }
      );
    }

    const result = await verify({ secret, token: code });
    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: "Código incorrecto" },
        { status: 400 }
      );
    }

    let encryptedSecret: string;
    try {
      encryptedSecret = encrypt(secret);
    } catch (encErr) {
      const msg = encErr instanceof Error ? encErr.message : String(encErr);
      console.error("[2fa setup POST] encrypt failed:", msg);
      if (msg.includes("ENCRYPTION_KEY")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Falta configurar la clave de cifrado. El administrador debe agregar ENCRYPTION_KEY en las variables de entorno (openssl rand -hex 32).",
          },
          { status: 503 }
        );
      }
      throw encErr;
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { totpSecret: encryptedSecret, totpEnabled: true },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[2fa setup POST]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message.includes("ENCRYPTION_KEY")
          ? "Falta configurar ENCRYPTION_KEY. Contactá al administrador."
          : "Error al activar 2FA",
      },
      { status: 500 }
    );
  }
}
