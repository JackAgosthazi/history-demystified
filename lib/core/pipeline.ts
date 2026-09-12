import type {
  Claim,
  ResolvedEntity,
  Comparison,
  ContextLink,
  ContextRelation,
  EntityRef,
  Explainer,
  StreamEvent,
} from './types';
import { MODEL } from './llm/client';
import { runStructured, streamProse } from './llm/calls';
import { parseProse, renderCorpus } from './llm/prompts';
import type { StructuredOutput } from './llm/schema';
import { gather, resolve, validateEntityNames } from './packs/history/gather';
import { verifyClaims, type RawClaim } from './verify';

export interface ExplainOptions {
  signal?: AbortSignal;
  /**
   * Consulted once the subject is known but before any tokens are spent.
   * Injected rather than imported so lib/core keeps no filesystem dependency.
   */
  lookupCached?: (entity: ResolvedEntity) => Promise<Explainer | null>;
}

/**
 * The whole pipeline, as a stream of events.
 *
 * Everything the browser needs arrives in stages rather than at the end,
 * because the honest total is twenty to forty seconds. The first stage costs
 * no model tokens at all — a resolved entity, a Wikidata timeline and the
 * lead paragraph are already a useful page, and they land in about a second.
 */
export async function* explain(
  query: string,
  { signal, lookupCached }: ExplainOptions = {},
): AsyncGenerator<StreamEvent, Explainer | null> {
  yield { type: 'status', stage: 'resolving', detail: query };
  const ctx = await resolve(query, signal);
  const { entity } = ctx;

  // A cache hit here saves the entire model spend, and is why a drill-down
  // into a pre-warmed subject returns instantly.
  const cached = await lookupCached?.(entity);
  if (cached) {
    yield { type: 'done', explainer: cached };
    return cached;
  }

  yield { type: 'status', stage: 'gathering', detail: entity.title };
  const { sources, facts, lead } = await gather(ctx, signal);

  yield { type: 'skeleton', entity, facts, sources, lead };
  yield {
    type: 'status',
    stage: 'synthesizing',
    detail: `${sources.length} sources`,
  };

  const corpus = renderCorpus(sources);

  // Both calls start now; prose deltas stream out while the structured call
  // is still running.
  const structuredPromise = runStructured(entity, corpus, signal);
  // Without this, a structured failure arriving before the prose loop ends
  // surfaces as an unhandled rejection rather than as our error event.
  structuredPromise.catch(() => undefined);

  let proseText = '';
  const proseStream = streamProse(entity, corpus, signal);
  while (true) {
    const next = await proseStream.next();
    if (next.done) {
      proseText = next.value;
      break;
    }
    yield { type: 'prose', delta: next.value };
  }

  const structured = await structuredPromise;

  yield { type: 'status', stage: 'verifying' };

  const { claims, coverage } = verifyClaims(collectClaims(structured), sources);
  const byId = new Map(claims.map((c) => [c.id, c]));

  const takeaways = structured.takeaways
    .map((_, i) => byId.get(`t${i}`))
    .filter((c): c is Claim => c !== undefined);

  const perspectives = structured.perspectives
    .map((p, i) => {
      const evidence = byId.get(`p${i}`);
      return evidence ? { label: p.label, stance: p.stance, body: p.body, evidence } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const { comparisons, context, drilldown } = await resolveReferences(structured, facts, signal);
  const { summary, whyItMatters } = parseProse(proseText);

  const explainer: Explainer = {
    version: 1,
    query,
    entity,
    facts,
    sources,
    summary,
    whyItMatters,
    takeaways,
    perspectives,
    claims,
    comparisons,
    context,
    glossary: structured.glossary,
    drilldown,
    coverage,
    generatedAt: new Date().toISOString(),
    model: MODEL,
  };

  yield { type: 'done', explainer };
  return explainer;
}

/** Flatten every citeable assertion into one list for the verifier. */
function collectClaims(structured: StructuredOutput): RawClaim[] {
  const toRaw = (id: string, c: StructuredOutput['takeaways'][number]): RawClaim => ({
    id,
    text: c.text,
    sourceId: c.sourceId,
    quote: c.quote,
    ...(c.quoteTranslation ? { quoteTranslation: c.quoteTranslation } : {}),
  });

  return [
    ...structured.takeaways.map((c, i) => toRaw(`t${i}`, c)),
    ...structured.perspectives.map((p, i) => toRaw(`p${i}`, p.evidence)),
  ];
}

/** Wikidata properties that already express a context relation. */
const GRAPH_RELATIONS: Record<string, ContextRelation> = {
  P155: 'precedes',
  P156: 'follows',
  P361: 'partOf',
  P527: 'hasPart',
  P828: 'causedBy',
  P1542: 'causes',
  P1344: 'participantIn',
  P607: 'partOf',
};

/**
 * Turn every model-proposed entity name into a real article, or drop it.
 *
 * This is the second half of the no-invented-links rule: the schema stops the
 * model emitting a URL, and this stops a plausible-sounding name that has no
 * article behind it from reaching the page as a dead end.
 */
async function resolveReferences(
  structured: StructuredOutput,
  facts: Explainer['facts'],
  signal?: AbortSignal,
): Promise<{ comparisons: Comparison[]; context: ContextLink[]; drilldown: EntityRef[] }> {
  const names = [
    ...structured.comparisons.map((c) => c.entityName),
    ...structured.context.map((c) => c.entityName),
    ...structured.drilldown.map((d) => d.entityName),
  ];
  const resolved = await validateEntityNames(names, signal);

  const comparisons: Comparison[] = [];
  for (const c of structured.comparisons) {
    const entity = resolved.get(c.entityName.trim());
    if (!entity) continue;
    comparisons.push({
      entity,
      angle: c.angle,
      similarities: c.similarities,
      differences: c.differences,
    });
  }

  // Graph edges first — they are facts, not suggestions — then any model
  // links that add something the graph did not already have.
  const context: ContextLink[] = [];
  const seen = new Set<string>();
  for (const [prop, relation] of Object.entries(GRAPH_RELATIONS)) {
    for (const node of facts.relations[prop] ?? []) {
      if (!node.url || seen.has(node.qid)) continue;
      seen.add(node.qid);
      context.push({
        entity: { title: node.label, url: node.url, lang: 'en', qid: node.qid, description: node.description },
        relation,
        note: node.description ?? '',
        fromGraph: true,
      });
    }
  }
  for (const c of structured.context) {
    const entity = resolved.get(c.entityName.trim());
    if (!entity || (entity.qid && seen.has(entity.qid))) continue;
    if (entity.qid) seen.add(entity.qid);
    context.push({ entity, relation: c.relation, note: c.note, fromGraph: false });
  }

  const drilldownSeen = new Set<string>();
  const drilldown: EntityRef[] = [];
  for (const d of structured.drilldown) {
    const entity = resolved.get(d.entityName.trim());
    if (!entity || drilldownSeen.has(entity.title)) continue;
    drilldownSeen.add(entity.title);
    drilldown.push({ ...entity, description: d.why });
  }

  return { comparisons, context, drilldown };
}
