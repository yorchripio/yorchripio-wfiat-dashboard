// lib/wpen/buda-client.ts
// Cliente para Buda.com API — obtener balance PEN.
// Usa HMAC-SHA384 signing (same format as buda-promise library).

import crypto from "crypto";

const BASE_URL = "https://www.buda.com/api/v2";

const BUDA_API_KEY = process.env.BUDA_API_KEY ?? "";
const BUDA_API_SECRET = process.env.BUDA_API_SECRET ?? "";

interface BudaBalanceResponse {
  balance: {
    id: string;
    amount: [string, string]; // ["11.5274815", "PEN"]
    available_amount: [string, string];
    frozen_amount: [string, string];
    pending_withdrawal_amount: [string, string];
  };
}

export interface BudaBalance {
  currency: string;
  amount: number;
  available: number;
  frozen: number;
  pendingWithdrawal: number;
}

// Nonce generator — same logic as buda-promise: Date.now() + padded increment
let lastNonceTime = 0;
let nonceIncr = -1;

function generateNonce(): string {
  const now = Date.now();
  if (now !== lastNonceTime) nonceIncr = -1;
  lastNonceTime = now;
  nonceIncr++;
  const padding = nonceIncr < 10 ? "000" : nonceIncr < 100 ? "00" : nonceIncr < 1000 ? "0" : "";
  return String(now) + padding + nonceIncr;
}

function sign(method: string, fullPath: string, nonce: string): string {
  // Format: "{METHOD} {fullPath} {nonce}" (no body for GET)
  // fullPath includes /api/v2 prefix
  const message = `${method} ${fullPath} ${nonce}`;
  return crypto.createHmac("sha384", BUDA_API_SECRET).update(message).digest("hex");
}

async function fetchBudaPrivate<T>(path: string): Promise<T> {
  if (!BUDA_API_KEY || !BUDA_API_SECRET) {
    throw new Error("BUDA_API_KEY o BUDA_API_SECRET no configurados");
  }

  const fullPath = `/api/v2${path}`;
  const nonce = generateNonce();
  const signature = sign("GET", fullPath, nonce);

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-SBTC-APIKEY": BUDA_API_KEY,
      "X-SBTC-NONCE": nonce,
      "X-SBTC-SIGNATURE": signature,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Parse error details if possible
    try {
      const err = JSON.parse(body);
      throw new Error(`Buda API ${res.status}: ${err.message ?? err.message_code ?? body}`);
    } catch {
      throw new Error(`Buda API error ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  return res.json() as Promise<T>;
}

export async function getPenBalance(): Promise<BudaBalance> {
  const data = await fetchBudaPrivate<BudaBalanceResponse>("/balances/pen");
  return {
    currency: data.balance.id,
    amount: parseFloat(data.balance.amount[0]) || 0,
    available: parseFloat(data.balance.available_amount[0]) || 0,
    frozen: parseFloat(data.balance.frozen_amount[0]) || 0,
    pendingWithdrawal: parseFloat(data.balance.pending_withdrawal_amount[0]) || 0,
  };
}
