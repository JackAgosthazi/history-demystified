'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  EntityFacts,
  Explainer,
  ResolvedEntity,
  SourceDoc,
  StreamEvent,
  Survey,
} from '../core/types';
import { pushTrail, readExplainer, writeExplainer } from './store';

export type Stage =
  | 'idle'
  | 'surveying'
  | 'resolving'
  | 'gathering'
  | 'synthesizing'
  | 'verifying'
  | 'done'
  | 'error';

export interface ExplainerState {
  stage: Stage;
  detail?: string;
  entity?: ResolvedEntity;
  facts?: EntityFacts;
  sources: SourceDoc[];
  lead: string;
  prose: string;
  explainer?: Explainer;
  survey?: Survey;
  error?: { message: string; code?: string };
  fromLocalCache: boolean;
}

const INITIAL: ExplainerState = { stage: 'idle', sources: [], lead: '', prose: '', fromLocalCache: false };

/**
 * Consumes the SSE pipeline.
 *
 * Uses fetch with a stream reader rather than EventSource, which reconnects
 * automatically on error — desirable for a notification feed and expensive
 * here, where every reconnect would start a fresh pair of model calls.
 */
export function useExplainer(query: string | null, refresh = false): ExplainerState {
  const [state, setState] = useState<ExplainerState>(INITIAL);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) {
      setState(INITIAL);
      return;
    }

    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ ...INITIAL, stage: 'resolving', detail: query });

    void (async () => {
      if (!refresh) {
        const local = await readExplainer(query);
        if (local && !controller.signal.aborted) {
          setState({
            ...INITIAL,
            stage: 'done',
            entity: local.entity,
            facts: local.facts,
            sources: local.sources,
            lead: local.summary,
            prose: local.summary,
            explainer: local,
            fromLocalCache: true,
          });
          return;
        }
      }

      try {
        const response = await fetch(
          `/api/explain?q=${encodeURIComponent(query)}${refresh ? '&fresh=1' : ''}`,
          { signal: controller.signal, headers: { Accept: 'text/event-stream' } },
        );
        if (!response.body) throw new Error('The server returned an empty response.');

        for await (const event of readEvents(response.body, controller.signal)) {
          applyEvent(setState, event);
          if (event.type === 'done') {
            await writeExplainer(query, event.explainer);
            await pushTrail({ query, title: event.explainer.entity.title });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          stage: 'error',
          error: {
            message:
              error instanceof Error ? error.message : 'The connection dropped. Please try again.',
          },
        }));
      }
    })();

    return () => controller.abort();
  }, [query, refresh]);

  return state;
}

function applyEvent(setState: React.Dispatch<React.SetStateAction<ExplainerState>>, event: StreamEvent) {
  setState((s) => {
    switch (event.type) {
      case 'status':
        return { ...s, stage: event.stage as Stage, detail: event.detail };
      case 'skeleton':
        return {
          ...s,
          entity: event.entity,
          facts: event.facts,
          sources: event.sources,
          lead: event.lead,
        };
      case 'prose':
        return { ...s, prose: s.prose + event.delta };
      case 'survey':
        return { ...s, stage: 'done', survey: event.survey };
      case 'structured':
        return { ...s, explainer: event.explainer };
      case 'done':
        return {
          ...s,
          stage: 'done',
          explainer: event.explainer,
          entity: event.explainer.entity,
          facts: event.explainer.facts,
          sources: event.explainer.sources,
          prose: s.prose || event.explainer.summary,
        };
      case 'error':
        return { ...s, stage: 'error', error: { message: event.message, code: event.code } };
      default:
        return s;
    }
  });
}

/** Minimal SSE frame parser: split on blank lines, keep `data:` payloads. */
async function* readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        if (!data) continue;

        try {
          yield JSON.parse(data) as StreamEvent;
        } catch {
          /* a partial or malformed frame is not worth killing the stream for */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
