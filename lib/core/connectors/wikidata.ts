import type { DatePrecision, GraphDate, GraphNode } from '../types';
import { getJson } from './http';

/* ------------------------------------------------------------------ *
 * Wire types
 * ------------------------------------------------------------------ */

interface TimeValue {
  time: string;
  precision: number;
  calendarmodel?: string;
}

interface Snak {
  snaktype: 'value' | 'novalue' | 'somevalue';
  datatype?: string;
  datavalue?: { type: string; value: unknown };
}

interface Statement {
  mainsnak: Snak;
  rank: 'preferred' | 'normal' | 'deprecated';
  qualifiers?: Record<string, Snak[]>;
}

export interface WdEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Statement[]>;
  sitelinks?: Record<string, { title: string }>;
}

interface WbGetEntitiesResponse {
  entities?: Record<string, WdEntity & { missing?: string }>;
}

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

export function entityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

const MAX_IDS_PER_CALL = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchEntities(
  qids: string[],
  {
    props = 'labels|descriptions|claims|sitelinks',
    signal,
  }: { props?: string; signal?: AbortSignal } = {},
): Promise<Map<string, WdEntity>> {
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  const result = new Map<string, WdEntity>();
  if (unique.length === 0) return result;

  const batches = await Promise.all(
    chunk(unique, MAX_IDS_PER_CALL).map((ids) => {
      const url =
        `${WIKIDATA_API}?action=wbgetentities&format=json&formatversion=2` +
        `&ids=${ids.join('|')}&props=${encodeURIComponent(props)}` +
        `&languages=en&sitefilter=enwiki`;
      return getJson<WbGetEntitiesResponse>(url, { signal, timeoutMs: 20_000 });
    }),
  );

  for (const batch of batches) {
    for (const [qid, entity] of Object.entries(batch.entities ?? {})) {
      if (!entity.missing) result.set(qid, entity);
    }
  }
  return result;
}

/**
 * Resolve Wikipedia titles straight to Wikidata items in a single request.
 *
 * The alternative — fetching each article to read its QID — is one HTTP call
 * per name and drags the whole page extract along with it. This resolves up
 * to fifty titles at once and brings their claims back with them, which is
 * what lets a model-proposed subject carry a real date without the model ever
 * supplying one.
 */
export async function fetchEntitiesByTitles(
  titles: string[],
  { props = 'labels|descriptions|claims|sitelinks', signal }: { props?: string; signal?: AbortSignal } = {},
): Promise<Map<string, WdEntity>> {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const byTitle = new Map<string, WdEntity>();
  if (unique.length === 0) return byTitle;

  const batches = await Promise.all(
    chunk(unique, MAX_IDS_PER_CALL).map(async (group) => {
      const url =
        `${WIKIDATA_API}?action=wbgetentities&format=json&formatversion=2` +
        `&sites=enwiki&titles=${encodeURIComponent(group.join('|'))}` +
        `&props=${encodeURIComponent(props)}&languages=en&sitefilter=enwiki&normalize=1`;
      return { group, data: await getJson<WbGetEntitiesResponse>(url, { signal, timeoutMs: 20_000 }) };
    }),
  );

  for (const { data } of batches) {
    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      if (entity.missing) continue;
      const title = entity.sitelinks?.enwiki?.title;
      if (title) byTitle.set(title, { ...entity, id: qid });
    }
  }
  return byTitle;
}

/** Cheap variant for turning referenced QIDs into display nodes. */
export async function fetchNodes(
  qids: string[],
  signal?: AbortSignal,
): Promise<Map<string, GraphNode>> {
  const entities = await fetchEntities(qids, { props: 'labels|descriptions|sitelinks', signal });
  const nodes = new Map<string, GraphNode>();
  for (const [qid, e] of entities) nodes.set(qid, toNode(qid, e));
  return nodes;
}

