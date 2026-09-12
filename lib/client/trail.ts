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

/*
 * Exposed as a subscribable store rather than copied into component state.
 *
 * The trail lives in sessionStorage, and mirroring it into useState meant
 * setting state from an effect on every navigation — a cascading render, and
 * two sources of truth that could disagree. `getSnapshot` must return a
 * stable reference between writes or React will re-render forever, hence the
 * cached array.
 */
const listeners = new Set<() => void>();
let snapshot: TrailStep[] | null = null;
const EMPTY: TrailStep[] = [];

function read(): TrailStep[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrailStep[]) : [];
  } catch {
    return [];
  }
}

function write(steps: TrailStep[]): void {
  const next = steps.slice(-MAX_DEPTH);
  snapshot = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or storage disabled; breadcrumbs simply do not appear */
  }
  for (const listener of listeners) listener();
}

export function subscribeToTrail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrail(): TrailStep[] {
  snapshot ??= read();
  return snapshot;
}

/** The server has no session, so the trail starts empty and stable. */
export function getServerTrail(): TrailStep[] {
  return EMPTY;
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
export function enterSubject(query: string): void {
  const steps = getTrail();
  const existing = steps.findIndex((s) => sameSubject(s.query, query));
  write(existing === -1 ? [...steps, { query }] : steps.slice(0, existing + 1));
}

/** Begin a fresh path. Called when a subject comes from the search box. */
export function startTrail(query: string): void {
  write([{ query }]);
}

/** Fill in the display title once the subject has resolved. */
export function labelSubject(query: string, title: string): void {
  const steps = getTrail();
  if (steps.some((s) => sameSubject(s.query, query) && s.title === title)) return;
  write(steps.map((s) => (sameSubject(s.query, query) ? { ...s, title } : s)));
}
