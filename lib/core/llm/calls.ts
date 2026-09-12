import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ResolvedEntity } from '../types';
import { EMPTY_USAGE, FALLBACK_BETA, MODEL, RefusalError, accumulate, getClient, type UsageTotals } from './client';
import {
  PROSE_SYSTEM,
  STRUCTURED_SYSTEM,
  proseUserMessage,
  structuredUserMessage,
} from './prompts';
import { StructuredOutputSchema, type StructuredOutput } from './schema';

/**
 * Both calls run against the same corpus at the same time.
 *
 * They are independent, so running them in parallel roughly halves
 * time-to-complete. It forgoes the cache discount the second call would get
 * from the first's prefix, but at this corpus size that is a few cents
 * against twenty-odd seconds of a person waiting.
 */

const PROSE_MAX_TOKENS = 8_000;
const STRUCTURED_MAX_TOKENS = 16_000;
const EFFORT = 'medium' as const;

function assertNotRefused(message: { stop_reason?: string | null; stop_details?: unknown }): void {
  if (message.stop_reason === 'refusal') {
    const details = message.stop_details as { category?: string | null } | null | undefined;
    throw new RefusalError(details?.category);
  }
}

/**
 * Call A. Yields text deltas as they arrive and returns the complete text,
 * so the route can forward tokens to the browser while they generate.
 */
export interface ProseResult {
  text: string;
  usage: UsageTotals;
}

export async function* streamProse(
  entity: ResolvedEntity,
  corpus: string,
  signal?: AbortSignal,
): AsyncGenerator<string, ProseResult> {
  const stream = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: PROSE_MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: [{ type: 'text', text: PROSE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: proseUserMessage(entity, corpus) }],
    },
    { signal },
  );

  let full = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      full += event.delta.text;
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  assertNotRefused(final);
  return { text: full, usage: accumulate(EMPTY_USAGE, final.usage) };
}

/** Call B. Returns the typed breakdown, or throws if the model refused. */
export interface StructuredResult {
  output: StructuredOutput;
  usage: UsageTotals;
}

export async function runStructured(
  entity: ResolvedEntity,
  corpus: string,
  signal?: AbortSignal,
): Promise<StructuredResult> {
  const message = await getClient().beta.messages.parse(
    {
      model: MODEL,
      max_tokens: STRUCTURED_MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: EFFORT,
        format: zodOutputFormat(StructuredOutputSchema),
      },
      system: [{ type: 'text', text: STRUCTURED_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: structuredUserMessage(entity, corpus) }],
    },
    { signal },
  );

  assertNotRefused(message);
  const usage = accumulate(EMPTY_USAGE, message.usage);

  if (message.parsed_output) return { output: message.parsed_output, usage };

  // The schema is enforced server-side, so this is close to unreachable, but
  // falling back to a manual parse beats losing a whole run to a null.
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  return { output: StructuredOutputSchema.parse(JSON.parse(text)), usage };
}
