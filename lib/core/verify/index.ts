import type { Claim, CoverageReport, MatchMethod, SourceDoc } from '../types';
import { buildTextFragment } from './fragment';
import { checkRelevance, findQuote } from './match';

export { normalize, toSourceSpan } from './normalize';
export { findQuote, checkRelevance } from './match';
export { buildTextFragment } from './fragment';

/** What the model produces; `verification` is added here. */
export interface RawClaim {
  id: string;
  text: string;
  sourceId: string;
  quote: string;
  quoteTranslation?: string;
}

export interface VerifyOutcome {
  claims: Claim[];
  coverage: CoverageReport;
}

/**
 * Check every claim against the corpus it was supposed to come from.
 *
 * Claims that fail are kept and labelled rather than dropped. Hiding them
 * would inflate the coverage score into a meaningless 100% and take away the
 * reader's ability to judge; the honest version shows the reader exactly
 * which sentences the pipeline could not stand behind.
 */
export function verifyClaims(rawClaims: RawClaim[], sources: SourceDoc[]): VerifyOutcome {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const claims: Claim[] = [];

  for (const raw of rawClaims) {
    const source = byId.get(raw.sourceId);

    if (!source) {
      claims.push({
        ...raw,
        verification: {
          status: 'unverified',
          method: 'none',
          score: 0,
          reason: `Cites ${raw.sourceId}, which is not one of the retrieved sources.`,
        },
      });
      continue;
    }

    const base = { sourceTitle: source.title, sourceUrl: source.url };
    const match = findQuote(raw.quote, source.text);

    if (!match) {
      claims.push({
        ...raw,
        verification: {
          status: 'unverified',
          method: 'none',
          score: 0,
          reason: source.truncated
            ? 'Quote not found in the retrieved excerpt; the source was truncated to fit the budget.'
            : 'Quote does not appear in the cited source.',
          ...base,
        },
      });
      continue;
    }

    const relevance = checkRelevance(raw.text, source.text, match);
    if (!relevance.ok) {
      claims.push({
        ...raw,
        verification: {
          status: 'unverified',
          method: match.method,
          score: relevance.ratio,
          reason: `Quote found, but the surrounding text does not mention ${relevance.missing
            .slice(0, 3)
            .join(', ')}.`,
          ...base,
        },
      });
      continue;
    }

    claims.push({
      ...raw,
      verification: {
        status: 'verified',
        method: match.method,
        score: match.score,
        citationUrl: buildTextFragment(source.url, source.text.slice(match.start, match.end)),
        ...base,
      },
    });
  }

  return { claims, coverage: summarize(claims) };
}

function summarize(claims: Claim[]): CoverageReport {
  const byMethod: Record<MatchMethod, number> = { exact: 0, fuzzy: 0, none: 0 };
  let verified = 0;
  for (const c of claims) {
    byMethod[c.verification.method]++;
    if (c.verification.status === 'verified') verified++;
  }
  return {
    total: claims.length,
    verified,
    coverage: claims.length === 0 ? 0 : verified / claims.length,
    byMethod,
  };
}
