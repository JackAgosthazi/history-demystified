'use client';

/**
 * The path taken through subjects, for breadcrumbs.
 *
 * Distinct from the visit history in store.ts: this is the route from where
 * the reader started to where they are now — Napoleon, then Waterloo, then
 * Wellington — not everything they have ever looked at.
 *
 * Kept in sessionStorage because it belongs to this browsing session and
 * nothing else. Going back costs no API call: the explainer for a subject
 * already visited is in IndexedDB, and the hook reads that before it reaches
 * for the network.
 */

const KEY = 'trail-path';
const MAX_DEPTH = 8;

export interface TrailStep {
  query: string;
  title?: string;
}

function read(): TrailStep[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrailStep[]) : [];
  } catch {
    return [];
  }
}

function write(steps: TrailStep[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(steps.slice(-MAX_DEPTH)));
  } catch {
    /* private mode or storage disabled; breadcrumbs simply do not appear */
  }
}

function sameSubject(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Record arrival at a subject and return the path to it.
 *
 * Revisiting a subject already on the path truncates back to it rather than
 * appending, so stepping back up the breadcrumbs does not leave a growing
 * tail of where the reader has been.
 */
export function enterSubject(query: string): TrailStep[] {
  const steps = read();
  const existing = steps.findIndex((s) => sameSubject(s.query, query));
  const next = existing === -1 ? [...steps, { query }] : steps.slice(0, existing + 1);
  write(next);
  return next.slice(-MAX_DEPTH);
}

/** Begin a fresh path. Called when a subject comes from the search box. */
export function startTrail(query: string): void {
  write([{ query }]);
}

/** Fill in the display title once the subject has resolved. */
export function labelSubject(query: string, title: string): TrailStep[] {
  const steps = read().map((s) => (sameSubject(s.query, query) ? { ...s, title } : s));
  write(steps);
  return steps.slice(-MAX_DEPTH);
}
