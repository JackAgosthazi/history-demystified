import { USER_AGENT } from './http';

/**
 * Wikidata Query Service.
 *
 * Used only for scope queries ("Japan 1600"), where the question is not about
 * one subject but about everything of note inside a place and a stretch of
 * time. That is a genuine graph query and nothing else answers it.
 *
 * The service is generous but will refuse an expensive plan with a 502, so
 * every query here is anchored on a small VALUES set of classes rather than
 * starting from a date or a country. Anchoring turned a 502 into a one-second
 * response for the same results.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';
const TIMEOUT_MS = 20_000;

interface SparqlResponse {
  results: { bindings: Array<Record<string, { value: string }>> };
}

export class SparqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SparqlError';
  }
}

export async function runSparql(
  query: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, string>>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    signal: combined,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  });
  if (!response.ok) {
    throw new SparqlError(`Wikidata query service returned ${response.status}.`);
  }

  const data = (await response.json()) as SparqlResponse;
  return data.results.bindings.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, cell.value])),
  );
}

/** Pull the QID out of a full entity URI. */
export function qidFromUri(uri: string): string | null {
  const match = /\/(Q\d+)$/.exec(uri);
  return match ? match[1] : null;
}
