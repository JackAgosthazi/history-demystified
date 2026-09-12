/**
 * Build W3C text-fragment deep links.
 *
 * This is what turns verification from a number into something the reader can
 * act on: the citation opens the source scrolled to, and highlighting, the
 * exact sentence the claim rests on. Supported natively by Chrome, Edge and
 * Safari; elsewhere it degrades to a normal link to the article.
 *
 * https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments
 */

/** Beyond this, a prefix/suffix pair is more robust than one long string. */
const MAX_INLINE_WORDS = 10;
const EDGE_WORDS = 6;

/** encodeURIComponent leaves "-" alone, but it is a delimiter in this syntax. */
function encodeFragmentPart(text: string): string {
  return encodeURIComponent(text).replace(/-/g, '%2D');
}

export function buildTextFragment(url: string, snippet: string): string {
  const clean = snippet.replace(/\s+/g, ' ').trim();
  if (clean.length < 10) return url;

  const words = clean.split(' ');
  const separator = url.includes('#') ? ':~:text=' : '#:~:text=';

  if (words.length <= MAX_INLINE_WORDS) {
    return `${url}${separator}${encodeFragmentPart(clean)}`;
  }

  const start = words.slice(0, EDGE_WORDS).join(' ');
  const end = words.slice(-EDGE_WORDS).join(' ');
  return `${url}${separator}${encodeFragmentPart(start)},${encodeFragmentPart(end)}`;
}
