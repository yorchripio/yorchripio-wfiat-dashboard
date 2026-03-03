// app/api/auth/register/route.ts
// Crear usuario (solo ADMIN). Body: { email, password, name, role?: "ADMIN" | "VIEWER" }

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { registerSchema } from "@/lib/validations/auth";
import { hasMinRole } from "@/lib/auth-helpers";

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo un ADMIN puede crear usuarios" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: first?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;
    const emailLower = email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe un usuario con ese email" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newRole = (body.role === "ADMIN" ? "ADMIN" : "VIEWER") as
      | "ADMIN"
      | "VIEWER";

    await prisma.user.create({
      data: {
        email: emailLower,
        passwordHash,
        name: name.trim(),
        role: newRole,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json(
      { success: false, error: "Error al crear usuario" },
      { status: 500 }
    );
  }
}
