// lib/auth.ts
// NextAuth v5 (Auth.js) — email code verification (no passwords)
// Login flow handled by /api/auth/send-code + /api/auth/verify-code

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  throw new Error(
    "AUTH_SECRET no está definido. Agregalo en .env.local (local) o en Variables de Entorno (Railway). Generar con: openssl rand -base64 32"
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  basePath: "/api/auth",
  providers: [
    // Credentials provider kept for session infrastructure.
    // Actual login is done via verify-code endpoint setting JWT cookie directly.
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        if (!credentials?.email || typeof credentials.email !== "string") {
          return null;
        }
        const email = credentials.email.trim().toLowerCase();
        if (!email.endsWith("@ripio.com")) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

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
    maxAge: 60 * 60, // 1 hour
    updateAge: 30 * 60,
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
