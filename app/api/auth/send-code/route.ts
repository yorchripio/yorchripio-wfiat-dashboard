import { NextResponse } from "next/server";
import { Resend } from "resend";
import { generateCode, storeCode } from "@/lib/auth-codes";
import { checkRateLimit } from "@/lib/rate-limit";

const ALLOWED_DOMAIN = "ripio.com";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email requerido." },
        { status: 400 }
      );
    }

    // Check @ripio.com domain
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten emails @ripio.com" },
        { status: 403 }
      );
    }

    // Rate limit: 5 codes per 15 minutes per email
    const rateLimitKey = `send-code:${email}`;
    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        {
          success: false,
          error: "Demasiados intentos. Esperá 15 minutos.",
        },
        { status: 429 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("[send-code] RESEND_API_KEY not configured");
      return NextResponse.json(
        { success: false, error: "Servicio de email no configurado." },
        { status: 500 }
      );
    }

    const code = generateCode();
    storeCode(email, code);

    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "wFIAT Dashboard <onboarding@resend.dev>",
      to: email,
      subject: `Tu código de verificación: ${code}`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #5f6e78;">wFIAT Dashboard</h2>
          <p>Tu código de verificación es:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">Este código expira en 10 minutos.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[send-code]", e);
    return NextResponse.json(
      { success: false, error: "Error al enviar el código." },
      { status: 500 }
    );
  }
}
