// In-memory login rate limiter (5 fails / 5 min theo IP+username, periodic sweep 60s, cap 10.000 fail-closed).
// ponytail: in-memory Map tối đa 10.000 keys cho single instance (ADR-010); nâng cấp Redis khi scale cluster.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
export const LOGIN_MAX_TRACKED_KEYS = 10_000;
const LOGIN_SWEEP_INTERVAL_MS = 60_000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function sweepExpiredLoginAttempts(now: number = Date.now()): void {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

export function registerLoginAttempt(key: string, now: number = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry) {
    if (attempts.size >= LOGIN_MAX_TRACKED_KEYS) return true;
    attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  if (entry.resetAt <= now) {
    entry.count = 1;
    entry.resetAt = now + LOGIN_WINDOW_MS;
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}

setInterval(() => sweepExpiredLoginAttempts(), LOGIN_SWEEP_INTERVAL_MS).unref();
