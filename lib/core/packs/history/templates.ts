import type { EntityType } from '../../types';

export type RelationGroup = 'family' | 'roles' | 'participants' | 'context' | 'place';

export interface RelationSpec {
  prop: string;
  label: string;
  group: RelationGroup;
  /** Cap on values rendered; Wikidata can carry dozens. */
  limit: number;
}

export interface TypeTemplate {
  type: EntityType;
  /** Property holding the opening date (birth, or start of the period). */
  startProp: string;
  endProp: string;
  /** Single-moment date, for events that happened on one day. */
  pointProp?: string;
  relations: RelationSpec[];
  /** Section headings preferred for the corpus, matched as substrings. */
  priority: string[];
  guidance: string;
}

/**
 * Sections that are navigation or apparatus rather than prose. Quoting from
 * these produces citations that look valid but say nothing.
 */
export const DROP_SECTIONS = [
  'references', 'notes', 'bibliography', 'further reading', 'external links',
  'see also', 'gallery', 'sources', 'citations', 'footnotes', 'works cited',
  'explanatory notes', 'media', 'in popular culture', 'family tree',
];

/**
 * Always retained regardless of the per-type priority list. Disagreement
 * between historians lives here, and the perspectives panel depends on it.
 */
export const ALWAYS_KEEP_SECTIONS = [
  'legacy', 'historiography', 'reception', 'controversy', 'criticism',
  'assessment', 'significance', 'debate', 'interpretation', 'memory',
];

const COMMON_CONTEXT: RelationSpec[] = [
  { prop: 'P361', label: 'Part of', group: 'context', limit: 4 },
  { prop: 'P527', label: 'Includes', group: 'context', limit: 8 },
  { prop: 'P155', label: 'Preceded by', group: 'context', limit: 3 },
  { prop: 'P156', label: 'Followed by', group: 'context', limit: 3 },
];

export const TEMPLATES: Record<EntityType, TypeTemplate> = {
  person: {
    type: 'person',
    startProp: 'P569',
    endProp: 'P570',
    relations: [
      { prop: 'P22', label: 'Father', group: 'family', limit: 2 },
      { prop: 'P25', label: 'Mother', group: 'family', limit: 2 },
      { prop: 'P26', label: 'Spouse', group: 'family', limit: 6 },
      { prop: 'P40', label: 'Child', group: 'family', limit: 12 },
      { prop: 'P3373', label: 'Sibling', group: 'family', limit: 10 },
      { prop: 'P39', label: 'Position held', group: 'roles', limit: 10 },
      { prop: 'P106', label: 'Occupation', group: 'roles', limit: 6 },
      { prop: 'P27', label: 'Citizenship', group: 'context', limit: 3 },
      { prop: 'P1344', label: 'Took part in', group: 'context', limit: 8 },
      { prop: 'P19', label: 'Born in', group: 'place', limit: 1 },
      { prop: 'P20', label: 'Died in', group: 'place', limit: 1 },
    ],
    priority: [
      'early life', 'childhood', 'background', 'biography', 'life',
      'education', 'early career', 'rise', 'career', 'reign', 'rule',
      'campaign', 'war', 'later life', 'death', 'personal life',
      'overview', 'legacy', 'historiography',
    ],
    guidance:
      'This is a person. Orient the reader around what they are actually remembered for, ' +
      'why they mattered in their own time, and what was contested about them. Do not ' +
      'assume the reader knows the era, the institutions, or the other people involved.',
  },

  conflict: {
    type: 'conflict',
    startProp: 'P580',
    endProp: 'P582',
    pointProp: 'P585',
    relations: [
      { prop: 'P710', label: 'Participant', group: 'participants', limit: 12 },
      { prop: 'P1346', label: 'Victor', group: 'participants', limit: 4 },
      { prop: 'P607', label: 'Part of conflict', group: 'context', limit: 4 },
      { prop: 'P276', label: 'Location', group: 'place', limit: 4 },
      { prop: 'P17', label: 'Country', group: 'place', limit: 4 },
      ...COMMON_CONTEXT,
    ],
    priority: [
      'background', 'origins', 'causes', 'prelude', 'outbreak', 'history',
      'course', 'the war', 'campaign', 'battle', 'fighting', 'turning point',
      'end', 'aftermath', 'casualties', 'consequences', 'overview',
      'legacy', 'historiography',
    ],
    guidance:
      'This is a conflict. Make the sides legible before anything else: who was fighting, ' +
      'what each side wanted, and how the balance shifted. Name the human cost explicitly. ' +
      'Where accounts of the same conflict differ by nationality, say so.',
  },

  event: {
    type: 'event',
    startProp: 'P580',
    endProp: 'P582',
    pointProp: 'P585',
    relations: [
      { prop: 'P710', label: 'Participant', group: 'participants', limit: 10 },
      { prop: 'P828', label: 'Caused by', group: 'context', limit: 6 },
      { prop: 'P1542', label: 'Led to', group: 'context', limit: 6 },
      { prop: 'P276', label: 'Location', group: 'place', limit: 3 },
      { prop: 'P17', label: 'Country', group: 'place', limit: 3 },
      ...COMMON_CONTEXT,
    ],
    priority: [
      'background', 'origins', 'causes', 'prelude', 'the event', 'history',
      'course', 'reactions', 'response', 'aftermath', 'consequences',
      'investigation', 'overview', 'legacy', 'historiography',
    ],
    guidance:
      'This is a single event. The reader needs the chain: what made it possible, what ' +
      'actually happened, and what followed from it. Be precise about how much of the ' +
      'aftermath historians actually attribute to this event versus wider forces.',
  },

  period: {
    type: 'period',
    startProp: 'P580',
    endProp: 'P582',
    relations: [
      { prop: 'P527', label: 'Includes', group: 'context', limit: 12 },
      { prop: 'P361', label: 'Part of', group: 'context', limit: 4 },
      { prop: 'P155', label: 'Preceded by', group: 'context', limit: 3 },
      { prop: 'P156', label: 'Followed by', group: 'context', limit: 3 },
      { prop: 'P17', label: 'Country', group: 'place', limit: 4 },
    ],
    priority: [
      'origins', 'background', 'characteristics', 'overview', 'history',
      'period', 'politics', 'society', 'economy', 'culture', 'art',
      'science', 'religion', 'spread', 'decline', 'end',
      'legacy', 'historiography',
    ],
    guidance:
      'This is a period. Periods are labels historians impose after the fact, so say who ' +
      'coined it and what it includes or excludes. Give the reader a few concrete anchors ' +
      'rather than abstractions, and be clear that its boundaries are debated.',
  },
};

export function templateFor(type: EntityType): TypeTemplate {
  return TEMPLATES[type];
}
