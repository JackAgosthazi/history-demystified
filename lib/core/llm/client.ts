import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude Opus 5. Overridable so the pre-warm script or a cost-constrained
 * deployment can drop to a cheaper model without a code change.
 */
export const MODEL = process.env.EXPLAINER_MODEL ?? 'claude-opus-5';

/**
 * Refusal fallbacks.
 *
 * History runs straight through Claude's safety surface — genocides,
 * massacres, atrocities and terrorism are all legitimate subjects for a
 * teaching tool. A refusal on one of those would be a bad failure, so the
 * server routes by refusal category instead.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  cached ??= new Anthropic({ maxRetries: 2 });
  return cached;
}

export class RefusalError extends Error {
  constructor(readonly category: string | null | undefined) {
    super(
      'Claude declined to answer this request' +
        (category ? ` (${category}).` : '.') +
        ' Try rephrasing, or pick one of the example topics.',
    );
    this.name = 'RefusalError';
  }
}

/* ------------------------------------------------------------------ *
 * Cost accounting
 * ------------------------------------------------------------------ */

/** Claude Opus 5, USD per million tokens. */
const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export interface UsageTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  usd: number;
}

export const EMPTY_USAGE: UsageTotals = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  usd: 0,
};

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function accumulate(totals: UsageTotals, usage: RawUsage | undefined, model = MODEL): UsageTotals {
  if (!usage) return totals;
  const rate = PRICING[model] ?? PRICING['claude-opus-5'];
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  return {
    input: totals.input + input,
    output: totals.output + output,
    cacheWrite: totals.cacheWrite + cacheWrite,
    cacheRead: totals.cacheRead + cacheRead,
    usd:
      totals.usd +
      (input * rate.input +
        output * rate.output +
        cacheWrite * rate.cacheWrite +
        cacheRead * rate.cacheRead) /
        1_000_000,
  };
}
