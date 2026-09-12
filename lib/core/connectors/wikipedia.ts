import type { EntityRef } from '../types';
import { getJson } from './http';

/* ------------------------------------------------------------------ *
 * Wire types (only the fields we actually read)
 * ------------------------------------------------------------------ */

interface RestSearchResponse {
  pages: Array<{
    title: string;
    key: string;
    description?: string;
    excerpt?: string;
    thumbnail?: { url: string } | null;
  }>;
}

interface ActionQueryResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title: string;
      missing?: boolean;
      extract?: string;
      pageprops?: { wikibase_item?: string; disambiguation?: string };
      langlinks?: Array<{ lang: string; title: string }>;
      description?: string;
    }>;
  };
}

export interface WikiPage {
  title: string;
  pageid: number;
  url: string;
  lang: string;
  qid?: string;
  description?: string;
  /** Full plaintext with `== Heading ==` markers intact. */
  extract: string;
  langlinks: Array<{ lang: string; title: string }>;
  isDisambiguation: boolean;
}

export interface WikiSection {
  heading: string;
  level: number;
  text: string;
}

export function articleUrl(title: string, lang = 'en'): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/* ------------------------------------------------------------------ *
 * Search and fetch
 * ------------------------------------------------------------------ */

export async function searchPages(
  query: string,
  { lang = 'en', limit = 5, signal }: { lang?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<EntityRef[]> {
  const url =
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page` +
    `?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await getJson<RestSearchResponse>(url, { signal });
  return (data.pages ?? []).map((p) => ({
    title: p.title,
    url: articleUrl(p.title, lang),
    lang,
    description: p.description,
    thumbnail: p.thumbnail?.url ? `https:${p.thumbnail.url}`.replace('https:https:', 'https:') : undefined,
  }));
}

/**
 * One request for everything we need from an article: canonical title after
 * redirects, the Wikidata QID, every interlanguage link, and the full
 * plaintext with section markers.
 */
export async function fetchPage(
  title: string,
  { lang = 'en', signal }: { lang?: string; signal?: AbortSignal } = {},
): Promise<WikiPage | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&redirects=1&titles=${encodeURIComponent(title)}` +
    `&prop=extracts%7Cpageprops%7Clanglinks&explaintext=1&exsectionformat=wiki&lllimit=500`;
  const data = await getJson<ActionQueryResponse>(url, { signal, timeoutMs: 20_000 });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.pageid == null) return null;

  return {
    title: page.title,
    pageid: page.pageid,
    url: articleUrl(page.title, lang),
    lang,
    qid: page.pageprops?.wikibase_item,
    description: page.description,
    extract: page.extract ?? '',
    langlinks: page.langlinks ?? [],
    isDisambiguation: page.pageprops?.disambiguation !== undefined,
  };
}

/** Lead paragraphs only — used for the cheap non-English perspective docs. */
export async function fetchLead(
  title: string,
  { lang, signal }: { lang: string; signal?: AbortSignal },
): Promise<{ title: string; url: string; text: string } | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&redirects=1&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exintro=1`;
  const data = await getJson<ActionQueryResponse>(url, { signal });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) return null;
  return { title: page.title, url: articleUrl(page.title, lang), text: page.extract.trim() };
}

/**
 * Resolve a bare entity name to a real article.
 *
 * This is the guard that makes model-proposed comparisons and context links
 * safe: the model supplies a name, and anything that does not resolve to an
 * actual page is dropped rather than rendered as a dead link.
 */
export async function resolveEntityName(
  name: string,
  { lang = 'en', signal }: { lang?: string; signal?: AbortSignal } = {},
): Promise<EntityRef | null> {
  const page = await fetchPage(name, { lang, signal }).catch(() => null);
  if (page && !page.isDisambiguation) {
    return {
      title: page.title,
      url: page.url,
      lang,
      qid: page.qid,
      description: page.description,
    };
  }
  const [hit] = await searchPages(name, { lang, limit: 1, signal }).catch(() => []);
  return hit ?? null;
}

/* ------------------------------------------------------------------ *
 * Section splitting
 * ------------------------------------------------------------------ */

const HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/;

/**
 * Split a plaintext extract into the lead plus one entry per top-level
 * section. Sub-headings are folded into their parent so a section stays a
 * coherent block of prose for quoting.
 */
export function splitSections(extract: string): WikiSection[] {
  const sections: WikiSection[] = [];
  let current: WikiSection = { heading: '', level: 0, text: '' };
  const lines: string[] = [];

  const flush = () => {
    current.text = lines.join('\n').trim();
    if (current.text || current.heading) sections.push({ ...current });
    lines.length = 0;
  };

  for (const line of extract.split('\n')) {
    const m = HEADING_RE.exec(line.trim());
    if (!m) {
      lines.push(line);
      continue;
    }
    const level = m[1].length;
    const heading = m[2];
    if (level === 2) {
      flush();
      current = { heading, level, text: '' };
    } else {
      // Keep sub-headings as inline signposts inside the parent section.
      lines.push('', heading, '');
    }
  }
  flush();
  return sections.filter((s) => s.text.length > 0);
}
