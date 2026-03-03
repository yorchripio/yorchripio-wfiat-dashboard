// lib/rate-limit.ts
// In-memory rate limiting for auth endpoints. Para producción considerar Redis/Upstash.

const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const record = store.get(key);
  if (!record || now > record.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxAttempts) {
    return false;
  }
  record.count++;
  return true;
}

export function getRemainingAttempts(
  key: string,
  maxAttempts: number
): number {
  const record = store.get(key);
  if (!record || Date.now() > record.resetAt) return maxAttempts;
  return Math.max(0, maxAttempts - record.count);
}
