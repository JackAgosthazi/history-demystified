import type {
  EntityFacts,
  EntityRef,
  GatherResult,
  GraphDate,
  GraphNode,
  Relations,
  ResolvedEntity,
  SourceDoc,
  TimelineEvent,
} from '../../types';
import { estimateTokens } from '../../connectors/http';
import {
  articleUrl,
  fetchLead,
  fetchPage,
  searchPages,
  splitSections,
  type WikiPage,
} from '../../connectors/wikipedia';
import {
  entityUrl,
  fetchEntities,
  fetchEntitiesByTitles,
  parseTime,
  statementDate,
  statementNodesWithSpan,
  statementQids,
  toNode,
  type WdEntity,
} from '../../connectors/wikidata';
import { classify } from './classify';
import { ALWAYS_KEEP_SECTIONS, DROP_SECTIONS, templateFor } from './templates';

/* ------------------------------------------------------------------ *
 * Budget
 * ------------------------------------------------------------------ */

const TOTAL_TOKEN_BUDGET = 30_000;
/**
 * Article substance is very unevenly distributed: Napoleon's "Ruler of
 * France" runs to ~9k tokens while "Arms" is 19. A flat per-section cap
 * spends the budget on trivia and truncates away the actual history, so
 * sections the type template cares about get a much larger allowance.
 */
const RANKED_SECTION_CAP = 3_500;
const UNRANKED_SECTION_CAP = 900;
/** Below this a section is a stub or a navigation aid, not prose. */
const SECTION_FLOOR_TOKENS = 80;
const MAX_SECTIONS = 14;
const FOREIGN_LEAD_TOKEN_CAP = 700;
const MAX_FOREIGN_LEADS = 3;
/** Fetching full claims for related entities is what puts them on the timeline. */
const MAX_RELATED_WITH_CLAIMS = 40;

export class ResolutionError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'ambiguous') {
    super(message);
    this.name = 'ResolutionError';
  }
}

export interface HistoryContext {
  entity: ResolvedEntity;
  page: WikiPage;
  wd: WdEntity;
}

/* ------------------------------------------------------------------ *
 * Resolve
 * ------------------------------------------------------------------ */

export async function resolve(query: string, signal?: AbortSignal): Promise<HistoryContext> {
  const candidates = await searchPages(query, { limit: 5, signal });
  if (candidates.length === 0) {
    throw new ResolutionError(`No Wikipedia article matches "${query}".`, 'not_found');
  }

  // Walk candidates until one is a real article rather than a disambiguation page.
  let page: WikiPage | null = null;
  let chosenIndex = 0;
  for (let i = 0; i < Math.min(candidates.length, 3); i++) {
    const p = await fetchPage(candidates[i].title, { signal });
    if (p && !p.isDisambiguation && p.extract.length > 200) {
      page = p;
      chosenIndex = i;
      break;
    }
  }
  if (!page) {
    throw new ResolutionError(`"${query}" only matches disambiguation pages.`, 'ambiguous');
  }
  if (!page.qid) {
    throw new ResolutionError(`"${page.title}" has no Wikidata entry to ground facts against.`, 'not_found');
  }

  const entities = await fetchEntities([page.qid], { signal });
  const wd = entities.get(page.qid);
  if (!wd) {
    throw new ResolutionError(`Wikidata item ${page.qid} could not be loaded.`, 'not_found');
  }

  const { type, evidence } = await classify(wd, signal);

  const entity: ResolvedEntity = {
    qid: page.qid,
    title: page.title,
    url: page.url,
    lang: 'en',
    description: wd.descriptions?.en?.value ?? page.description,
    type,
    typeEvidence: evidence,
    alternates: candidates
      .filter((c, i) => i !== chosenIndex && !/\(disambiguation\)/i.test(c.title))
      .slice(0, 4),
  };

  return { entity, page, wd };
}

/* ------------------------------------------------------------------ *
 * Section selection
 * ------------------------------------------------------------------ */

function truncateToTokens(text: string, cap: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= cap) return { text, truncated: false };
  const charCap = cap * 4;
  // Cut at a sentence boundary so the model is never handed a half sentence
  // to quote from.
  const slice = text.slice(0, charCap);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
  const cut = lastStop > charCap * 0.6 ? slice.slice(0, lastStop + 1) : slice;
  return { text: `${cut.trim()}\n\n[section truncated]`, truncated: true };
}

