import Link from 'next/link';
import type { EntityFacts, EntityType, GraphNode, KeyFigure } from '@/lib/core/types';
import { EntityChip, explainHref } from './Entities';

/**
 * Relationship structure, drawn from the knowledge graph and shaped by what
 * the subject actually is.
 *
 * A family tree is the right picture for a person and a useless one for a
 * treaty, so each type gets the arrangement that answers its own first
 * question: who was this person related to, who was fighting whom, what
 * caused this and what did it cause, what does this era contain.
 */

export function Relationships({
  facts,
  type,
  figures = [],
}: {
  facts: EntityFacts;
  type: EntityType;
  figures?: KeyFigure[];
}) {
  const graph = graphViewFor(facts, type);

  return (
    <div className="space-y-8">
      {graph}
      {graph && figures.length > 0 && <hr className="border-rule" />}
      <KeyFigures figures={figures} />
    </div>
  );
}

function graphViewFor(facts: EntityFacts, type: EntityType) {
  switch (type) {
    case 'person':
      return <FamilyTree facts={facts} />;
    case 'conflict':
      return <Belligerents facts={facts} />;
    case 'event':
      return <CausalChain facts={facts} />;
    case 'period':
      return <Composition facts={facts} />;
  }
}

/**
 * The people the subject cannot be understood without.
 *
 * This is the one part of the relationship view the knowledge graph cannot
 * supply: Wikidata records marriages and parentage, but has no property for
 * "chief opponent" or "rival claimant", which are usually the relationships
 * that actually matter. So these are proposed by Claude and then resolved
 * against Wikipedia — the connection is an interpretation, the person is not.
 */
function KeyFigures({ figures }: { figures: KeyFigure[] }) {
  if (figures.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="section-label">People you need to know</p>
        <p className="text-xs text-ink-faint">
          Suggested by Claude, each checked against Wikipedia
        </p>
      </div>
      <ul className="divide-y divide-rule">
        {figures.map((figure) => (
          <li key={figure.entity.title} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link
                href={explainHref(figure.entity.title)}
                className="font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:text-accent"
              >
                {figure.entity.title}
              </Link>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--paper-sunken)', color: 'var(--ink-muted)' }}
              >
                {figure.relationship}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{figure.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function nodes(facts: EntityFacts, prop: string): GraphNode[] {
  return facts.relations[prop] ?? [];
}

function Tier({ label, people }: { label: string; people: GraphNode[] }) {
  if (people.length === 0) return null;
  return (
    <div className="text-center">
      <p className="section-label mb-2">{label}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {people.map((p) => (
          <EntityChip key={p.qid} entity={p} />
        ))}
      </div>
    </div>
  );
}

function Connector() {
  return <div aria-hidden className="mx-auto h-5 w-px" style={{ background: 'var(--rule-strong)' }} />;
}

function FamilyTree({ facts }: { facts: EntityFacts }) {
  const parents = [...nodes(facts, 'P22'), ...nodes(facts, 'P25')];
  const spouses = nodes(facts, 'P26');
  const children = nodes(facts, 'P40');
  const siblings = nodes(facts, 'P3373');
  if (parents.length + spouses.length + children.length + siblings.length === 0) return null;

  return (
    <div className="space-y-1">
      <Tier label="Parents" people={parents} />
      {parents.length > 0 && <Connector />}

      <div className="text-center">
        <p className="section-label mb-2">{facts.label}</p>
        <div
          className="inline-block rounded-full border-2 px-4 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          {facts.label}
        </div>
      </div>

      {spouses.length > 0 && (
        <>
          <Connector />
          <Tier label={spouses.length > 1 ? 'Spouses' : 'Spouse'} people={spouses} />
        </>
      )}
      {children.length > 0 && (
        <>
          <Connector />
          <Tier label="Children" people={children} />
        </>
      )}
      {siblings.length > 0 && (
        <div className="pt-4">
          <Tier label="Siblings" people={siblings} />
        </div>
      )}
    </div>
  );
}

function Belligerents({ facts }: { facts: EntityFacts }) {
  const participants = nodes(facts, 'P710');
  const victors = new Set(nodes(facts, 'P1346').map((v) => v.qid));
  if (participants.length === 0) return null;

  return (
    <div>
      <p className="section-label mb-3">Who was involved</p>
      <div className="flex flex-wrap gap-2">
        {participants.map((p) => (
          <span key={p.qid} className="relative inline-flex">
            <EntityChip entity={p} />
            {victors.has(p.qid) && (
              <span
                className="pointer-events-none absolute -top-1.5 -right-1 rounded-full px-1.5 py-px text-[0.6rem] font-semibold"
                style={{ background: 'var(--verified-soft)', color: 'var(--verified)' }}
              >
                victor
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function CausalChain({ facts }: { facts: EntityFacts }) {
  const causes = nodes(facts, 'P828');
  const effects = nodes(facts, 'P1542');
  const participants = nodes(facts, 'P710');
  if (causes.length + effects.length + participants.length === 0) return null;

  return (
    <div className="space-y-5">
      {(causes.length > 0 || effects.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="section-label mb-2">What led to it</p>
            <div className="flex flex-wrap gap-2">
              {causes.length ? (
                causes.map((c) => <EntityChip key={c.qid} entity={c} />)
              ) : (
                <p className="text-sm text-ink-faint">Not recorded in Wikidata.</p>
              )}
            </div>
          </div>
          <div>
            <p className="section-label mb-2">What followed</p>
            <div className="flex flex-wrap gap-2">
              {effects.length ? (
                effects.map((c) => <EntityChip key={c.qid} entity={c} />)
              ) : (
                <p className="text-sm text-ink-faint">Not recorded in Wikidata.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {participants.length > 0 && (
        <div>
          <p className="section-label mb-2">Who was involved</p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <EntityChip key={p.qid} entity={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Composition({ facts }: { facts: EntityFacts }) {
  const parts = nodes(facts, 'P527');
  const within = nodes(facts, 'P361');
  if (parts.length + within.length === 0) return null;

  return (
    <div className="space-y-5">
      {within.length > 0 && (
        <div>
          <p className="section-label mb-2">Sits inside</p>
          <div className="flex flex-wrap gap-2">
            {within.map((p) => (
              <EntityChip key={p.qid} entity={p} />
            ))}
          </div>
        </div>
      )}
      {parts.length > 0 && (
        <div>
          <p className="section-label mb-2">Contains</p>
          <div className="flex flex-wrap gap-2">
            {parts.map((p) => (
              <EntityChip key={p.qid} entity={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
