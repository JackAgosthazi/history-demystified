/**
 * Does prompt caching actually engage on our system blocks?
 *
 * Two identical calls back to back. The first should report
 * cache_creation_input_tokens, the second cache_read_input_tokens. If both
 * are zero the prefix is below the model's minimum cacheable length and the
 * cache_control marker is being silently ignored.
 */
import Anthropic from '@anthropic-ai/sdk';
import { PROSE_SYSTEM, STRUCTURED_SYSTEM } from '../../lib/core/llm/prompts';
import { FALLBACK_BETA, MODEL } from '../../lib/core/llm/client';

const client = new Anthropic();

async function measure(label: string, system: string) {
  console.log(`\n=== ${label} ===`);

  const counted = await client.messages.countTokens({
    model: MODEL,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: 'ok' }],
  });
  console.log(`system block: ~${counted.input_tokens} tokens`);

  for (const attempt of [1, 2]) {
    const { data: response, response: http } = await client.beta.messages
      .create({
      model: MODEL,
      max_tokens: 16,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      })
      .withResponse();
    const u = response.usage;
    console.log(
      `  call ${attempt}: input ${u.input_tokens}` +
        ` · cache_write ${u.cache_creation_input_tokens ?? 0}` +
        ` · cache_read ${u.cache_read_input_tokens ?? 0}` +
        `\n           request-id ${http.headers.get('request-id') ?? 'n/a'}`,
    );
  }
}

async function main() {
  console.log(`model ${MODEL} · ${new Date().toISOString()}`);
  await measure('PROSE_SYSTEM', PROSE_SYSTEM);
  await measure('STRUCTURED_SYSTEM', STRUCTURED_SYSTEM);
  console.log(
    '\nA cache_read of 0 on the second call means the prefix is under the model minimum.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
