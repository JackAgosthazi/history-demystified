/**
 * Placeholders for sections that are definitely coming.
 *
 * Only drawn for sections that reliably arrive — across the twelve
 * pre-generated topics every one of them is populated every time, except key
 * events, which appear for conflicts, periods and events but never for a
 * person. Promising a section that then fails to appear would be worse than
 * showing nothing.
 */

export function SkeletonLine({ width = '100%', height = '0.85rem' }: { width?: string; height?: string }) {
  return <span className="skeleton block" style={{ width, height }} aria-hidden />;
}

export function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '96%', '88%', '92%', '70%'];
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

export function SectionSkeleton({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" aria-busy="true">
      <div className="mb-4 border-t-2 pt-4" style={{ borderColor: 'var(--gold-soft)' }}>
        <h2 className="display flex items-center gap-2.5 text-xl font-semibold text-ink-faint">
          {title}
          <span
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: 'var(--accent)' }}
          />
        </h2>
      </div>
      {children ?? <SkeletonParagraph lines={3} />}
      <span className="sr-only">Loading {title}</span>
    </section>
  );
}

/** Stand-in for the claim list, which has a recognisable shape. */
export function SkeletonClaims({ count = 4 }: { count?: number }) {
  return (
    <ul className="measure space-y-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="border-l-2 border-rule pl-4 py-1 space-y-2">
          <SkeletonLine width="100%" />
          <SkeletonLine width="72%" />
          <SkeletonLine width="30%" height="0.6rem" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonChips({ count = 6 }: { count?: number }) {
  const widths = ['7rem', '9rem', '6rem', '11rem', '8rem', '10rem'];
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonLine key={i} width={widths[i % widths.length]} height="2rem" />
      ))}
    </div>
  );
}
