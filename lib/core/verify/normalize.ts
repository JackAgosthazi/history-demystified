/**
 * Text normalization with offset preservation.
 *
 * Both the model's quote and the source document are reduced to a canonical
 * form before comparison, because models silently tidy text as they copy it:
 * an en dash becomes a hyphen, a non-breaking space becomes a space, curly
 * quotes straighten, "[1]" citation markers vanish. Those are not
 * fabrications and should not be scored as such.
 *
 * The offset map is what makes the result useful rather than merely a
 * boolean: it lets a match in normalized space be projected back onto the raw
 * source text, which is what the "jump to this sentence" deep links need.
 */

export interface Normalized {
  text: string;
  /** map[i] is the index in the original string that produced text[i]. */
  map: number[];
}

const ZERO_WIDTH = /[\u200b-\u200f\u2060\ufeff\u00ad]/;
const SPACE_LIKE = /[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/;
const DASH_LIKE = /[\u2010-\u2015\u2212\u2043\ufe58\ufe63\uff0d]/;
const SINGLE_QUOTE_LIKE = /[\u2018\u2019\u201a\u201b\u2032\u00b4\u0060\u02bc]/;
const DOUBLE_QUOTE_LIKE = /[\u201c\u201d\u201e\u201f\u2033\u00ab\u00bb]/;
const ELLIPSIS = '\u2026';

const ENTITY_RE = /^&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,9});/;
/** Wikipedia footnote markers: [1], [23], [a], [note 2]. */
const REF_MARKER_RE = /^\[(\d{1,3}|[a-z]|note \d{1,3}|citation needed)\]/i;
/** One base character plus any combining marks, normalized as a unit. */
const CLUSTER_RE = /^\P{M}\p{M}*/u;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '-', mdash: '-', hellip: '...', laquo: '"', raquo: '"',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', deg: '\u00b0', times: '*',
};

function decodeEntity(entity: string): string | null {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const code = parseInt(entity.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  if (entity.startsWith('#')) {
    const code = parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  return NAMED_ENTITIES[entity] ?? null;
}

export function normalize(input: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  const push = (chars: string, srcIndex: number) => {
    for (const ch of chars) {
      out.push(ch);
      map.push(srcIndex);
    }
  };

  let i = 0;
  while (i < input.length) {
    const srcStart = i;
    const rest = input.slice(i, i + 24);

    const ref = REF_MARKER_RE.exec(rest);
    if (ref) {
      i += ref[0].length;
      continue;
    }

    const ent = ENTITY_RE.exec(rest);
    if (ent) {
      const decoded = decodeEntity(ent[1]);
      if (decoded !== null) {
        i += ent[0].length;
        // An entity that decodes to whitespace has to become a pending space
        // rather than an empty string, or "Lloyd&nbsp;George" would run
        // together into a single word and never match its source.
        if (/^\s*$/.test(decoded) || SPACE_LIKE.test(decoded)) {
          pendingSpace = out.length > 0;
          continue;
        }
        const sub = normalize(decoded);
        if (sub.text) {
          if (pendingSpace) push(' ', srcStart);
          pendingSpace = false;
          push(sub.text, srcStart);
        }
        continue;
      }
    }

    const cluster = CLUSTER_RE.exec(input.slice(i))?.[0] ?? input[i];
    const normalizedCluster = cluster.normalize('NFKC');
    const srcIndex = i;
    i += cluster.length;

    for (const ch of normalizedCluster) {
      if (ZERO_WIDTH.test(ch)) continue;
      if (SPACE_LIKE.test(ch)) {
        pendingSpace = out.length > 0;
        continue;
      }
      if (pendingSpace) {
        push(' ', srcIndex);
        pendingSpace = false;
      }
      if (DASH_LIKE.test(ch)) push('-', srcIndex);
      else if (SINGLE_QUOTE_LIKE.test(ch)) push("'", srcIndex);
      else if (DOUBLE_QUOTE_LIKE.test(ch)) push('"', srcIndex);
      else if (ch === ELLIPSIS) push('...', srcIndex);
      else push(ch.toLowerCase(), srcIndex);
    }
  }

  return { text: out.join(''), map };
}

/**
 * Project a span in normalized space back to the original string.
 * The end index is exclusive and clamped to the input length.
 */
export function toSourceSpan(
  normalized: Normalized,
  start: number,
  end: number,
  sourceLength: number,
): { start: number; end: number } {
  const from = normalized.map[start] ?? 0;
  const lastIndex = Math.min(end, normalized.map.length) - 1;
  const to = lastIndex >= 0 ? (normalized.map[lastIndex] ?? from) + 1 : from;
  return { start: from, end: Math.min(Math.max(to, from), sourceLength) };
}
