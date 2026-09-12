'use client';

import Link from 'next/link';
import { useState } from 'react';
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

export function Timeline({ events }: { events: TimelineEvent[] }) {
  /*
   * Fixed positioning, not an absolutely positioned child. The chart scrolls
   * horizontally on narrow screens, and a scroll container clips on both axes
   * whatever the overflow rules say, so an in-flow tooltip gets cut off.
   */
  const [hover, setHover] = useState<HoverCard | null>(null);

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
          {ticks.map((year) => (
            <span
              key={year}
              className="absolute -translate-x-1/2 text-[0.65rem] tabular-nums text-ink-faint"
              style={{ left: `${pct(year)}%` }}
            >
              {formatYear(year)}
            </span>
          ))}
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

            const show = (target: EventTarget & Element) => {
              const rect = target.getBoundingClientRect();
              setHover({ event, x: rect.left, y: rect.bottom });
            };

            return (
              <li
                key={event.id}
                className="relative h-7"
                onMouseEnter={(e) => show(e.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => show(e.currentTarget)}
                onBlur={() => setHover(null)}
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
                  className="absolute top-1/2 max-w-[46%] -translate-y-1/2 truncate text-xs text-ink"
                  style={
                    start > 55
                      ? { right: `${100 - start}%`, paddingRight: '0.5rem', textAlign: 'right' }
                      : { left: `${Math.min(start + width, 96)}%`, paddingLeft: '0.5rem' }
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

      {hover?.event.note && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-72 rounded-lg border border-rule-strong bg-paper-raised p-3 shadow-lg"
          style={{
            left: Math.min(hover.x, (globalThis.innerWidth ?? 1200) - 300),
            top: hover.y + 6,
          }}
        >
          <p className="text-xs font-semibold text-ink">{hover.event.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hover.event.note}</p>
          {hover.event.title && (
            <p className="mt-1.5 text-[0.65rem] text-ink-faint">Click to explain in full</p>
          )}
        </div>
      )}
    </div>
  );
}
