/**
 * Spend guards.
 *
 * The deployed demo runs on a personal API key, so cost has to be bounded.
 * There is deliberately no per-visitor throttle: reviewers should be able to
 * try as many subjects as they like without hitting a wall. What remains is a
 * ceiling on the whole deployment and a switch to stop live research
 * entirely, and neither is a substitute for the real protection, which is a
 * hard spend limit on the Anthropic workspace the key belongs to.
 */

export const MAX_QUERY_LENGTH = 80;
const DAILY_LIVE_RUNS = 400;

/** In-process, so it resets on cold start and is per-instance, not global. */
let dayStamp = '';
let dayCount = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
export function checkSpend(): GuardVerdict {
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

  dayCount++;
  return { ok: true };
}
