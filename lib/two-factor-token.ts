// lib/two-factor-token.ts
// JWT temporal para el flujo 2FA (cookie). Expira en 5 minutos.

import * as jose from "jose";

const COOKIE_NAME = "wfiat_2fa_token";
const EXPIRES_IN = "5m";

export function get2FACookieName(): string {
  return COOKIE_NAME;
}

export async function create2FAToken(userId: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  const key = new TextEncoder().encode(secret);
  return await new jose.SignJWT({ sub: userId, purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(EXPIRES_IN)
    .sign(key);
}

export async function verify2FAToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key);
    if (payload.purpose !== "2fa" || typeof payload.sub !== "string")
      return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
