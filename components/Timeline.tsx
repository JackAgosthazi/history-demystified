import type { TimelineEvent } from '@/lib/core/types';

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

export function Timeline({ events }: { events: TimelineEvent[] }) {
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

            return (
              <li key={event.id} className="relative h-7">
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
                  {event.label}
                  <span className="ml-1.5 text-ink-faint tabular-nums">{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