function matchesAny(heading: string, needles: string[]): boolean {
  const h = heading.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/**
 * Choose which sections make it into the corpus.
 *
 * Priority order matters more than it looks: "Legacy" and "Historiography"
 * are where historians disagree with each other, and the perspectives panel
 * is empty without them.
 */
interface SelectedSection {
  heading: string;
  text: string;
  cap: number;
}

function selectSections(page: WikiPage, priority: string[]) {
  const titleWords = page.title.toLowerCase();
  const all = splitSections(page.extract);
  const lead = all.find((s) => s.heading === '')?.text ?? '';
  const body = all.filter(
    (s) =>
      s.heading !== '' &&
      !matchesAny(s.heading, DROP_SECTIONS) &&
      estimateTokens(s.text) >= SECTION_FLOOR_TOKENS,
  );

  const scored = body.map((section) => {
    const alwaysKeep = matchesAny(section.heading, ALWAYS_KEEP_SECTIONS);
    const priorityIndex = priority.findIndex((p) => section.heading.toLowerCase().includes(p));
    // A heading echoed in the article title is almost always the central
    // section: "Assassination" inside "Assassination of Archduke Franz
    // Ferdinand". The generic priority lists cannot anticipate these.
    const isSubject = titleWords.includes(section.heading.toLowerCase());
    const ranked = alwaysKeep || isSubject || priorityIndex !== -1;
    return {
      section,
      rank: alwaysKeep ? -1 : isSubject ? 0 : priorityIndex === -1 ? 999 : priorityIndex,
      cap: ranked ? RANKED_SECTION_CAP : UNRANKED_SECTION_CAP,
    };
  });

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.section.text.length - a.section.text.length;
  });

  const chosen: SelectedSection[] = scored
    .slice(0, MAX_SECTIONS)
    .map((s) => ({ heading: s.section.heading, text: s.section.text, cap: s.cap }));

  return { lead, chosen };
}

/* ------------------------------------------------------------------ *
 * Wikidata facts
 * ------------------------------------------------------------------ */

/**
 * Country/nationality QID -> Wikipedia language edition.
 *
 * Used to pick which other-language articles to pull in, on the theory that
 * the historiography of an event reads differently in the languages of the
 * people it happened to. A curated map rather than a P37/P424 lookup chain:
 * two extra round trips per query to cover the long tail is not worth it.
 */
const COUNTRY_LANGS: Record<string, string> = {
  Q142: 'fr', Q183: 'de', Q29: 'es', Q159: 'ru', Q38: 'it', Q148: 'zh',
  Q17: 'ja', Q145: 'en', Q30: 'en', Q34: 'sv', Q55: 'nl', Q36: 'pl',
  Q45: 'pt', Q155: 'pt', Q43: 'tr', Q794: 'fa', Q79: 'ar', Q851: 'ar',
  Q668: 'hi', Q212: 'uk', Q40: 'de', Q39: 'de', Q20: 'no', Q35: 'da',
  Q33: 'fi', Q215: 'sl', Q214: 'sk', Q213: 'cs', Q28: 'hu', Q218: 'ro',
  Q219: 'bg', Q41: 'el', Q77: 'es', Q414: 'es', Q96: 'es', Q252: 'id',
  Q884: 'ko', Q423: 'ko', Q881: 'vi', Q843: 'ur', Q902: 'bn', Q265: 'uz',
};

const FALLBACK_LANGS = ['fr', 'de', 'es', 'ru'];

function pickForeignLangs(wd: WdEntity, available: Set<string>): string[] {
  const candidates: string[] = [];
  for (const prop of ['P17', 'P27', 'P710', 'P495']) {
    for (const qid of statementQids(wd, prop)) {
      const lang = COUNTRY_LANGS[qid];
      if (lang && lang !== 'en') candidates.push(lang);
    }
  }
  const ordered = [...new Set([...candidates, ...FALLBACK_LANGS])];
  return ordered.filter((l) => available.has(l)).slice(0, MAX_FOREIGN_LEADS);
}

