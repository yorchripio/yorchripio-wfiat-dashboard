// lib/auth.ts
// NextAuth v5 (Auth.js) con Credentials + 2FA, roles ADMIN / VIEWER

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { verify as verifyTOTP, generateSecret, generateURI } from "otplib";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { get2FACookieName, verify2FAToken } from "@/lib/two-factor-token";
import { loginSchema } from "@/lib/validations/auth";

function getCookieFromRequest(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// En desarrollo, si no hay AUTH_SECRET usamos uno por defecto (solo local).
// En producción conviene definir AUTH_SECRET en el entorno.
const authSecret =
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "wfiat-dev-secret-cambiar-en-produccion"
    : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Código 2FA", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || typeof credentials.email !== "string") {
          throw new CredentialsSignin("Credenciales inválidas");
        }

        const email = credentials.email.trim().toLowerCase();
        const code =
          typeof credentials.code === "string" ? credentials.code.trim() : "";
        const password =
          typeof credentials.password === "string" ? credentials.password : "";

        // Flujo 2FA: cookie con token + código
        const cookieName = get2FACookieName();
        const tempToken = getCookieFromRequest(request, cookieName);
        if (tempToken && code) {
          const payload = await verify2FAToken(tempToken);
          if (!payload) throw new CredentialsSignin("Sesión 2FA expirada");
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
          });
          if (!user || !user.isActive || user.email !== email) {
            throw new CredentialsSignin("Credenciales inválidas");
          }
          if (!user.totpEnabled || !user.totpSecret) {
            throw new CredentialsSignin("2FA no configurado");
          }
          const secret = decrypt(user.totpSecret);
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
          // El cliente debe haber llamado primero a check-2fa y mostrar el input de código
          throw new CredentialsSignin("Requiere código 2FA");
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
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
  },
  trustHost: true,
});
