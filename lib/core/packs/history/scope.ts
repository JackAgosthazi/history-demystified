import type { GraphDate, Survey, SurveyItem } from '../../types';
import { qidFromUri, runSparql } from '../../connectors/sparql';
import { searchPages } from '../../connectors/wikipedia';
import {
  fetchEntities,
  fetchEntitiesByTitles,
  statementDate,
  statementQids,
  toNode,
  type WdEntity,
} from '../../connectors/wikidata';

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

const ROMAN_VALUES: Record<string, number> = {
  i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
};

function toRoman(value: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remaining = value;
  let out = '';
  for (const [amount, numeral] of table) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/**
 * Parse a Roman numeral, strictly.
 *
 * Centuries are written "XV century" at least as often as "15th century",
 * particularly by anyone educated outside the anglophone world, and the query
 * simply fell through to an ordinary search before.
 *
 * The round-trip check is what makes this safe to run over free text: it
 * rejects "IIII" and "IL", which are not numerals, so an arbitrary run of
 * letters cannot be read as a number just because those letters happen to be
 * Roman digits.
 */
export function parseRomanNumeral(input: string): number | null {
  const lower = input.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(lower)) return null;

  let total = 0;
  for (let i = 0; i < lower.length; i++) {
    const value = ROMAN_VALUES[lower[i]];
    const next = ROMAN_VALUES[lower[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }

  return total > 0 && toRoman(total) === lower.toUpperCase() ? total : null;
}

/**
 * Recognise a scope query, or return null so the caller falls back to normal
 * subject resolution. Deliberately conservative: "1984" is a novel and
 * "Fahrenheit 451" is not a temperature, so a place is always required.
 */
export function parseScope(query: string): ScopeQuery | null {
  const text = query.trim();

  const century = /\b(\d{1,2})(?:st|nd|rd|th)?\s+century\b/i.exec(text);
  const romanCentury = /\b([ivxlcdm]+)(?:st|nd|rd|th)?\s+century\b/i.exec(text);
  const romanValue = romanCentury ? parseRomanNumeral(romanCentury[1]) : null;
  const range = /\b(\d{3,4})\s*(?:-|–|—|to)\s*(\d{3,4})\b/.exec(text);
  const decade = /\b(\d{3,4})s\b/.exec(text);
  const single = /\b(\d{3,4})\b/.exec(text);

  let from: number;
  let to: number;
  let matched: string;
  let rendered: string;

  if (century || romanValue !== null) {
    // Roman input is rendered back in arabic, so the reader can see how it
    // was read: "England in the XV century" answers as "the 15th century".
    const n = century ? parseInt(century[1], 10) : (romanValue as number);
    from = (n - 1) * 100 + 1;
    to = n * 100;
    matched = century ? century[0] : (romanCentury as RegExpExecArray)[0];
    rendered = `the ${n}${ordinalSuffix(n)} century`;
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

function placeValues(placeQids: string[]): string {
  return placeQids.map((q) => `wd:${q}`).join(' ');
}

function eventsQuery(placeQids: string[], from: number, to: number): string {
  const classes = EVENT_CLASSES.map((q) => `wd:${q}`).join(' ');
  return `SELECT DISTINCT ?item ?date ?sitelinks WHERE {
  VALUES ?class { ${classes} }
  VALUES ?place { ${placeValues(placeQids)} }
  ?item wdt:P31 ?class ; wdt:P17 ?place ; wikibase:sitelinks ?sitelinks .
  { ?item wdt:P585 ?date } UNION { ?item wdt:P580 ?date }
  FILTER(YEAR(?date) >= ${from} && YEAR(?date) <= ${to})
} ORDER BY DESC(?sitelinks) LIMIT 40`;
}

function peopleQuery(placeQids: string[], from: number, to: number): string {
  return `SELECT DISTINCT ?item ?sitelinks WHERE {
  VALUES ?place { ${placeValues(placeQids)} }
  ?item wdt:P31 wd:Q5 ; wdt:P27 ?place ; wdt:P569 ?birth ; wdt:P570 ?death ;
        wikibase:sitelinks ?sitelinks .
  FILTER(YEAR(?birth) <= ${to} && YEAR(?death) >= ${from})
} ORDER BY DESC(?sitelinks) LIMIT 40`;
}

/** Predecessor and successor states, capped so the VALUES set stays small. */
const MAX_RELATED_POLITIES = 5;

/**
 * A place and the states that were it.
 *
 * Searching by country alone silently loses everything before the modern
 * state existed: "England in the 15th century" returned no events at all,
 * because England is Q21 while the Wars of the Roses and Bosworth are
 * recorded under Kingdom of England, a different item entirely.
 *
 * Wikidata already records the link — England *replaces* the Kingdom of
 * England — so the fix reads that relation rather than hardcoding a mapping.
 * One hop in each direction, which covers the common case without dragging in
 * every polity that ever occupied the same ground.
 */
export function expandPolity(entity: WdEntity): string[] {
  const related = [...statementQids(entity, 'P1365'), ...statementQids(entity, 'P1366')];
  return [entity.id, ...new Set(related)].slice(0, MAX_RELATED_POLITIES + 1);
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

  const byTitle = await fetchEntitiesByTitles([hit.title], {
    props: 'labels|claims|sitelinks',
    signal,
  });
  const placeEntity = byTitle.get(hit.title);
  if (!placeEntity) return null;
  const placeQids = expandPolity(placeEntity);

  // Sequential, not parallel. The query service throttles concurrent queries
  // from one client, and firing both at once silently lost the second — the
  // people list came back empty while the same query worked on its own.
  const eventRows = await runSparql(eventsQuery(placeQids, scope.from, scope.to), signal).catch(
    () => [],
  );
  const peopleRows = await runSparql(peopleQuery(placeQids, scope.from, scope.to), signal).catch(
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
      qid: placeEntity.id,
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
