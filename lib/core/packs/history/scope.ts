import type { GraphDate, Survey, SurveyItem } from '../../types';
import { qidFromUri, runSparql } from '../../connectors/sparql';
import { searchPages } from '../../connectors/wikipedia';
import { fetchEntities, fetchEntitiesByTitles, statementDate, toNode } from '../../connectors/wikidata';

/**
 * Scope queries: a place and a stretch of time rather than one subject.
 *
 * "Japan 1600" is not a request for an article, it is a request for a way in
 * — what was happening there then, and who was alive to make it happen. That
 * is a graph question, so it is answered entirely from Wikidata: no model
 * call, no cost, and nothing that could be invented. Every result is a door
 * into a full explainer.
 */

export interface ScopeQuery {
  place: string;
  from: number;
  to: number;
  /** How the range was written, for display: "1600", "1500–1600", "16th century". */
  rendered: string;
}

/** A bare year is read as the decade either side of it. */
const SINGLE_YEAR_WINDOW = 10;
const MIN_YEAR = 500;
const MAX_YEAR = new Date().getFullYear();
const RESULTS_PER_LIST = 12;

/**
 * Recognise a scope query, or return null so the caller falls back to normal
 * subject resolution. Deliberately conservative: "1984" is a novel and
 * "Fahrenheit 451" is not a temperature, so a place is always required.
 */
