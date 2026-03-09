// lib/auth.ts
// NextAuth v5 (Auth.js) con Credentials + 2FA, roles ADMIN / VIEWER

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";

const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  throw new Error(
    "AUTH_SECRET no está definido. Agregalo en .env.local (local) o en Variables de Entorno (Vercel). Generar con: openssl rand -base64 32"
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  basePath: "/api/auth",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || typeof credentials.email !== "string") {
            throw new CredentialsSignin("Credenciales inválidas");
          }

          const email = credentials.email.trim().toLowerCase();
          const password =
            typeof credentials.password === "string" ? credentials.password : "";

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
    maxAge: 60 * 60, // 1 hora
    updateAge: 30 * 60, // refrescar si inactivo > 30 min
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
  trustHost: true,
});
