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
