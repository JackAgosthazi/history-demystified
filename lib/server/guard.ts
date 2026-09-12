import { createHash } from 'node:crypto';

/**
 * Spend guards.
 *
 * The deployed demo runs on a personal API key, so the endpoint has to be
 * unattractive to abuse and bounded in cost. None of this is a substitute for
 * the real ceiling, which is a hard spend limit on the Anthropic workspace the
 * key belongs to — these just stop ordinary accidents and casual misuse.
 */

export const MAX_QUERY_LENGTH = 80;
const REQUESTS_PER_WINDOW = 6;
const WINDOW_MS = 60 * 60 * 1000;
const DAILY_LIVE_RUNS = 120;

/**
 * In-process, so it resets on cold start and is per-instance rather than
 * global. Stated plainly in the README rather than dressed up: a real
 * deployment would use durable storage, which this deliberately avoids.
 */
const buckets = new Map<string, number[]>();
let dayStamp = '';
let dayCount = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hashed with a per-deployment salt so no raw IP is ever stored. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim() || 'unknown';
  const salt = process.env.RATE_LIMIT_SALT ?? 'history-demystified';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export function checkQuery(query: string): GuardVerdict {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, status: 400, code: 'empty_query', message: 'Enter a historical subject.' };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: 'query_too_long',
      message: `Keep it under ${MAX_QUERY_LENGTH} characters — this takes a subject, not a question.`,
    };
  }
  return { ok: true };
}

/** Only called once a request is about to spend tokens. */
export function checkSpend(request: Request): GuardVerdict {
  if (process.env.CACHE_ONLY === '1') {
    return {
      ok: false,
      status: 503,
      code: 'cache_only',
      message: 'Live research is paused. The example topics below still work in full.',
    };
  }

  if (dayStamp !== today()) {
    dayStamp = today();
    dayCount = 0;
  }
  if (dayCount >= DAILY_LIVE_RUNS) {
    return {
      ok: false,
      status: 429,
      code: 'daily_cap',
      message: 'This demo has hit its daily budget. The example topics below still work in full.',
    };
  }

  const key = clientKey(request);
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= REQUESTS_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      code: 'rate_limited',
      message: `That is ${REQUESTS_PER_WINDOW} live searches in an hour. Try an example topic, or come back later.`,
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  dayCount++;
  return { ok: true };
}
