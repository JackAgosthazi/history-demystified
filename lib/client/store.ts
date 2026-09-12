'use client';

import { clear, del, get, keys, set } from 'idb-keyval';
import type { Explainer } from '../core/types';

/**
 * Everything the app remembers lives in the reader's own browser.
 *
 * There are no accounts, no server-side database and no analytics. What is
 * stored is a cache of explainers already fetched and the trail of subjects
 * visited this session — no identifiers, nothing about the reader. It is all
 * removable from the interface in one click.
 */

/**
 * Bumped whenever the shape *or the meaning* of a stored Explainer changes.
 *
 * Shape is the obvious case: an object written before a field existed will
 * crash the view that now reads it. Content is the easier one to miss — when
 * a stored value was simply wrong, as the timeline label "Hundred Years' War
 * begins" was, fixing the code that produces it does nothing for the copies
 * already sitting in readers' browsers. They have no way to know to clear it.
 * The version is part of the key, so old entries stop being found.
 */
const SCHEMA_VERSION = 3;
const EXPLAINER_PREFIX = `explainer:v${SCHEMA_VERSION}:`;
const TRAIL_KEY = 'trail';
const MAX_TRAIL = 12;
/** A cached explainer older than this is refetched; sources move on. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TrailEntry {
  query: string;
  title: string;
  at: number;
}

function keyFor(query: string): string {
  return `${EXPLAINER_PREFIX}${query.trim().toLowerCase()}`;
}

export async function readExplainer(query: string): Promise<Explainer | null> {
  try {
    const stored = await get<{ savedAt: number; explainer: Explainer }>(keyFor(query));
    if (!stored) return null;
    if (Date.now() - stored.savedAt > TTL_MS) {
      await del(keyFor(query));
      return null;
    }
    return stored.explainer;
  } catch {
    // Private browsing and blocked storage are normal, not errors.
    return null;
  }
}

export async function writeExplainer(query: string, explainer: Explainer): Promise<void> {
  try {
    await set(keyFor(query), { savedAt: Date.now(), explainer });
  } catch {
    /* storage unavailable or full; the app works without it */
  }
}

export async function readTrail(): Promise<TrailEntry[]> {
  try {
    return (await get<TrailEntry[]>(TRAIL_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function pushTrail(entry: Omit<TrailEntry, 'at'>): Promise<void> {
  try {
    const trail = await readTrail();
    const next = [{ ...entry, at: Date.now() }, ...trail.filter((t) => t.query !== entry.query)];
    await set(TRAIL_KEY, next.slice(0, MAX_TRAIL));
  } catch {
    /* ignore */
  }
}

export async function clearEverything(): Promise<void> {
  await clear();
}

export async function storedCount(): Promise<number> {
  try {
    return (await keys()).length;
  } catch {
    return 0;
  }
}
