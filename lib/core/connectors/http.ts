/** Shared HTTP helpers for the Wikimedia connectors. */

export const USER_AGENT =
  'HistoryDemystified/0.1 (https://github.com/JackAgosthazi/history-demystified; jack.agosthazi@gmail.com)';

export class FetchError extends Error {
  constructor(readonly url: string, readonly status: number, message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

interface GetJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

/**
 * GET JSON with a timeout and bounded retries.
 *
 * Wikimedia is generally reliable but does rate-limit; a single retry on 429
 * and 5xx keeps a whole explainer from failing on one unlucky section fetch.
 */
export async function getJson<T>(url: string, opts: GetJsonOptions = {}): Promise<T> {
  const { signal, timeoutMs = 15_000, retries = 1 } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        signal: combined,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const err = new FetchError(url, res.status, `HTTP ${res.status} for ${url}`);
        if (!retryable || attempt === retries) throw err;
        lastError = err;
      } else {
        return (await res.json()) as T;
      }
    } catch (err) {
      // A caller-initiated abort is final; never burn retries on it.
      if (signal?.aborted) throw err;
      if (attempt === retries) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Rough token estimate. Only used for corpus budgeting, never for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
