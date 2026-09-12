import type { Comparison, EntityFacts, EntityType, GraphDate } from '@/lib/core/types';

/**
 * The subject and its comparisons on one time axis.
 *
 * This is the chart that does the most work for a newcomer, because the thing
 * they most reliably lack is a sense of when. Told that Cleopatra and Julius
 * Caesar were contemporaries, most people nod; shown their lifespans
 * overlapping on a scale that also carries the Renaissance, they actually
 * place them. Every bar is a Wikidata span — nothing here is inferred.
 */

interface Row {
  label: string;
  start: GraphDate;
  end?: GraphDate;
  subject: boolean;
}

const SUBJECT_NOUN: Record<EntityType, string> = {
  person: 'Lifespans',
  conflict: 'Duration',
  event: 'When they happened',
  period: 'Extent',
};

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

export function ComparisonChart({
  facts,
  type,
  comparisons,
}: {
  facts: EntityFacts;
  type: EntityType;
  comparisons: Comparison[];
}) {
  const rows: Row[] = [];
  if (facts.start) {
    rows.push({ label: facts.label, start: facts.start, end: facts.end, subject: true });
  }
  for (const c of comparisons) {
    if (c.start) rows.push({ label: c.entity.title, start: c.start, end: c.end, subject: false });
  }

  // One dated row compares nothing; the section is simply omitted.
  if (rows.length < 2) return null;

  const years = rows.flatMap((r) => [r.start.year, r.end?.year ?? r.start.year]);
  const rawMin = Math.min(...years);
  const rawMax = Math.max(...years);
  const pad = Math.max(2, (rawMax - rawMin) * 0.06);
  const min = rawMin - pad;
  const span = rawMax + pad - min || 1;
  const pct = (year: number) => ((year - min) / span) * 100;

  const ticks = [rawMin, Math.round((rawMin + rawMax) / 2), rawMax];

  return (
    <figure>
      <figcaption className="section-label mb-3">{SUBJECT_NOUN[type]} side by side</figcaption>
      <div className="rounded-xl border border-rule bg-paper-raised p-5">
        <div className="relative mb-3 h-4 border-b border-rule">
          {ticks.map((year, i) => {
            const at = pct(year);
            const edge = i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'mid';
            return (
              <span
                key={`${year}-${i}`}
                className="absolute whitespace-nowrap text-[0.65rem] tabular-nums text-ink-faint"
                style={
                  edge === 'right'
                    ? { right: 0 }
                    : edge === 'left'
                      ? { left: 0 }
                      : { left: `${at}%`, transform: 'translateX(-50%)' }
                }
              >
                {formatYear(year)}
              </span>
            );
          })}
        </div>

        <ul className="space-y-2.5">
          {rows.map((row) => {
            const left = pct(row.start.year);
            const right = pct(row.end?.year ?? row.start.year);
            const width = Math.max(right - left, 1.2);
            return (
              <li
                key={row.label}
                className="grid grid-cols-[5.5rem_1fr] items-center gap-2 sm:grid-cols-[9rem_1fr] sm:gap-3"
              >
                <span
                  className={`truncate text-xs ${row.subject ? 'font-semibold text-ink' : 'text-ink-muted'}`}
                  title={row.label}
                >
                  {row.label}
                </span>
                {/* Clips the absolutely positioned date label as a backstop:
                    on a 320px screen an unclipped nowrap label pushed the
                    whole document sideways. */}
                <span className="relative block h-5 overflow-hidden">
                  <span
                    className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      height: row.subject ? '0.8rem' : '0.6rem',
                      background: row.subject ? 'var(--accent)' : 'var(--graph)',
                      opacity: row.subject ? 0.95 : 0.6,
                    }}
                    title={`${row.start.display}${row.end ? ` – ${row.end.display}` : ''}`}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 truncate text-[0.65rem] tabular-nums text-ink-faint"
                    /* Placed wherever there is room, and sized to it. */
                    style={
                      100 - (left + width) > 30
                        ? {
                            left: `${left + width}%`,
                            paddingLeft: '0.4rem',
                            maxWidth: `${100 - (left + width)}%`,
                          }
                        : left > 30
                          ? {
                              right: `${100 - left}%`,
                              paddingRight: '0.4rem',
                              textAlign: 'right',
                              maxWidth: `${left}%`,
                            }
                          : { left: 0, paddingLeft: '0.4rem', maxWidth: '100%' }
                    }
                  >
                    {row.start.display}
                    {row.end ? ` – ${row.end.display}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}
