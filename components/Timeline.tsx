'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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

const KIND_COLOUR: Record<TimelineEvent['kind'], string> = {
  life: 'var(--accent)',
  position: 'var(--graph)',
  event: 'var(--ink-muted)',
  battle: 'var(--accent)',
  period: 'var(--accent)',
  related: 'var(--ink-faint)',
};

function niceTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const rawStep = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y);
  return ticks;
}

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
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
function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCanHover(query.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return canHover;
}

function useSummary(title: string | undefined): string | null {
  const [summary, setSummary] = useState<string | null>(
    title ? (summaryCache.get(title) ?? null) : null,
  );
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!title) {
      setSummary(null);
      return;
    }
    const cached = summaryCache.get(title);
    if (cached !== undefined) {
      setSummary(cached);
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setSummary(null);

    void fetch(`/api/summary?title=${encodeURIComponent(title)}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ extract?: string }>)
      .then(({ extract }) => {
        summaryCache.set(title, extract ?? '');
        if (!controller.signal.aborted) setSummary(extract ?? '');
      })
      .catch(() => {
        // A hover that fails silently falls back to the one-line description.
      });

    return () => controller.abort();
  }, [title]);

  return summary;
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

  const years = events.flatMap((e) => [e.date.year, e.endDate?.year ?? e.date.year]);
  const rawMin = Math.min(...years);
  const rawMax = Math.max(...years);
  const pad = Math.max(1, (rawMax - rawMin) * 0.04);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const pct = (year: number) => Math.min(100, Math.max(0, ((year - min) / range) * 100));
  const ticks = niceTicks(rawMin, rawMax);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[34rem]">
        <div className="relative mb-2 h-4 border-b border-rule">
          {ticks.map((year, i) => {
            const at = pct(year);
            const edge = i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'mid';
            return (
              <span
                key={year}
                className="absolute whitespace-nowrap text-[0.65rem] tabular-nums text-ink-faint"
                style={
                  edge === 'right'
                    ? { right: `${Math.max(0, 100 - at)}%` }
                    : edge === 'left'
                      ? { left: `${at}%` }
                      : { left: `${at}%`, transform: 'translateX(-50%)' }
                }
              >
                {formatYear(year)}
              </span>
            );
          })}
        </div>

        <ol className="relative space-y-1.5">
          {ticks.map((year) => (
            <div
              key={year}
              aria-hidden
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${pct(year)}%`, background: 'var(--rule)' }}
            />
          ))}

          {events.map((event) => {
            const start = pct(event.date.year);
            const end = event.endDate ? pct(event.endDate.year) : start;
            const width = Math.max(end - start, 0.6);
            const label = event.endDate
              ? `${event.date.display} – ${event.endDate.display}`
              : event.date.display;

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
                  className="absolute top-1/2 -translate-y-1/2 truncate text-xs text-ink"
                  /*
                   * Put the label wherever there is actually room, and size it
                   * to that room. Always placing it after the bar pushed it
                   * off the right edge for anything long-running, and a fixed
                   * max-width still let it clip against the container.
                   */
                  style={
                    100 - (start + width) > 22
                      ? {
                          left: `${start + width}%`,
                          paddingLeft: '0.5rem',
                          maxWidth: `${100 - (start + width)}%`,
                        }
                      : start > 22
                        ? {
                            right: `${100 - start}%`,
                            paddingRight: '0.5rem',
                            textAlign: 'right',
                            maxWidth: `${start}%`,
                          }
                        : { left: `${start}%`, paddingLeft: '0.5rem', maxWidth: '96%' }
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
          {hover.event.title &&
            (canHover ? (
              <p className="mt-1.5 text-[0.65rem] text-ink-faint">Click to explain in full</p>
            ) : (
              // On touch the card is the only way in, so it carries the link.
              <Link
                href={explainHref(hover.event.title)}
                className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
              >
                Explain {hover.event.title} in full &rarr;
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
