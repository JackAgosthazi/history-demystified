import Link from 'next/link';
import type { KeyEvent } from '@/lib/core/types';
import { explainHref } from './Entities';

/**
 * The narrative spine of a conflict or a period.
 *
 * A timeline shows when things happened; this says what changed because of
 * them, which is what a newcomer is actually missing. The label and the
 * significance come from Claude, the date from Wikidata, and an event whose
 * article cannot be found still appears — undated and unlinked, which is the
 * honest presentation of what is known about it.
 */
export function KeyEvents({ events }: { events: KeyEvent[] }) {
  if (events.length === 0) return null;

  return (
    <ol className="relative space-y-6 border-l border-rule pl-6">
      {events.map((event, i) => (
        <li key={`${event.label}-${i}`} className="relative">
          <span
            aria-hidden
            className="absolute -left-[1.9rem] top-1.5 h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: 'var(--accent)', background: 'var(--paper)' }}
          />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="display text-lg font-semibold text-ink">
              {event.entity ? (
                <Link href={explainHref(event.entity.title)} className="hover:text-accent">
                  {event.label}
                </Link>
              ) : (
                event.label
              )}
            </h3>
            {event.date && (
              <span className="text-sm tabular-nums text-ink-faint">{event.date.display}</span>
            )}
          </div>
          <p className="mt-1 max-w-2xl leading-relaxed text-ink-muted">{event.summary}</p>
        </li>
      ))}
    </ol>
  );
}
