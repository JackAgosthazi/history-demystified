import type { EntityType } from '../../types';
import { fetchEntities, statementQids, type WdEntity } from '../../connectors/wikidata';

/**
 * Classes that settle the question immediately. Covers the overwhelming
 * majority of real queries without any extra network calls.
 */
const FAST_PATH: Record<string, EntityType> = {
  Q5: 'person',
  Q198: 'conflict',        // war
  Q178561: 'conflict',     // battle
  Q180684: 'conflict',     // conflict
  Q8465: 'conflict',       // civil war
  Q124490: 'conflict',     // siege
  Q650711: 'conflict',     // military campaign
  Q11514315: 'period',     // historical period
  Q186081: 'period',       // time interval
  Q6428674: 'period',      // era
  Q11761: 'period',        // age
  // Cultural and artistic movements are periods as far as a reader is
  // concerned: the useful frame is an era with a before and an after.
  Q968159: 'period',       // art movement
  Q2198855: 'period',      // cultural movement
  Q2198291: 'period',      // philosophical movement
  Q3010369: 'period',      // opening event -> treated as era marker
  Q28171280: 'period',     // ancient civilisation
  Q1190554: 'event',       // occurrence
  Q1656682: 'event',       // event
  Q13418847: 'event',      // historical event
  Q3882219: 'event',       // assassination
  Q10931: 'event',         // revolution
  Q131569: 'event',        // treaty
  Q40231: 'event',         // election
};

/**
 * Ancestor classes, checked in order. Conflicts are also events in the
 * Wikidata hierarchy, so the more specific type has to win.
 */
const ROOTS: Array<[EntityType, string[]]> = [
  ['person', ['Q5', 'Q215627']],
  ['conflict', ['Q180684', 'Q198', 'Q178561', 'Q645883']],
  ['period', ['Q11514315', 'Q186081', 'Q6428674', 'Q968159', 'Q2198855']],
  ['event', ['Q1656682', 'Q1190554', 'Q13418847']],
];

const MAX_DEPTH = 3;

export interface Classification {
  type: EntityType;
  /** Labels of the P31 classes that produced the answer. */
  evidence: string[];
}

/**
 * Decide which of the four supported treatments an entity gets.
 *
 * Wikidata's `instance of` is the ground truth, but it is often specific
 * ("naval battle", "coup d'état"), so unrecognised classes are walked up
 * `subclass of` until they reach a root we know.
 */
export async function classify(entity: WdEntity, signal?: AbortSignal): Promise<Classification> {
  const p31 = statementQids(entity, 'P31');
  if (p31.length === 0) return { type: 'event', evidence: [] };

  const classEntities = await fetchEntities(p31, {
    props: 'labels|claims',
    signal,
  }).catch(() => new Map<string, WdEntity>());

  const evidence = p31.map((qid) => classEntities.get(qid)?.labels?.en?.value ?? qid);

  for (const qid of p31) {
    const hit = FAST_PATH[qid];
    if (hit) return { type: hit, evidence };
  }

  // Walk `subclass of` upward, collecting every ancestor we encounter.
  const seen = new Set(p31);
  let frontier = classEntities;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const parents: string[] = [];
    for (const e of frontier.values()) {
      for (const parent of statementQids(e, 'P279')) {
        if (!seen.has(parent)) {
          seen.add(parent);
          parents.push(parent);
        }
      }
    }
    if (parents.length === 0) break;

    for (const qid of parents) {
      const hit = FAST_PATH[qid];
      if (hit) return { type: hit, evidence };
    }
    for (const [type, roots] of ROOTS) {
      if (roots.some((r) => seen.has(r))) return { type, evidence };
    }

    frontier = await fetchEntities(parents, { props: 'claims', signal }).catch(
      () => new Map<string, WdEntity>(),
    );
  }

  for (const [type, roots] of ROOTS) {
    if (roots.some((r) => seen.has(r))) return { type, evidence };
  }
  return { type: 'event', evidence };
}