function nodeDates(e: WdEntity): { start?: GraphDate; end?: GraphDate } {
  const start = statementDate(e, 'P569') ?? statementDate(e, 'P580') ?? statementDate(e, 'P585');
  const end = statementDate(e, 'P570') ?? statementDate(e, 'P582');
  return { start, end };
}

async function buildFacts(
  entity: ResolvedEntity,
  wd: WdEntity,
  signal?: AbortSignal,
): Promise<{ facts: EntityFacts; nodes: Map<string, GraphNode> }> {
  const template = templateFor(entity.type);

  // Collect every referenced QID up front so labels resolve in one batch.
  const wanted: string[] = [];
  const perProp = new Map<string, ReturnType<typeof statementNodesWithSpan>>();
  for (const spec of template.relations) {
    const refs = statementNodesWithSpan(wd, spec.prop).slice(0, spec.limit);
    perProp.set(spec.prop, refs);
    wanted.push(...refs.map((r) => r.qid));
  }

  const entities = await fetchEntities([...new Set(wanted)].slice(0, MAX_RELATED_WITH_CLAIMS), {
    signal,
  }).catch(() => new Map<string, WdEntity>());

  const nodes = new Map<string, GraphNode>();
  for (const [qid, e] of entities) {
    nodes.set(qid, { ...toNode(qid, e), ...nodeDates(e) });
  }

  const relations: Relations = {};
  /** Keys whose dates describe the relationship itself, e.g. a marriage. */
  const qualifierSpans = new Set<string>();
  for (const spec of template.relations) {
    const refs = perProp.get(spec.prop) ?? [];
    const resolved: GraphNode[] = [];
    for (const ref of refs) {
      const node = nodes.get(ref.qid);
      if (!node) continue;
      // Qualifier dates describe the relationship (a term of office), which
      // is more informative here than the related entity's own lifespan.
      const merged: GraphNode = { ...node };
      if (ref.start) {
        merged.start = ref.start;
        qualifierSpans.add(`${spec.prop}-${ref.qid}`);
      }
      if (ref.end) merged.end = ref.end;
      resolved.push(merged);
    }
    if (resolved.length > 0) relations[spec.prop] = resolved;
  }

  const start = statementDate(wd, template.startProp) ??
    (template.pointProp ? statementDate(wd, template.pointProp) : undefined);
  const end = statementDate(wd, template.endProp);

  const facts: EntityFacts = {
    qid: entity.qid,
    label: wd.labels?.en?.value ?? entity.title,
    description: entity.description,
    start,
    end,
    relations,
    timeline: buildTimeline(entity, start, end, relations, template.relations, qualifierSpans),
    sourceUrl: entityUrl(entity.qid),
  };

  return { facts, nodes };
}

