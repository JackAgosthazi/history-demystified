'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { graphDateToTime } from '@/lib/core/connectors/wikidata';
import type { TimelineEvent } from '@/lib/core/types';
import { explainHref } from './Entities';

/**
 * Every bar here is Wikidata, not Claude.
 *
 * Dates are the single easiest thing for a language model to get plausibly
 * wrong, so they are never asked for. Spans come from P580/P582 qualifiers,
 * which is why overlapping tenures show as overlapping bars rather than a
 * tidied-up sequence — Napoleon really was Emperor of the French and monarch
 * of Italy at the same time.
 */

/** Gold marks the subject itself; lapis marks everything it did. */
const KIND_COLOUR: Record<TimelineEvent['kind'], string> = {
  life: 'var(--gold-bright)',
  period: 'var(--gold-bright)',
  position: 'var(--accent)',
  battle: 'var(--unverified)',
  event: 'var(--graph)',
  related: 'var(--ink-faint)',
};

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAYS_PER_MONTH = 30.436875;
const DAYS_PER_YEAR = 365.25;

function partsOf(time: number): { year: number; month: number } {
  const year = Math.floor(time);
  const month = Math.min(11, Math.floor(((time - year) * DAYS_PER_YEAR) / DAYS_PER_MONTH));
  return { year, month };
}

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

export interface AxisTick {
  at: number;
  label: string;
}

/**
 * Ticks in whatever unit the span actually calls for.
 *
 * A one-day battle, a 116-year war and a three-century period cannot share a
 * tick unit. The axis picks months when the whole subject fits inside a few
 * years, and years or a rounded multiple of years otherwise.
 */
export function buildTicks(min: number, max: number): AxisTick[] {
  const span = max - min;

  if (span <= 4) {
    const stepMonths = Math.max(1, Math.round((span * 12) / 5));
    const ticks: AxisTick[] = [];
    let { year, month } = partsOf(min);

    for (let guard = 0; guard < 32; guard++) {
      const at = year + (month * DAYS_PER_MONTH) / DAYS_PER_YEAR;
      if (at > max) break;
      if (at >= min) {
        // The year is carried on the first tick and whenever it rolls over,
        // so the axis reads "Mar 1815, May, Jul" rather than repeating it.
        const showYear = ticks.length === 0 || month < stepMonths;
        ticks.push({
          at,
          label: showYear ? `${MONTHS_SHORT[month]} ${year}` : MONTHS_SHORT[month],
        });
      }
      month += stepMonths;
      while (month > 11) {
        month -= 12;
        year += 1;
      }
    }
    if (ticks.length >= 2) return ticks;
  }

  const rawStep = Math.max(1, span / 5);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((v) => v >= rawStep) ?? magnitude * 10;

  const ticks: AxisTick[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) {
    ticks.push({ at: y, label: formatYear(Math.round(y)) });
  }
  return ticks;
}

interface HoverCard {
  event: TimelineEvent;
  x: number;
  y: number;
}

/**
 * Summaries fetched for hover cards, kept for the life of the page.
 *
 * Wikidata descriptions are a single terse line — "1600 battle" — which is
 * not enough to save a reader the trip. The article's opening sentences are,
 * and they are fetched only for what is actually hovered.
 */
const summaryCache = new Map<string, string>();

/**
 * Whether the device can actually hover.
 *
 * On a touch screen a single tap fires mouseenter and click together, so
 * "hover to preview, click to open" collapses into one gesture and tapping a
 * bar to read about it navigates away instead. Touch gets an explicit
 * two-step: tap opens the card, the link inside it opens the subject.
 */
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

