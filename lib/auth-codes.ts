// lib/auth-codes.ts
// In-memory verification code store for email login

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const codes = new Map<string, CodeEntry>();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeCode(email: string, code: string): void {
  codes.set(email.toLowerCase(), {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });
}

export function verifyCode(
  email: string,
  code: string
): { valid: boolean; error?: string } {
  const key = email.toLowerCase();
  const entry = codes.get(key);

  if (!entry) {
    return { valid: false, error: "No se envió ningún código a este email." };
  }

  if (Date.now() > entry.expiresAt) {
    codes.delete(key);
    return { valid: false, error: "El código expiró. Solicitá uno nuevo." };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    codes.delete(key);
    return {
      valid: false,
      error: "Demasiados intentos. Solicitá un nuevo código.",
    };
  }

  entry.attempts++;

  if (entry.code !== code) {
    return { valid: false, error: "Código incorrecto." };
  }

  codes.delete(key);
  return { valid: true };
}

// Cleanup expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of codes) {
    if (now > entry.expiresAt) codes.delete(key);
  }
}, 5 * 60 * 1000);
