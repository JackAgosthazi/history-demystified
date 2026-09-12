import { normalize, toSourceSpan, type Normalized } from './normalize';

export interface MatchResult {
  method: 'exact' | 'fuzzy';
  /** 0..1. Exact matches score 1. */
  score: number;
  /** Span in the RAW source text, suitable for building a link. */
  start: number;
  end: number;
}

/**
 * A quote shorter than this proves nothing: "in 1815" appears in half the
 * corpus, so matching it is not evidence that the claim is supported.
 */
const MIN_QUOTE_CHARS = 25;
const GRAM_SIZE = 3;
/** Share of the quote's word trigrams that must appear in the window. */
const FUZZY_THRESHOLD = 0.8;
/**
 * Candidate window size, as a multiple of the quote length.
 *
 * The window has to hold the quote *plus* whatever the source contains that
 * the quote left out — the omitted text lives in the source, not the quote,
 * so a window sized to the quote alone pushes the tail of a spliced match out
 * of range and scores a genuine match as a miss. The multiple still enforces
 * locality: a quote cannot be assembled from opposite ends of a section.
 */
const WINDOW_GROWTH = 1.8;
const WINDOW_CONSTANT = 8;

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function grams(tokens: Token[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + GRAM_SIZE <= tokens.length; i++) {
    out.push(tokens.slice(i, i + GRAM_SIZE).map((t) => t.word).join(' '));
  }
  return out;
}

/**
 * Locate a quoted span inside a source document.
 *
 * Exact matching after normalization handles most cases. The fallback exists
 * because the common failure is not invention but splicing — the model joins
 * two clauses or drops a parenthetical while copying. Word-trigram
 * containment tolerates that without tolerating a rewrite, and it is linear
 * and easy to explain, unlike an edit-distance threshold.
 */
export function findQuote(quote: string, sourceText: string): MatchResult | null {
  const nq = normalize(quote);
  const nd = normalize(sourceText);
  if (nq.text.length < MIN_QUOTE_CHARS) return null;

  const exact = nd.text.indexOf(nq.text);
  if (exact !== -1) {
    const span = toSourceSpan(nd, exact, exact + nq.text.length, sourceText.length);
    return { method: 'exact', score: 1, ...span };
  }

  return fuzzyMatch(nq, nd, sourceText);
}

function fuzzyMatch(nq: Normalized, nd: Normalized, sourceText: string): MatchResult | null {
  const quoteTokens = tokenize(nq.text);
  const docTokens = tokenize(nd.text);
  const quoteGrams = grams(quoteTokens);
  if (quoteGrams.length < 2 || docTokens.length < GRAM_SIZE) return null;

  // Index the document's trigrams by word position.
  const docGrams = new Map<string, number[]>();
  for (let i = 0; i + GRAM_SIZE <= docTokens.length; i++) {
    const key = docTokens.slice(i, i + GRAM_SIZE).map((t) => t.word).join(' ');
    const list = docGrams.get(key);
    if (list) list.push(i);
    else docGrams.set(key, [i]);
  }

  // Each shared trigram votes for the window start it implies.
  const votes = new Map<number, number>();
  quoteGrams.forEach((gram, qi) => {
    for (const di of docGrams.get(gram) ?? []) {
      const start = Math.max(0, di - qi);
      votes.set(start, (votes.get(start) ?? 0) + 1);
    }
  });
  if (votes.size === 0) return null;

  const candidates = [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([start]) => start);

  const windowLength = Math.ceil(quoteTokens.length * WINDOW_GROWTH) + WINDOW_CONSTANT;
  let best: MatchResult | null = null;

  for (const start of candidates) {
    const end = Math.min(docTokens.length, start + windowLength);
    const windowGrams = new Set<string>();
    for (let i = start; i + GRAM_SIZE <= end; i++) {
      windowGrams.add(docTokens.slice(i, i + GRAM_SIZE).map((t) => t.word).join(' '));
    }

    let matched = 0;
    let firstWord = Infinity;
    let lastWord = -1;
    quoteGrams.forEach((gram) => {
      if (!windowGrams.has(gram)) return;
      matched++;
      for (const di of docGrams.get(gram) ?? []) {
        if (di >= start && di < end) {
          firstWord = Math.min(firstWord, di);
          lastWord = Math.max(lastWord, di + GRAM_SIZE - 1);
        }
      }
    });

    const score = matched / quoteGrams.length;
    if (score < FUZZY_THRESHOLD || lastWord < 0) continue;
    if (best && score <= best.score) continue;

    const span = toSourceSpan(
      nd,
      docTokens[firstWord].start,
      docTokens[Math.min(lastWord, docTokens.length - 1)].end,
      sourceText.length,
    );
    best = { method: 'fuzzy', score, ...span };
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * Relevance
 * ------------------------------------------------------------------ */

/** Capitalised words that start sentences rather than name anything. */
const CAPITALISED_STOPWORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'a', 'an', 'in', 'on', 'at', 'by',
  'it', 'he', 'she', 'they', 'his', 'her', 'their', 'its', 'after', 'before',
  'during', 'when', 'while', 'although', 'however', 'but', 'and', 'for',
  'from', 'with', 'as', 'was', 'were', 'is', 'are', 'had', 'has', 'have',
  'both', 'many', 'most', 'some', 'several', 'over', 'under', 'between',
]);

const MIN_SALIENT_OVERLAP = 0.5;
/** How far either side of the match still counts as supporting context. */
const CONTEXT_CHARS = 200;

export interface RelevanceResult {
  ok: boolean;
  ratio: number;
  missing: string[];
}

/**
 * Check that the quote actually bears on the claim.
 *
 * A substring check only proves the quote exists in the source. The failure
 * it cannot see is a real quote attached to an assertion it does not support,
 * which is the more damaging error. Comparing the claim's proper nouns and
 * figures against the matched region catches that cheaply.
 */
export function checkRelevance(
  claim: string,
  sourceText: string,
  span: { start: number; end: number },
): RelevanceResult {
  const salient = new Set<string>();
  for (const m of claim.matchAll(/\b\d[\d,.]*\b/g)) salient.add(m[0].replace(/[,.]$/, '').toLowerCase());
  for (const m of claim.matchAll(/\b\p{Lu}[\p{L}'-]{2,}\b/gu)) {
    const word = m[0].toLowerCase();
    if (!CAPITALISED_STOPWORDS.has(word)) salient.add(word);
  }
  if (salient.size === 0) return { ok: true, ratio: 1, missing: [] };

  const window = normalize(
    sourceText.slice(
      Math.max(0, span.start - CONTEXT_CHARS),
      Math.min(sourceText.length, span.end + CONTEXT_CHARS),
    ),
  ).text;

  const missing: string[] = [];
  let present = 0;
  for (const token of salient) {
    // Match a prefix so "Napoleon's" in the claim finds "Napoleon" in source.
    const stem = token.length > 5 ? token.slice(0, Math.ceil(token.length * 0.7)) : token;
    if (window.includes(stem)) present++;
    else missing.push(token);
  }

  const ratio = present / salient.size;
  return { ok: ratio >= MIN_SALIENT_OVERLAP, ratio, missing };
}
