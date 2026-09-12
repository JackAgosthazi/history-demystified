import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Explainer } from '../core/types';

/**
 * Pre-generated explainers, committed to the repo.
 *
 * The example topics on the home page are served from here, so browsing the
 * demo costs nothing and keeps working if the API key is exhausted, rate
 * limited, or Wikipedia is slow. Entries are labelled as pre-generated in the
 * UI rather than passed off as fresh.
 */

export interface CacheIndex {
  generatedAt: string;
  /** Normalized query string -> QID. Lets a hit skip resolution entirely. */
  aliases: Record<string, string>;
  entries: Array<{
    qid: string;
    title: string;
    type: string;
    description?: string;
    coverage: number;
  }>;
}

const CACHE_DIR = path.join(process.cwd(), 'public', 'cache');

let indexPromise: Promise<CacheIndex | null> | null = null;

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function loadIndex(): Promise<CacheIndex | null> {
  indexPromise ??= readFile(path.join(CACHE_DIR, 'index.json'), 'utf8')
    .then((raw) => JSON.parse(raw) as CacheIndex)
    .catch(() => null);
  return indexPromise;
}

export async function lookupByQuery(query: string): Promise<Explainer | null> {
  const index = await loadIndex();
  const qid = index?.aliases[normalizeQuery(query)];
  return qid ? lookupByQid(qid) : null;
}

export async function lookupByQid(qid: string): Promise<Explainer | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${qid}.json`), 'utf8');
    return { ...(JSON.parse(raw) as Explainer), prewarmed: true };
  } catch {
    return null;
  }
}
