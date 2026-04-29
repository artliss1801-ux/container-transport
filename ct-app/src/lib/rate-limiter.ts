const attempts = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
         request.headers.get("x-real-ip") || "unknown";
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 900000 });
  } else {
    record.count++;
  }
}

export function resetAttempts(key: string): void {
  attempts.delete(key);
}

export function isRateLimited(key: string, maxAttempts: number = 5, windowMs: number = 900000): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) return false;
  return record.count >= maxAttempts;
}