/** Recover an article title from a Wikipedia URL, for drill-down links. */
function titleFromWikipediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = /\/wiki\/([^#?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : undefined;
}

function buildTimeline(
  entity: ResolvedEntity,
  start: GraphDate | undefined,
  end: GraphDate | undefined,
  relations: Relations,
  specs: ReturnType<typeof templateFor>['relations'],
  qualifierSpans: Set<string>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const wdUrl = entityUrl(entity.qid);
  const isPerson = entity.type === 'person';

  if (start) {
    events.push({
      id: 'start',
      label: isPerson ? `Born — ${entity.title}` : `${entity.title} begins`,
      kind: isPerson ? 'life' : 'period',
      date: start,
      endDate: isPerson ? undefined : end,
      qid: entity.qid,
      title: entity.title,
      sourceUrl: wdUrl,
    });
  }
  if (end && isPerson) {
    events.push({
      id: 'end',
      label: `Died — ${entity.title}`,
      kind: 'life',
      date: end,
      qid: entity.qid,
      title: entity.title,
      sourceUrl: wdUrl,
    });
  }

  for (const spec of specs) {
    const nodes = relations[spec.prop];
    if (!nodes) continue;
    // A place has no date of its own, and a sibling's lifespan is not an
    // event in this subject's life — only relationships that carry their own
    // dates (a marriage, a term of office) belong on the timeline.
    if (spec.group === 'place') continue;

    for (const node of nodes) {
      if (!node.start) continue;
      const key = `${spec.prop}-${node.qid}`;
      if (spec.group === 'family' && !qualifierSpans.has(key)) continue;

      const kind = spec.prop === 'P39' ? 'position' : spec.group === 'context' ? 'related' : 'event';
      events.push({
        // The same office can be held twice — Napoleon was Emperor in
        // 1804-1814 and again through the Hundred Days — so the start date is
        // part of the identity, not just the property and the entity.
        id: `${key}-${node.start.raw}`,
        label: spec.prop === 'P39' ? node.label : `${spec.label}: ${node.label}`,
        kind,
        date: node.start,
        endDate: node.end,
        qid: node.qid,
        ...(titleFromWikipediaUrl(node.url) ? { title: titleFromWikipediaUrl(node.url) } : {}),
        sourceUrl: node.url ?? entityUrl(node.qid),
      });
    }
  }

  return dropDistortingContainers(events, start, end).sort((a, b) => a.date.year - b.date.year);
}

/**
 * Remove related entries so much longer than the subject that they flatten it.
 *
 * "Part of: Anglo-French Wars" spans four centuries; on the same axis as a
 * 116-year war it pushes the actual conflict into a sliver. These are
 * containers rather than events, and they are already shown under "How it
 * connects", so the timeline drops them rather than distorting for them.
 */
function dropDistortingContainers(
  events: TimelineEvent[],
  start: GraphDate | undefined,
  end: GraphDate | undefined,
): TimelineEvent[] {
  if (!start || !end) return events;
  const subjectSpan = Math.abs(end.year - start.year);
  if (subjectSpan < 1) return events;

  return events.filter((event) => {
    if (event.kind !== 'related' || !event.endDate) return true;
    return Math.abs(event.endDate.year - event.date.year) <= subjectSpan * 3;
  });
}

/**
 * Serialize graph facts as a quotable document.
 *
 * Putting Wikidata in the corpus as plain lines means a date the model writes
 * into its prose can be verified by exactly the same substring check as any
 * other claim, instead of needing a separate trust path.
 */
function factsAsSource(entity: ResolvedEntity, facts: EntityFacts, id: string): SourceDoc {
  const lines: string[] = [`${facts.label} (${facts.qid})`];
  if (facts.description) lines.push(`Description: ${facts.description}`);

  const template = templateFor(entity.type);
  const startLabel = entity.type === 'person' ? 'Date of birth' : 'Start date';
  const endLabel = entity.type === 'person' ? 'Date of death' : 'End date';
  if (facts.start) lines.push(`${startLabel}: ${facts.start.display}`);
  if (facts.end) lines.push(`${endLabel}: ${facts.end.display}`);

  for (const spec of template.relations) {
    const nodes = facts.relations[spec.prop];
    if (!nodes?.length) continue;
    for (const node of nodes) {
      const span = node.start
        ? ` (${node.start.display}${node.end ? ` to ${node.end.display}` : ' onwards'})`
        : '';
      lines.push(`${spec.label}: ${node.label}${span}`);
    }
  }

  return {
    id,
    url: facts.sourceUrl,
    title: `Wikidata structured record for ${facts.label}`,
    lang: 'en',
    publisher: 'Wikidata',
    text: lines.join('\n'),
    truncated: false,
  };
}

/* ------------------------------------------------------------------ *
 * Gather
 * ------------------------------------------------------------------ */

export async function gather(ctx: HistoryContext, signal?: AbortSignal): Promise<GatherResult> {
  const { entity, page, wd } = ctx;
  const template = templateFor(entity.type);

  const availableLangs = new Set(page.langlinks.map((l) => l.lang));
  const foreignLangs = pickForeignLangs(wd, availableLangs);

  const [{ facts }, foreignLeads] = await Promise.all([
    buildFacts(entity, wd, signal),
    Promise.all(
      foreignLangs.map(async (lang) => {
        const title = page.langlinks.find((l) => l.lang === lang)?.title;
        if (!title) return null;
        const lead = await fetchLead(title, { lang, signal }).catch(() => null);
        return lead ? { lang, ...lead } : null;
      }),
    ),
  ]);

  const { lead, chosen } = selectSections(page, template.priority);

  const sources: SourceDoc[] = [];
  let spent = 0;
  let n = 1;
  const nextId = () => `S${n++}`;

  // 1. The lead, in full — it is the densest and most reliable passage.
  const leadDoc: SourceDoc = {
    id: nextId(),
    url: page.url,
    title: page.title,
    lang: 'en',
    publisher: 'Wikipedia (English)',
    section: 'Introduction',
    text: lead,
    truncated: false,
  };
  sources.push(leadDoc);
  spent += estimateTokens(lead);

  // 2. Structured facts.
  const factsDoc = factsAsSource(entity, facts, nextId());
  sources.push(factsDoc);
  spent += estimateTokens(factsDoc.text);

  // 3. Other-language leads, for the perspectives panel.
  for (const fl of foreignLeads) {
    if (!fl) continue;
    const { text, truncated } = truncateToTokens(fl.text, FOREIGN_LEAD_TOKEN_CAP);
    if (spent + estimateTokens(text) > TOTAL_TOKEN_BUDGET) break;
    sources.push({
      id: nextId(),
      url: fl.url,
      title: fl.title,
      lang: fl.lang,
      publisher: `Wikipedia (${fl.lang})`,
      section: 'Introduction',
      text,
      truncated,
    });
    spent += estimateTokens(text);
  }

  // 4. English sections, in priority order, until the budget runs out.
  for (const section of chosen) {
    const { text, truncated } = truncateToTokens(section.text, section.cap);
    const cost = estimateTokens(text);
    if (spent + cost > TOTAL_TOKEN_BUDGET) break;
    sources.push({
      id: nextId(),
      url: `${page.url}#${encodeURIComponent(section.heading.replace(/ /g, '_'))}`,
      title: page.title,
      lang: 'en',
      publisher: 'Wikipedia (English)',
      section: section.heading,
      text,
      truncated,
    });
    spent += cost;
  }

  return { sources, facts, lead };
}

/* ------------------------------------------------------------------ *
 * Entity-name validation for model output
 * ------------------------------------------------------------------ */

export interface ValidatedRef extends EntityRef {
  start?: GraphDate;
  end?: GraphDate;
  /**
   * When the thing itself happened — P585 or P580 only, never a birth date.
   *
   * A key event that resolves to a person must not borrow that person's
   * birthday: "Abdication and the Bourbon restoration" pointing at Louis XVIII
   * was rendering as 17 November 1755, which reads as fact and is nonsense.
   */
  occurredAt?: GraphDate;
}

/**
 * Turn model-proposed entity names into real references, dropping anything
 * that does not resolve. The model never emits URLs, so a comparison, key
 * event or context link either points at a genuine article or does not appear
 * at all.
 *
 * Two steps: a search per name to canonicalise it, then a single Wikidata
 * lookup by title for every survivor at once. The second step is what lets a
 * suggested event carry a real date without the model ever writing one.
 */
export async function validateEntityNames(
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, ValidatedRef>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 32);
  const resolved = new Map<string, ValidatedRef>();

  await Promise.all(
    unique.map(async (name) => {
      const [hit] = await searchPages(name, { limit: 1, signal }).catch(() => []);
      if (hit) resolved.set(name, { ...hit, url: articleUrl(hit.title) });
    }),
  );

  // Logged rather than swallowed. A silent catch here hid a malformed
  // request for hours: comparisons kept rendering, just with no dates and no
  // QIDs, which looks like a modelling problem rather than a broken URL.
  const byTitle = await fetchEntitiesByTitles(
    [...resolved.values()].map((r) => r.title),
    { signal },
  ).catch((error: unknown) => {
    console.warn('[gather] title lookup failed; entities will lack dates', error);
    return new Map<string, WdEntity>();
  });

  for (const ref of resolved.values()) {
    const entity = byTitle.get(ref.title);
    if (!entity) continue;
    ref.qid = entity.id;
    const { start, end } = nodeDates(entity);
    if (start) ref.start = start;
    if (end) ref.end = end;
    const occurred = statementDate(entity, 'P585') ?? statementDate(entity, 'P580');
    if (occurred) ref.occurredAt = occurred;
  }

  return resolved;
}
