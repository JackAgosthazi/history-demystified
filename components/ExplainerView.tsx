'use client';

import Link from 'next/link';
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  enterSubject,
  getServerTrail,
  getTrail,
  labelSubject,
  subscribeToTrail,
} from '@/lib/client/trail';
import type { TimelineEvent } from '@/lib/core/types';
import { Breadcrumbs } from './Breadcrumbs';
import { ProgressPanel } from './ProgressPanel';
import {
  SectionSkeleton,
  SkeletonChips,
  SkeletonClaims,
  SkeletonParagraph,
} from './Skeleton';
import { SectionNav, type NavSection } from './SectionNav';
import { ComparisonChart } from './ComparisonChart';
import { useExplainer } from '@/lib/client/useExplainer';
import { EntityChip, EntityChipRow, explainHref } from './Entities';
import { Prose } from './Prose';
import { Relationships } from './Relationships';
import { SearchBox } from './SearchBox';
import { SurveyView } from './SurveyView';
import { KeyEvents } from './KeyEvents';
import { Timeline } from './Timeline';
import { ClaimBlock, CoverageBadge } from './Verification';


export function ExplainerView({ query }: { query: string }) {
  const state = useExplainer(query);
  const { entity, facts, sources, explainer, survey, stage, error } = state;

  const trail = useSyncExternalStore(subscribeToTrail, getTrail, getServerTrail);
  useEffect(() => enterSubject(query), [query]);
  useEffect(() => {
    if (entity?.title) labelSubject(query, entity.title);
  }, [query, entity?.title]);

  /*
   * The graph gives spans and tenures; the narrative call gives the turning
   * points. Both belong on one axis — a reader wants Sekigahara next to the
   * Edo period, not in a separate list — so dated key events are merged in
   * and anything already present from the graph is dropped.
   */
  const loading = stage !== 'done' && stage !== 'error';
  const awaitingStructured = loading && !explainer;
  /*
   * Every section below is populated on every one of the twelve pre-generated
   * topics, so a placeholder for one is a promise that gets kept. Key events
   * are the exception, and they are perfectly predicted by type: conflicts,
   * periods and events have them, a person never does.
   */
  const expectsKeyEvents = entity ? entity.type !== 'person' : false;

  /*
   * Not memoised: building twelve objects is cheaper than the memo, and the
   * React Compiler reported that a manual useMemo here blocked its own
   * optimisation. SectionNav keys its observer on the joined ids, so a fresh
   * array each render costs nothing downstream.
   */
  const navSections = ((): NavSection[] => {
    const has = (n: number | undefined) => (n ?? 0) > 0;
    const pending = !explainer && stage !== 'done' && stage !== 'error';
    const keyEventsLikely = entity ? entity.type !== 'person' : false;
    return [
      { id: 'overview', label: 'Overview', when: Boolean(state.prose || state.lead) },
      { id: 'why-it-matters', label: 'Why it matters', when: pending || Boolean(explainer?.whyItMatters) },
      { id: 'takeaways', label: 'Key takeaways', when: pending || has(explainer?.takeaways?.length) },
      { id: 'how-it-unfolded', label: 'How it unfolded', when: (pending && keyEventsLikely) || has(explainer?.keyEvents?.length) },
      { id: 'timeline', label: 'Timeline', when: has(facts?.timeline?.length) },
      { id: 'connections', label: 'Who was connected', when: Boolean(facts && entity) },
      { id: 'perspectives', label: 'Where accounts differ', when: pending || has(explainer?.perspectives?.length) },
      { id: 'comparisons', label: 'For comparison', when: pending || has(explainer?.comparisons?.length) },
      { id: 'context', label: 'How it connects', when: pending || has(explainer?.context?.length) },
      { id: 'glossary', label: 'Glossary', when: pending || has(explainer?.glossary?.length) },
      { id: 'go-deeper', label: 'Go deeper', when: pending || has(explainer?.drilldown?.length) },
      { id: 'sources', label: 'Sources', when: has(sources.length) },
    ]
      .filter((s) => s.when)
      .map(({ id, label }) => ({ id, label }));
  })();

  // Bound to locals rather than optional-chained expressions: the compiler
  // cannot track `facts?.timeline` as a dependency and drops the memo.
  const graphTimeline = facts?.timeline;
  const keyEvents = explainer?.keyEvents;

  const timeline = useMemo<TimelineEvent[]>(() => {
    const base = graphTimeline ?? [];
    if (!keyEvents?.length) return base;

    const seen = new Set(
      base.flatMap((e) => [e.qid, e.title?.toLowerCase()].filter(Boolean) as string[]),
    );
    const extra: TimelineEvent[] = [];
    for (const event of keyEvents) {
      if (!event.date) continue;
      const key = event.entity?.qid ?? event.entity?.title.toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      extra.push({
        id: `key-${event.label}`,
        label: event.label,
        kind: 'event',
        date: event.date,
        ...(event.entity?.qid ? { qid: event.entity.qid } : {}),
        ...(event.entity?.title ? { title: event.entity.title } : {}),
        ...(event.summary ? { note: event.summary } : {}),
        sourceUrl: event.entity?.url ?? '',
      });
    }
    return [...base, ...extra].sort((a, b) => a.date.year - b.date.year);
  }, [graphTimeline, keyEvents]);

  if (error) return <ErrorPanel query={query} message={error.message} code={error.code} />;

  return (
    <main className="mx-auto w-full max-w-4xl grow px-6 py-10">
      <Breadcrumbs steps={trail} current={entity?.title ?? query} />
      {!survey && <SectionNav sections={navSections} subject={entity?.title} />}

      {survey && (
        <>
          <SurveyView survey={survey} />
          <div className="mt-16 border-t border-rule pt-8">
            <p className="section-label mb-3">Explain something else</p>
            <div className="max-w-xl">
              <SearchBox />
            </div>
          </div>
        </>
      )}
      {survey ? null : (
        <>

      {/* The header renders from the skeleton event, about a second in and
          before any model tokens are spent. */}
      <header className="measure">
        <h1 className="display text-4xl font-semibold sm:text-[2.75rem]">
          {entity?.title ?? query}
        </h1>
        {entity?.description && (
          <p className="mt-2 text-lg text-ink-muted">{capitalize(entity.description)}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {entity && (
            <span className="rounded-full border border-rule px-3 py-1 text-xs text-ink-muted">
              {entity.type}
            </span>
          )}
          {explainer && <CoverageBadge coverage={explainer.coverage} />}
          {explainer?.prewarmed && (
            <span className="text-xs text-ink-faint">
              Pre-generated {new Date(explainer.generatedAt).toLocaleDateString()}
            </span>
          )}
          {state.fromLocalCache && !explainer?.prewarmed && (
            <span className="text-xs text-ink-faint">From your browser cache</span>
          )}
        </div>

        {loading && <ProgressPanel stage={stage} detail={state.detail} />}

        {entity && entity.alternates.length > 0 && stage === 'done' && (
          <p className="mt-4 text-sm text-ink-faint">
            Looking for something else?{' '}
            {entity.alternates.map((alt, i) => (
              <span key={alt.title}>
                {i > 0 && ', '}
                <Link href={explainHref(alt.title)} className="text-accent underline underline-offset-2">
                  {alt.title}
                </Link>
              </span>
            ))}
          </p>
        )}
      </header>

      <div className="mt-10 space-y-12">
        {!state.prose && !state.lead && loading && (
          <section id="overview" className="measure scroll-mt-24" aria-busy="true">
            <SkeletonParagraph lines={6} />
          </section>
        )}
        {(state.prose || state.lead) && (
          <section id="overview" className="measure scroll-mt-24">
            <Prose
              text={explainer ? explainer.summary : stripHeadings(state.prose || state.lead)}
              sources={sources}
            />
          </section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="why-it-matters" title="Why it matters">
            <div className="measure">
              <SkeletonParagraph lines={3} />
            </div>
          </SectionSkeleton>
        )}
        {explainer?.whyItMatters && (
          <Section id="why-it-matters" title="Why it matters">
            <div className="measure">
              <Prose text={explainer.whyItMatters} sources={sources} />
            </div>
          </Section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="takeaways" title="Key takeaways">
            <SkeletonClaims count={5} />
          </SectionSkeleton>
        )}
        {explainer && (explainer.takeaways?.length ?? 0) > 0 && (
          <Section
            id="takeaways"
            title="Key takeaways"
            note="Every one carries the sentence it came from. Open any of them to check it."
          >
            <ul className="measure space-y-4">
              {explainer.takeaways.map((c) => (
                <ClaimBlock key={c.id} claim={c} />
              ))}
            </ul>
          </Section>
        )}

        {awaitingStructured && expectsKeyEvents && (
          <SectionSkeleton id="how-it-unfolded" title="How it unfolded">
            <div className="space-y-5 border-l border-rule pl-6">
              <SkeletonParagraph lines={2} />
              <SkeletonParagraph lines={2} />
              <SkeletonParagraph lines={2} />
            </div>
          </SectionSkeleton>
        )}
        {explainer && (explainer.keyEvents?.length ?? 0) > 0 && (
          <Section
            id="how-it-unfolded"
            title="How it unfolded"
            note="The moments after which things were different. Dates are from Wikidata; each one you can open."
          >
            <KeyEvents events={explainer.keyEvents ?? []} />
          </Section>
        )}

        {timeline.length > 0 && (
          <Section
            id="timeline"
            title="Timeline"
            note="Dates come from Wikidata. Anything underlined opens as its own explainer."
          >
            <Timeline events={timeline} />
          </Section>
        )}

        {facts && entity && (
          <RelationshipSection>
            <Relationships facts={facts} type={entity.type} figures={explainer?.figures} />
          </RelationshipSection>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="perspectives" title="Where accounts differ">
            <div className="measure space-y-6">
              <SkeletonParagraph lines={3} />
              <SkeletonParagraph lines={3} />
            </div>
          </SectionSkeleton>
        )}
        {explainer && (explainer.perspectives?.length ?? 0) > 0 && (
          <Section
            id="perspectives"
            title="Where accounts differ"
            note="Drawn partly from other-language articles on the same subject, where national historiographies diverge."
          >
            <div className="measure space-y-7">
              {explainer.perspectives.map((p) => (
                <article key={p.label}>
                  <h3 className="display text-lg font-semibold">{p.label}</h3>
                  <p className="mt-0.5 text-sm italic text-ink-muted">{p.stance}</p>
                  <p className="mt-2 leading-relaxed text-ink">{p.body}</p>
                  <ul className="mt-3">
                    <ClaimBlock claim={p.evidence} />
                  </ul>
                </article>
              ))}
            </div>
          </Section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="comparisons" title="For comparison">
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonParagraph lines={4} />
              <SkeletonParagraph lines={4} />
            </div>
          </SectionSkeleton>
        )}
        {explainer && (explainer.comparisons?.length ?? 0) > 0 && facts && entity && (
          <Section
            id="comparisons"
            title="For comparison"
            note="Better-known subjects that give you a foothold. The chart is Wikidata; the reading of them is Claude's."
          >
            <div className="mb-8">
              <ComparisonChart
                facts={facts}
                type={entity.type}
                comparisons={explainer.comparisons}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {explainer.comparisons.map((c) => (
                <article key={c.entity.title} className="rounded-xl border border-rule bg-paper-raised p-4">
                  <EntityChip entity={c.entity} />
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{c.angle}</p>
                  {c.similarities.length > 0 && (
                    <ListBlock label="Alike" items={c.similarities} />
                  )}
                  {c.differences.length > 0 && (
                    <ListBlock label="Unalike" items={c.differences} />
                  )}
                </article>
              ))}
            </div>
          </Section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="context" title="How it connects">
            <SkeletonParagraph lines={5} />
          </SectionSkeleton>
        )}
        {explainer && (explainer.context?.length ?? 0) > 0 && (
          <Section
            id="context"
            title="How it connects"
            note="Green links come from the Wikidata graph. Grey ones were proposed by Claude and checked against Wikipedia."
          >
            <ul className="space-y-2">
              {explainer.context.map((link) => (
                <li key={link.entity.title} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="section-label shrink-0"
                    style={{ color: link.fromGraph ? 'var(--verified)' : undefined }}
                  >
                    {RELATION_LABEL[link.relation]}
                  </span>
                  <Link
                    href={explainHref(link.entity.title)}
                    className="font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:text-accent"
                  >
                    {link.entity.title}
                  </Link>
                  {link.note && <span className="text-sm text-ink-muted">— {link.note}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="glossary" title="Words you may not know">
            <div className="measure">
              <SkeletonParagraph lines={4} />
            </div>
          </SectionSkeleton>
        )}
        {explainer && (explainer.glossary?.length ?? 0) > 0 && (
          <Section id="glossary" title="Words you may not know">
            <dl className="measure space-y-3">
              {explainer.glossary.map((g) => (
                <div key={g.term}>
                  <dt className="inline font-semibold text-ink">{g.term}. </dt>
                  <dd className="inline text-ink-muted">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {awaitingStructured && (
          <SectionSkeleton id="go-deeper" title="Go deeper">
            <SkeletonChips count={6} />
          </SectionSkeleton>
        )}
        {explainer && (explainer.drilldown?.length ?? 0) > 0 && (
          <Section id="go-deeper" title="Go deeper" note="Each of these runs the same research from scratch.">
            <EntityChipRow entities={explainer.drilldown} />
          </Section>
        )}

        {sources.length > 0 && (
          <Section
            id="sources"
            title={`Everything that was read (${sources.length})`}
            note="The complete corpus. Nothing outside this list was available to Claude."
          >
            <ol className="space-y-1.5 text-sm">
              {sources.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-8 shrink-0 tabular-nums text-ink-faint">{s.id}</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-ink-muted underline decoration-rule underline-offset-4 hover:text-accent"
                  >
                    {s.publisher}
                    {s.section ? ` — ${s.section}` : ''}
                    {s.truncated ? ' (excerpt)' : ''}
                  </a>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>

      <div className="mt-16 border-t border-rule pt-8">
        <p className="section-label mb-3">Explain something else</p>
        <div className="max-w-xl">
          <SearchBox />
        </div>
      </div>
        </>
      )}
    </main>
  );
}

const RELATION_LABEL: Record<string, string> = {
  precedes: 'Came before',
  follows: 'Came after',
  partOf: 'Part of',
  hasPart: 'Contains',
  causes: 'Led to',
  causedBy: 'Caused by',
  participantIn: 'Took part in',
};

/**
 * The narrative call emits "## SUMMARY" and "## WHY IT MATTERS" so the two
 * halves can be separated once complete. Mid-stream there is no complete
 * document to split, so the markers are simply hidden and the text flows as
 * one block until the final event arrives and it is laid out properly.
 */
function stripHeadings(text: string): string {
  return text.replace(/^##\s*.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 border-t-2 pt-4" style={{ borderColor: 'var(--gold-soft)' }}>
        <h2 className="display text-xl font-semibold">{title}</h2>
        {note && <p className="mt-1 max-w-xl text-sm text-ink-faint">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function RelationshipSection({ children }: { children: ReactNode }) {
  return (
    <Section
      id="connections"
      title="Who and what was connected"
      note="Structure from Wikidata; the people and the nature of each relationship from Claude, checked against Wikipedia."
    >
      <div className="rounded-xl border border-rule bg-paper-raised p-6">{children}</div>
    </Section>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="section-label">{label}</p>
      <ul className="mt-1 space-y-1 text-sm text-ink-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="text-ink-faint">
              &middot;
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorPanel({ query, message, code }: { query: string; message: string; code?: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl grow px-6 py-20">
      <Link href="/" className="text-sm text-ink-faint hover:text-accent">
        &larr; History Demystified
      </Link>
      <h1 className="display mt-6 text-3xl font-semibold">
        {code === 'not_found' || code === 'ambiguous'
          ? `Nothing solid found for “${query}”`
          : 'That did not work'}
      </h1>
      <p className="mt-3 leading-relaxed text-ink-muted">{message}</p>
      <div className="mt-8">
        <SearchBox initial={query} autoFocus />
      </div>
    </main>
  );
}
