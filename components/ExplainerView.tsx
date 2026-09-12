'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useExplainer, type Stage } from '@/lib/client/useExplainer';
import { EntityChip, EntityChipRow, explainHref } from './Entities';
import { Prose } from './Prose';
import { Relationships } from './Relationships';
import { SearchBox } from './SearchBox';
import { SurveyView } from './SurveyView';
import { KeyEvents } from './KeyEvents';
import { Timeline } from './Timeline';
import { ClaimBlock, CoverageBadge } from './Verification';

const STAGE_TEXT: Record<Stage, string> = {
  idle: '',
  surveying: 'Searching the record for that place and period',
  resolving: 'Finding the subject',
  gathering: 'Reading sources',
  synthesizing: 'Writing the explanation',
  verifying: 'Checking every quote against its source',
  done: '',
  error: '',
};

export function ExplainerView({ query }: { query: string }) {
  const state = useExplainer(query);
  const { entity, facts, sources, explainer, survey, stage, error } = state;

  if (error) return <ErrorPanel query={query} message={error.message} code={error.code} />;

  return (
    <main className="mx-auto w-full max-w-4xl grow px-6 py-10">
      <nav className="mb-8 flex items-center gap-3 text-sm">
        <Link href="/" className="text-ink-faint hover:text-accent">
          History Demystified
        </Link>
        <span className="text-ink-faint">/</span>
        <span className="truncate text-ink-muted">{entity?.title ?? query}</span>
      </nav>

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

        {stage !== 'done' && <Progress stage={stage} detail={state.detail} />}

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
        {(state.prose || state.lead) && (
          <section className="measure">
            <Prose
              text={explainer ? explainer.summary : stripHeadings(state.prose || state.lead)}
              sources={sources}
              streaming={stage === 'synthesizing' && Boolean(state.prose)}
            />
          </section>
        )}

        {explainer?.whyItMatters && (
          <Section title="Why it matters">
            <div className="measure">
              <Prose text={explainer.whyItMatters} sources={sources} />
            </div>
          </Section>
        )}

        {explainer && (explainer.takeaways?.length ?? 0) > 0 && (
          <Section
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

        {explainer && (explainer.keyEvents?.length ?? 0) > 0 && (
          <Section
            title="How it unfolded"
            note="The moments after which things were different. Dates are from Wikidata; each one you can open."
          >
            <KeyEvents events={explainer.keyEvents ?? []} />
          </Section>
        )}

        {facts && facts.timeline.length > 0 && (
          <Section title="Timeline" note="Drawn from Wikidata, not written by Claude.">
            <Timeline events={facts.timeline} />
          </Section>
        )}

        {facts && entity && (
          <RelationshipSection>
            <Relationships facts={facts} type={entity.type} figures={explainer?.figures} />
          </RelationshipSection>
        )}

        {explainer && (explainer.perspectives?.length ?? 0) > 0 && (
          <Section
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

        {explainer && (explainer.comparisons?.length ?? 0) > 0 && (
          <Section title="For comparison" note="Better-known subjects that give you a foothold.">
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

        {explainer && (explainer.context?.length ?? 0) > 0 && (
          <Section
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

        {explainer && (explainer.glossary?.length ?? 0) > 0 && (
          <Section title="Words you may not know">
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

        {explainer && (explainer.drilldown?.length ?? 0) > 0 && (
          <Section title="Go deeper" note="Each of these runs the same research from scratch.">
            <EntityChipRow entities={explainer.drilldown} />
          </Section>
        )}

        {sources.length > 0 && (
          <Section
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

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 border-t border-rule pt-4">
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

function Progress({ stage, detail }: { stage: Stage; detail?: string }) {
  const text = STAGE_TEXT[stage];
  if (!text) return null;
  return (
    <p className="mt-5 flex items-center gap-2.5 text-sm text-ink-muted" aria-live="polite">
      <span
        aria-hidden
        className="inline-block h-2 w-2 animate-pulse rounded-full"
        style={{ background: 'var(--accent)' }}
      />
      {text}
      {detail && <span className="text-ink-faint">— {detail}</span>}
    </p>
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
