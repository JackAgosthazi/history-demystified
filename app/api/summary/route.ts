import { getJson } from '@/lib/core/connectors/http';

/**
 * One or two sentences about a subject, for timeline hover cards.
 *
 * Wikipedia's summary endpoint allows cross-origin requests, so the browser
 * could call it directly — but then Wikimedia would see every reader's IP
 * address, and the privacy page says it does not. Proxying keeps that true.
 * It also lets the CDN cache the answer, so a popular timeline entry is
 * fetched once rather than once per reader.
 */
export const runtime = 'nodejs';

const MAX_TITLE_LENGTH = 200;
const MAX_SENTENCES = 2;

interface SummaryResponse {
  extract?: string;
  titles?: { normalized?: string };
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const title = params.get('title')?.trim();
  const lang = params.get('lang') ?? 'en';

  if (!title || title.length > MAX_TITLE_LENGTH || !/^[a-z]{2,8}$/.test(lang)) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const data = await getJson<SummaryResponse>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title.replace(/ /g, '_'),
      )}`,
      { timeoutMs: 6_000, retries: 0 },
    );

    return Response.json(
      { extract: firstSentences(data.extract ?? '') },
      {
        headers: {
          // Static for our purposes; a day at the edge, a week while revalidating.
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    );
  } catch {
    // A missing summary is not an error worth surfacing; the card falls back
    // to the one-line description it already had.
    return Response.json({ extract: '' }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }
}

function firstSentences(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!parts) return clean.slice(0, 320);
  return parts.slice(0, MAX_SENTENCES).join('').trim();
}
