// app/api/auth/[...nextauth]/route.ts
// NextAuth v5 route handler. Inyecta cookie 2FA en el body para que authorize la reciba.

import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { get2FACookieName } from "@/lib/two-factor-token";

function getCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

async function POSTWith2FACookie(request: NextRequest): Promise<Response> {
  const url = request.url;
  if (url.includes("/callback/credentials") && request.method === "POST") {
    const cookieHeader = request.headers.get("cookie");
    const cookieName = get2FACookieName();
    const twoFactorToken = getCookieFromHeader(cookieHeader, cookieName);
    if (twoFactorToken) {
      try {
        const contentType = request.headers.get("content-type") ?? "";
        const reqToRead = request.clone();
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const text = await reqToRead.text();
          const params = new URLSearchParams(text);
          params.set("twoFactorToken", twoFactorToken);
          const newRequest = new NextRequest(url, {
            method: "POST",
            headers: request.headers,
            body: params.toString(),
          });
          return handlers.POST(newRequest);
        }
        if (contentType.includes("application/json")) {
          const body = (await reqToRead.json()) as Record<string, unknown>;
          body.twoFactorToken = twoFactorToken;
          const newRequest = new NextRequest(url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(body),
          });
          return handlers.POST(newRequest);
        }
      } catch {
        // Si falla, usar request original (su body no fue consumido)
      }
    }
  }
  return handlers.POST(request);
}

export const { GET } = handlers;
export { POSTWith2FACookie as POST };
