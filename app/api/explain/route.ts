import { explain } from '@/lib/core/pipeline';
import { RefusalError } from '@/lib/core/llm/client';
import { ResolutionError } from '@/lib/core/packs/history/gather';
import type { Explainer, StreamEvent } from '@/lib/core/types';
import { lookupByQid, lookupByQuery } from '@/lib/server/cache';
import { checkQuery, checkSpend } from '@/lib/server/guard';

/** Node, not Edge: the verifier is CPU work and the corpus is large. */
export const runtime = 'nodejs';
/** Two Opus calls over a 30k-token corpus; the default 15s is far too short. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 10_000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  // Without no-transform the CDN buffers the whole stream and the progressive
  // rendering this design depends on silently stops working.
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const skipCache = url.searchParams.get('fresh') === '1';

  const queryCheck = checkQuery(query);
  if (!queryCheck.ok) return errorStream(queryCheck.message, queryCheck.code);

  // Alias hit: answered without resolving, fetching or spending anything.
  if (!skipCache) {
    const hit = await lookupByQuery(query);
    if (hit) return singleEventStream({ type: 'done', explainer: hit });
  }

  const spendCheck = checkSpend(request);
  if (!spendCheck.ok) return errorStream(spendCheck.message, spendCheck.code);

  return streamPipeline(query, skipCache, request.signal);
}

function streamPipeline(query: string, skipCache: boolean, signal: AbortSignal): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: StreamEvent | string) => {
        if (!open) return;
        const payload =
          typeof event === 'string' ? `${event}\n\n` : `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          open = false;
        }
      };

      // Proxies drop an idle connection well inside the time these calls take.
      const heartbeat = setInterval(() => send(': ping'), HEARTBEAT_MS);

      try {
        for await (const event of explain(query, {
          signal,
          lookupCached: skipCache ? undefined : (entity) => lookupByQid(entity.qid),
        })) {
          send(event);
        }
      } catch (error) {
        send({ type: 'error', ...describe(error) });
      } finally {
        clearInterval(heartbeat);
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by the client disconnecting */
        }
      }
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
}

function describe(error: unknown): { message: string; code?: string } {
  if (error instanceof ResolutionError) return { message: error.message, code: error.code };
  if (error instanceof RefusalError) return { message: error.message, code: 'refusal' };
  if (error instanceof Error && error.name === 'AbortError') {
    return { message: 'Cancelled.', code: 'aborted' };
  }
  console.error('[explain] pipeline failed', error);
  return {
    message: 'Something went wrong while researching this subject. Please try again.',
    code: 'internal',
  };
}

/** Errors travel as SSE too, so the client has exactly one code path. */
function errorStream(message: string, code: string): Response {
  return singleEventStream({ type: 'error', message, code });
}

function singleEventStream(event: StreamEvent | { type: 'done'; explainer: Explainer }): Response {
  return new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: SSE_HEADERS });
}