export function toNode(qid: string, e: WdEntity): GraphNode {
  const enwiki = e.sitelinks?.enwiki?.title;
  return {
    qid,
    label: e.labels?.en?.value ?? qid,
    description: e.descriptions?.en?.value,
    url: enwiki
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(enwiki.replace(/ /g, '_'))}`
      : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Statement reading
 * ------------------------------------------------------------------ */

/**
 * Statements for a property, best-first.
 *
 * Wikidata routinely carries several values for the same property at
 * different ranks and precisions — Napoleon's birth is recorded both to the
 * day and to the year. Deprecated values are dropped and preferred ones win.
 */
export function bestStatements(entity: WdEntity, prop: string): Statement[] {
  const all = entity.claims?.[prop] ?? [];
  const usable = all.filter((s) => s.rank !== 'deprecated' && s.mainsnak.snaktype === 'value');
  const preferred = usable.filter((s) => s.rank === 'preferred');
  return preferred.length > 0 ? preferred : usable;
}

export function statementQids(entity: WdEntity, prop: string): string[] {
  return bestStatements(entity, prop)
    .map((s) => (s.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((id): id is string => typeof id === 'string');
}

/** The single best date for a property, preferring the most precise value. */
export function statementDate(entity: WdEntity, prop: string): GraphDate | undefined {
  const dates = bestStatements(entity, prop)
    .map((s) => parseTime(s.mainsnak.datavalue?.value as TimeValue | undefined))
    .filter((d): d is GraphDate => d !== undefined)
    .sort((a, b) => precisionRank(b.precision) - precisionRank(a.precision));
  return dates[0];
}

function qualifierDate(statement: Statement, prop: string): GraphDate | undefined {
  const snak = statement.qualifiers?.[prop]?.find((s) => s.snaktype === 'value');
  return parseTime(snak?.datavalue?.value as TimeValue | undefined);
}

export interface SpannedRef {
  qid: string;
  start?: GraphDate;
  end?: GraphDate;
}

/** Statements that carry a QID value plus optional P580/P582 date bounds. */
export function statementNodesWithSpan(entity: WdEntity, prop: string): SpannedRef[] {
  const out: SpannedRef[] = [];
  for (const s of bestStatements(entity, prop)) {
    const qid = (s.mainsnak.datavalue?.value as { id?: string } | undefined)?.id;
    if (!qid) continue;
    out.push({ qid, start: qualifierDate(s, 'P580'), end: qualifierDate(s, 'P582') });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const PRECISION_BY_CODE: Record<number, DatePrecision> = {
  6: 'millennium',
  7: 'century',
  8: 'decade',
  9: 'year',
  10: 'month',
  11: 'day',
};

const PRECISION_ORDER: DatePrecision[] = ['millennium', 'century', 'decade', 'year', 'month', 'day'];

function precisionRank(p: DatePrecision): number {
  return PRECISION_ORDER.indexOf(p);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Wikidata times look like "+1769-08-15T00:00:00Z" with a separate precision
 * code. Rendering an imprecise value as a full date would invent certainty
 * that is not in the data, so display text is precision-aware.
 */
export function parseTime(value: TimeValue | undefined): GraphDate | undefined {
  if (!value?.time) return undefined;
  const m = /^([+-])(\d{4,})-(\d{2})-(\d{2})/.exec(value.time);
  if (!m) return undefined;

  const bce = m[1] === '-';
  const year = parseInt(m[2], 10);
  const month = parseInt(m[3], 10);
  const day = parseInt(m[4], 10);
  const precision = PRECISION_BY_CODE[value.precision] ?? 'year';
  const suffix = bce ? ' BC' : '';
  const signedYear = bce ? -year : year;

  let display: string;
  switch (precision) {
    case 'day':
      display = day && month ? `${day} ${MONTHS[month - 1]} ${year}${suffix}` : `${year}${suffix}`;
      break;
    case 'month':
      display = month ? `${MONTHS[month - 1]} ${year}${suffix}` : `${year}${suffix}`;
      break;
    case 'year':
      display = `${year}${suffix}`;
      break;
    case 'decade':
      display = `${Math.floor(year / 10) * 10}s${suffix}`;
      break;
    case 'century':
      display = `${ordinal(Math.floor((year - 1) / 100) + 1)} century${suffix}`;
      break;
    default:
      display = `${ordinal(Math.floor((year - 1) / 1000) + 1)} millennium${suffix}`;
  }

  return { raw: value.time, year: signedYear, precision, display };
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Sortable key that keeps BC dates in order ahead of AD ones. */
export function dateSortKey(d: GraphDate): number {
  return d.year;
}
