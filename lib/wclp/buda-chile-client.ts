// lib/wclp/buda-chile-client.ts
// Cliente para Buda.com API (Chile) — obtener balance CLP.
// Usa HMAC-SHA384 signing (same format as buda-promise library).

import crypto from "crypto";

const BASE_URL = "https://www.buda.com/api/v2";

const BUDA_CL_API_KEY = process.env.BUDA_CL_API_KEY ?? "";
const BUDA_CL_API_SECRET = process.env.BUDA_CL_API_SECRET ?? "";

interface BudaBalanceResponse {
  balance: {
    id: string;
    amount: [string, string]; // ["42896188.34", "CLP"]
    available_amount: [string, string];
    frozen_amount: [string, string];
    pending_withdraw_amount: [string, string];
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
  const message = `${method} ${fullPath} ${nonce}`;
  return crypto.createHmac("sha384", BUDA_CL_API_SECRET).update(message).digest("hex");
}

async function fetchBudaPrivate<T>(path: string): Promise<T> {
  if (!BUDA_CL_API_KEY || !BUDA_CL_API_SECRET) {
    throw new Error("BUDA_CL_API_KEY o BUDA_CL_API_SECRET no configurados");
  }

  const fullPath = `/api/v2${path}`;
  const nonce = generateNonce();
  const signature = sign("GET", fullPath, nonce);

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-SBTC-APIKEY": BUDA_CL_API_KEY,
      "X-SBTC-NONCE": nonce,
      "X-SBTC-SIGNATURE": signature,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    try {
      const err = JSON.parse(body);
      throw new Error(`Buda CL API ${res.status}: ${err.message ?? err.message_code ?? body}`);
    } catch {
      throw new Error(`Buda CL API error ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  return res.json() as Promise<T>;
}

export async function getClpBalance(): Promise<BudaBalance> {
  const data = await fetchBudaPrivate<BudaBalanceResponse>("/balances/clp");
  return {
    currency: data.balance.id,
    amount: parseFloat(data.balance.amount[0]) || 0,
    available: parseFloat(data.balance.available_amount[0]) || 0,
    frozen: parseFloat(data.balance.frozen_amount[0]) || 0,
    pendingWithdrawal: parseFloat(data.balance.pending_withdraw_amount?.[0] ?? "0") || 0,
  };
}
