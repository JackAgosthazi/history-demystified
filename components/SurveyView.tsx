import Link from 'next/link';
import type { Survey, SurveyItem } from '@/lib/core/types';
import { explainHref } from './Entities';

/**
 * The answer to a scope query: a place, a stretch of time, and a way in.
 *
 * Nothing on this page came from a language model. It is a Wikidata query,
 * ranked by how many language editions cover each subject, which is a crude
 * but honest proxy for how significant it is. The reader picks a door and
 * gets the full explainer behind it.
 */
export function SurveyView({ survey }: { survey: Survey }) {
  return (
    <>
      <header className="measure">
        <h1 className="display text-4xl font-semibold sm:text-[2.75rem]">
          {survey.place.label}, {survey.rendered}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-muted">
          What the historical record has for {survey.place.label} between {survey.from} and{' '}
          {survey.to}, ordered by how widely each subject is written about. Open any of them for
          the full explanation.
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          Assembled directly from Wikidata. No part of this list was written by Claude.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <SurveyList
          title="What happened"
          empty="Wikidata records no notable events for this place and period."
          items={survey.events}
        />
        <SurveyList
          title="Who was there"
          empty="Wikidata records no notable people for this place and period."
          items={survey.people}
        />
      </div>
    </>
  );
}

function SurveyList({
  title,
  items,
  empty,
}: {
  title: string;
  items: SurveyItem[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="display border-t border-rule pt-4 text-xl font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule">
          {items.map((item) => (
            <li key={item.qid} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={explainHref(item.title)}
                  className="font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:text-accent"
                >
                  {item.label}
                </Link>
                {item.start && (
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                    {item.start.display}
                    {item.end ? ` – ${item.end.display}` : ''}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-0.5 text-sm text-ink-muted">{capitalize(item.description)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