export function parseScope(query: string): ScopeQuery | null {
  const text = query.trim();

  const century = /\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/i.exec(text);
  const range = /\b(\d{3,4})\s*(?:-|–|—|to)\s*(\d{3,4})\b/.exec(text);
  const decade = /\b(\d{3,4})s\b/.exec(text);
  const single = /\b(\d{3,4})\b/.exec(text);

  let from: number;
  let to: number;
  let matched: string;
  let rendered: string;

  if (century) {
    const n = parseInt(century[1], 10);
    from = (n - 1) * 100 + 1;
    to = n * 100;
    matched = century[0];
    rendered = `the ${century[1]}${ordinalSuffix(n)} century`;
  } else if (range) {
    from = parseInt(range[1], 10);
    to = parseInt(range[2], 10);
    matched = range[0];
    rendered = `${from}–${to}`;
  } else if (decade) {
    from = parseInt(decade[1], 10);
    to = from + 9;
    matched = decade[0];
    rendered = `the ${decade[1]}s`;
  } else if (single) {
    const year = parseInt(single[1], 10);
    from = year - SINGLE_YEAR_WINDOW;
    to = year + SINGLE_YEAR_WINDOW;
    matched = single[0];
    rendered = `around ${year}`;
  } else {
    return null;
  }

  if (from > to || from < MIN_YEAR || to > MAX_YEAR) return null;

  const place = text
    .replace(matched, ' ')
    .replace(/\b(in|during|around|circa|c\.?|the|of|era|period)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Without a place the query is either the whole world or, more often, a
  // title that merely contains a number.
  if (place.length < 3) return null;

  return { place, from, to, rendered };
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

/**
 * Anchoring on a small set of classes is what keeps this fast. Starting from
 * the country or the date makes the planner scan far too much and the service
 * answers 502.
 */
const EVENT_CLASSES = [
  'Q178561', 'Q198', 'Q180684', 'Q131569', 'Q3839081', 'Q124490',
  'Q13418847', 'Q1190554', 'Q10931', 'Q11514315', 'Q6428674', 'Q3024240',
  'Q40231', 'Q3882219', 'Q625298',
];

function eventsQuery(placeQid: string, from: number, to: number): string {
  const values = EVENT_CLASSES.map((q) => `wd:${q}`).join(' ');
  return `SELECT DISTINCT ?item ?date ?sitelinks WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class ; wdt:P17 wd:${placeQid} ; wikibase:sitelinks ?sitelinks .
  { ?item wdt:P585 ?date } UNION { ?item wdt:P580 ?date }
  FILTER(YEAR(?date) >= ${from} && YEAR(?date) <= ${to})
} ORDER BY DESC(?sitelinks) LIMIT 40`;
}

function peopleQuery(placeQid: string, from: number, to: number): string {
  return `SELECT DISTINCT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:Q5 ; wdt:P27 wd:${placeQid} ; wdt:P569 ?birth ; wdt:P570 ?death ;
        wikibase:sitelinks ?sitelinks .
  FILTER(YEAR(?birth) <= ${to} && YEAR(?death) >= ${from})
} ORDER BY DESC(?sitelinks) LIMIT 40`;
}

/* ------------------------------------------------------------------ *
 * Survey
 * ------------------------------------------------------------------ */

export async function surveyScope(
  query: string,
  scope: ScopeQuery,
  signal?: AbortSignal,
): Promise<Survey | null> {
  const [hit] = await searchPages(scope.place, { limit: 1, signal }).catch(() => []);
  if (!hit) return null;

  const byTitle = await fetchEntitiesByTitles([hit.title], { props: 'labels|sitelinks', signal });
  const placeEntity = byTitle.get(hit.title);
  if (!placeEntity) return null;
  const placeQid = placeEntity.id;

  // Sequential, not parallel. The query service throttles concurrent queries
  // from one client, and firing both at once silently lost the second — the
  // people list came back empty while the same query worked on its own.
  const eventRows = await runSparql(eventsQuery(placeQid, scope.from, scope.to), signal).catch(
    () => [],
  );
  const peopleRows = await runSparql(peopleQuery(placeQid, scope.from, scope.to), signal).catch(
    () => [],
  );

  // A place that yields nothing is usually a mis-resolution ("Japan" is fine,
  // "Japanese cuisine" is not), so the caller falls back to a normal search.
  if (eventRows.length === 0 && peopleRows.length === 0) return null;

  const [events, people] = await Promise.all([
    hydrate(eventRows, signal),
    hydrate(peopleRows, signal),
  ]);

  return {
    query,
    place: {
      qid: placeQid,
      label: placeEntity.labels?.en?.value ?? hit.title,
      title: hit.title,
      url: hit.url,
    },
    from: scope.from,
    to: scope.to,
    rendered: scope.rendered,
    events: events.slice(0, RESULTS_PER_LIST),
    people: people.slice(0, RESULTS_PER_LIST),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * SPARQL returns identifiers; everything readable comes from a second batch
 * call. That is not a detour — the label service is unreliable under ORDER BY
 * (it returned a bare "Q193344" for Miyamoto Musashi), and only this call
 * yields the English Wikipedia title each result needs to be a working link.
 */
async function hydrate(
  rows: Array<Record<string, string>>,
  signal?: AbortSignal,
): Promise<SurveyItem[]> {
  const ranked = new Map<string, number>();
  for (const row of rows) {
    const qid = qidFromUri(row.item ?? '');
    if (!qid) continue;
    const sitelinks = Number(row.sitelinks ?? 0);
    ranked.set(qid, Math.max(ranked.get(qid) ?? 0, sitelinks));
  }
  if (ranked.size === 0) return [];

  const entities = await fetchEntities([...ranked.keys()], { signal }).catch(
    () => new Map<string, never>(),
  );

  const items: SurveyItem[] = [];
  for (const [qid, sitelinks] of ranked) {
    const entity = entities.get(qid);
    // No English article means no explainer to drill into, so it is not shown.
    if (!entity?.sitelinks?.enwiki?.title) continue;
    const node = toNode(qid, entity);
    const start: GraphDate | undefined =
      statementDate(entity, 'P569') ?? statementDate(entity, 'P585') ?? statementDate(entity, 'P580');
    const end = statementDate(entity, 'P570') ?? statementDate(entity, 'P582');

    items.push({
      qid,
      title: entity.sitelinks.enwiki.title,
      label: node.label,
      description: node.description,
      sitelinks,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    });
  }

  return items.sort((a, b) => b.sitelinks - a.sitelinks);
}
