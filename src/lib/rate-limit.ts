/**
 * Minimal in-process rate limiter. Fine for a single-instance deployment;
 * swap the store for Upstash/Redis or Cloudflare's native rate limiting
 * when this moves to a multi-instance / edge deployment.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120);

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count };
}

export function rateLimitKeyFromRequest(req: Request, userId?: string): string {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  return userId ? `user:${userId}` : `ip:${ip}`;
}
