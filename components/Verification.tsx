import type { Claim, CoverageReport } from '@/lib/core/types';

/**
 * Verification is the product, so it is shown rather than asserted.
 *
 * Every claim exposes the exact span it rests on and a link that opens the
 * source scrolled to that sentence. Unverified claims stay on the page with
 * the reason attached: hiding them would make the coverage figure meaningless
 * and take the judgement away from the reader.
 */

export function CoverageBadge({ coverage }: { coverage: CoverageReport }) {
  if (coverage.total === 0) return null;
  const pct = Math.round(coverage.coverage * 100);
  const good = pct >= 80;

  return (
    <div
      className="inline-flex items-baseline gap-2 rounded-full border px-3 py-1.5 text-xs"
      style={{
        borderColor: good ? 'var(--verified)' : 'var(--unverified)',
        background: good ? 'var(--verified-soft)' : 'var(--unverified-soft)',
        color: good ? 'var(--verified)' : 'var(--unverified)',
      }}
      title={`${coverage.byMethod.exact} exact, ${coverage.byMethod.fuzzy} near-exact, ${coverage.byMethod.none} unmatched`}
    >
      <span className="font-semibold tabular-nums">{pct}%</span>
      <span>
        {coverage.verified} of {coverage.total} claims traced to a source
      </span>
    </div>
  );
}

export function ClaimBlock({ claim }: { claim: Claim }) {
  const v = claim.verification;
  const verified = v.status === 'verified';

  return (
    <li className="border-l-2 pl-4 py-1" style={{ borderColor: verified ? 'var(--verified)' : 'var(--unverified)' }}>
      <p className="text-[0.975rem] leading-relaxed text-ink">{claim.text}</p>

      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-xs text-ink-faint hover:text-ink-muted marker:hidden">
          <span
            className="font-medium"
            style={{ color: verified ? 'var(--verified)' : 'var(--unverified)' }}
          >
            {verified ? (v.method === 'exact' ? 'Verified' : 'Verified (near-exact)') : 'Unverified'}
          </span>
          <span className="mx-1.5">·</span>
          <span className="group-open:hidden">show the source text</span>
          <span className="hidden group-open:inline">hide</span>
        </summary>

        <div className="mt-2 rounded-md border border-rule bg-paper-sunken p-3 text-xs">
          <blockquote className="border-l-2 border-rule-strong pl-3 italic text-ink-muted">
            {claim.quote}
          </blockquote>
          {claim.quoteTranslation && (
            <p className="mt-2 pl-3 text-ink-faint">
              <span className="font-medium">Translation (not verified):</span> {claim.quoteTranslation}
            </p>
          )}
          {v.reason && (
            <p className="mt-2 pl-3" style={{ color: 'var(--unverified)' }}>
              {v.reason}
            </p>
          )}
          {v.citationUrl ? (
            <a
              href={v.citationUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2.5 inline-block pl-3 font-medium text-accent underline underline-offset-2"
            >
              Open {v.sourceTitle} at this sentence &rarr;
            </a>
          ) : (
            v.sourceUrl && (
              <a
                href={v.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2.5 inline-block pl-3 text-ink-faint underline underline-offset-2"
              >
                Open {v.sourceTitle} &rarr;
              </a>
            )
          )}
        </div>
      </details>
    </li>
  );
}