function subscribeToHover(onChange: () => void): () => void {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useCanHover(): boolean {
  // A media query is a subscribable external store, which is what this hook
  // is for. Reading it through an effect would set state on mount and cause
  // the cascading render the compiler warns about.
  return useSyncExternalStore(
    subscribeToHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => true, // Server render assumes a pointer; touch corrects on hydration.
  );
}

function useSummary(title: string | undefined): string | null {
  /*
   * State is keyed by the title it belongs to, so switching rows needs no
   * synchronous reset: a stale entry simply does not match and reads as
   * absent. The only setState happens once the fetch resolves.
   */
  const [fetched, setFetched] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    if (!title || summaryCache.has(title)) return;

    const controller = new AbortController();
    void fetch(`/api/summary?title=${encodeURIComponent(title)}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ extract?: string }>)
      .then(({ extract }) => {
        summaryCache.set(title, extract ?? '');
        if (!controller.signal.aborted) setFetched({ title, text: extract ?? '' });
      })
      .catch(() => {
        // A hover that fails silently falls back to the one-line description.
      });

    return () => controller.abort();
  }, [title]);

  if (!title) return null;
  return summaryCache.get(title) ?? (fetched?.title === title ? fetched.text : null);
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  /*
   * Fixed positioning, not an absolutely positioned child. The chart scrolls
   * horizontally on narrow screens, and a scroll container clips on both axes
   * whatever the overflow rules say, so an in-flow tooltip gets cut off.
   */
  const [hover, setHover] = useState<HoverCard | null>(null);
  const summary = useSummary(hover?.event.title);
  const canHover = useCanHover();

  const show = useCallback((event: TimelineEvent, target: Element) => {
    const rect = target.getBoundingClientRect();
    setHover({ event, x: rect.left, y: rect.bottom });
  }, []);

  // On touch, dismiss the card by tapping anywhere else.
  useEffect(() => {
    if (canHover || !hover) return;
    const dismiss = () => setHover(null);
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [canHover, hover]);

  if (events.length === 0) return null;

  const times = events.flatMap((e) => [graphDateToTime(e.date), e.endDate ? graphDateToTime(e.endDate) : graphDateToTime(e.date)]);
  const rawMin = Math.min(...times);
  const rawMax = Math.max(...times);
  // A subject with a single dated moment still needs an axis to sit on.
  const observed = rawMax - rawMin;
  const pad = observed > 0 ? observed * 0.06 : 0.25;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const pct = (time: number) => Math.min(100, Math.max(0, ((time - min) / range) * 100));
  const ticks = buildTicks(min, max);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[34rem]">
        <div className="relative mb-2 h-4 border-b border-rule">
          {ticks.map((tick, i) => {
            const at = pct(tick.at);
            const edge = i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'mid';
            return (
              <span
                key={`${tick.at}-${tick.label}`}
                className="absolute whitespace-nowrap text-[0.65rem] tabular-nums text-ink-faint"
                style={
                  edge === 'right'
                    ? { right: `${Math.max(0, 100 - at)}%` }
                    : edge === 'left'
                      ? { left: `${at}%` }
                      : { left: `${at}%`, transform: 'translateX(-50%)' }
                }
              >
                {tick.label}
              </span>
            );
          })}
        </div>

        <ol className="relative space-y-1.5">
          {ticks.map((tick) => (
            <div
              key={`${tick.at}-${tick.label}`}
              aria-hidden
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${pct(tick.at)}%`, background: 'var(--rule)' }}
            />
          ))}

          {events.map((event) => {
            const start = pct(graphDateToTime(event.date));
            const end = event.endDate ? pct(graphDateToTime(event.endDate)) : start;
            const width = Math.max(end - start, 0.6);
            const label = event.endDate
              ? `${event.date.display} – ${event.endDate.display}`
              : event.date.display;
            const spaceAfter = 100 - (start + width) > 22;
            const overlapsBar = !spaceAfter && start <= 22;

            return (
              <li
                key={event.id}
                className="relative h-7"
                onMouseEnter={canHover ? (e) => show(event, e.currentTarget) : undefined}
                onMouseLeave={canHover ? () => setHover(null) : undefined}
                onFocus={(e) => show(event, e.currentTarget)}
                onBlur={canHover ? () => setHover(null) : undefined}
                /*
                 * Capture phase, so the tap never reaches the label's link.
                 * Letting it through is what made tapping a bar to read about
                 * it navigate somewhere else instead.
                 */
                onClickCapture={
                  canHover
                    ? undefined
                    : (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        show(event, e.currentTarget);
                      }
                }
                onPointerDownCapture={canHover ? undefined : (e) => e.stopPropagation()}
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                  style={{
                    left: `${start}%`,
                    width: `${width}%`,
                    height: event.endDate ? '0.7rem' : '0.55rem',
                    minWidth: event.endDate ? undefined : '0.55rem',
                    background: KIND_COLOUR[event.kind],
                    opacity: event.kind === 'related' ? 0.55 : 0.85,
                    borderRadius: event.endDate ? '0.15rem' : '999px',
                  }}
                  title={`${event.label} · ${label}`}
                />
                <span
                  className={`absolute top-1/2 -translate-y-1/2 truncate text-xs text-ink ${
                    overlapsBar ? 'rounded px-1.5 py-0.5' : ''
                  }`}
                  /*
                   * Placed wherever there is room, and sized to it. A bar that
                   * spans most of the axis leaves nowhere beside it, so the
                   * label goes on top — and then it needs its own ground.
                   * Reading dark text off a saturated bar is a contrast
                   * problem that would recur for every bar colour, so text
                   * never sits directly on one.
                   */
                  style={
                    overlapsBar
                      ? {
                          left: `${start}%`,
                          marginLeft: '0.25rem',
                          maxWidth: '94%',
                          background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
                        }
                      : spaceAfter
                        ? {
                            left: `${start + width}%`,
                            paddingLeft: '0.5rem',
                            maxWidth: `${100 - (start + width)}%`,
                          }
                        : {
                            right: `${100 - start}%`,
                            paddingRight: '0.5rem',
                            textAlign: 'right',
                            maxWidth: `${start}%`,
                          }
                  }
                >
                  {event.title ? (
                    <Link
                      href={explainHref(event.title)}
                      className="underline decoration-rule-strong underline-offset-2 hover:text-accent"
                    >
                      {event.label}
                    </Link>
                  ) : (
                    event.label
                  )}
                  <span className="ml-1.5 text-ink-faint tabular-nums">{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {hover && (hover.event.note || summary || hover.event.title) && (
        <div
          role="tooltip"
          className={`fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-rule-strong bg-paper-raised p-3 shadow-lg ${
            canHover ? 'pointer-events-none' : ''
          }`}
          style={{
            left: Math.max(12, Math.min(hover.x, (globalThis.innerWidth ?? 1200) - 336)),
            top: hover.y + 6,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-ink">{hover.event.label}</p>
          <p className="mt-0.5 text-[0.65rem] tabular-nums text-ink-faint">
            {hover.event.date.display}
            {hover.event.endDate ? ` – ${hover.event.endDate.display}` : ''}
          </p>
          {/* The one-line description shows at once; the fuller summary
              replaces it when it arrives, so the card is never empty. */}
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            {summary || hover.event.note || 'Loading…'}
          </p>
          {hover.event.title ? (
            canHover ? (
              <p className="mt-1.5 text-[0.65rem] text-ink-faint">Click to explain in full</p>
            ) : (
              // On touch the card is the only way in, so it carries the link.
              <Link
                href={explainHref(hover.event.title)}
                className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
              >
                Explain {hover.event.title} in full &rarr;
              </Link>
            )
          ) : (
            /*
             * Some Wikidata items have no English article — "French co-prince
             * of Andorra" among them. Saying so beats a card that looks like
             * its link failed to load.
             */
            <p className="mt-1.5 text-[0.65rem] text-ink-faint">
              No separate article for this one
            </p>
          )}
        </div>
      )}
    </div>
  );
}
