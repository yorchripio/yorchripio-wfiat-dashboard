// lib/auth.ts
// NextAuth v5 (Auth.js) con Credentials + 2FA, roles ADMIN / VIEWER

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { verify as verifyTOTP } from "otplib";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { verify2FAToken } from "@/lib/two-factor-token";
import { loginSchema } from "@/lib/validations/auth";

// AUTH_SECRET es obligatorio; en desarrollo usamos fallback si no está.
// Sin secret, Auth.js lanza "There was a problem with the server configuration".
const authSecret =
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "wfiat-dev-secret-cambiar-en-produccion"
    : "");

if (!authSecret) {
  throw new Error(
    "AUTH_SECRET no está definido. En .env.local (local) o en Variables de Entorno (Vercel) agregá: AUTH_SECRET. Generar con: openssl rand -base64 32"
  );
}

// En producción, AUTH_URL debe ser la URL pública para que redirects y cookies funcionen.
const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
if (process.env.NODE_ENV === "production" && authUrl) {
  try {
    const u = new URL(authUrl);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      console.warn(
        "[auth] AUTH_URL/NEXTAUTH_URL apunta a localhost en producción. En Vercel definí AUTH_URL con la URL pública (ej. https://tu-app.vercel.app)."
      );
    }
  } catch {
    console.warn("[auth] AUTH_URL/NEXTAUTH_URL inválido en producción. Usá la URL pública completa (ej. https://tu-app.vercel.app).");
  }
} else if (process.env.NODE_ENV === "production" && !authUrl) {
  console.warn(
    "[auth] En producción no está definido AUTH_URL ni NEXTAUTH_URL. En Vercel → Settings → Environment Variables agregá AUTH_URL con la URL pública (ej. https://tu-app.vercel.app) para que el login y los redirects funcionen."
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Código 2FA", type: "text" },
        twoFactorToken: { label: "2FA Token", type: "text" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || typeof credentials.email !== "string") {
            throw new CredentialsSignin("Credenciales inválidas");
          }

          const email = credentials.email.trim().toLowerCase();
          const code =
            typeof credentials.code === "string" ? credentials.code.trim() : "";
          const password =
            typeof credentials.password === "string" ? credentials.password : "";

          const rawToken = (credentials as { twoFactorToken?: string }).twoFactorToken;
          const tempToken =
            typeof rawToken === "string" && rawToken.trim().length > 0
              ? rawToken.trim()
              : null;

          console.log("[auth] authorize called:", {
            email,
            hasCode: !!code,
            hasPassword: !!password,
            hasTwoFactorToken: !!tempToken,
            tokenLength: tempToken?.length ?? 0,
          });

          if (tempToken && code) {
            const payload = await verify2FAToken(tempToken);
            if (!payload) throw new CredentialsSignin("Sesión 2FA expirada");
            const user = await prisma.user.findUnique({
              where: { id: payload.userId },
            });
            if (!user || !user.isActive || (user.email?.toLowerCase() ?? "") !== email) {
              throw new CredentialsSignin("Credenciales inválidas");
            }
            if (!user.totpEnabled || !user.totpSecret) {
              throw new CredentialsSignin("2FA no configurado");
            }
            let secret: string;
            try {
              secret = decrypt(user.totpSecret);
            } catch (decryptErr) {
              console.error("[auth] decrypt TOTP failed (ENCRYPTION_KEY?):", decryptErr);
              throw new CredentialsSignin(
                "Error de configuración del servidor (2FA). Contacte al administrador."
              );
            }
            const result = await verifyTOTP({ secret, token: code });
            if (!result.valid) throw new CredentialsSignin("Código 2FA incorrecto");
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            };
          }

          // Flujo email + contraseña
          const parsed = loginSchema.safeParse({ email, password });
          if (!parsed.success) {
            throw new CredentialsSignin("Email y contraseña requeridos");
          }
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });
          if (!user || !user.isActive) {
            throw new CredentialsSignin("Credenciales inválidas");
          }
          const validPassword = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash
          );
          if (!validPassword) {
            throw new CredentialsSignin("Credenciales inválidas");
          }
          if (user.totpEnabled) {
            throw new CredentialsSignin("Requiere código 2FA");
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (err) {
          if (err instanceof CredentialsSignin) throw err;
          console.error("[auth] authorize error:", err);
          throw new CredentialsSignin(
            "Error temporal del servidor. Intente más tarde."
          );
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 horas
    updateAge: 8 * 60 * 60, // refrescar si inactivo > 8h
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NODE_ENV !== "production",
  trustHost: true,
});
