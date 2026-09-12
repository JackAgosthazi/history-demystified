'use client';

import { useEffect, useState } from 'react';
import type { Stage } from '@/lib/client/useExplainer';

/**
 * What is happening, and how far through it is.
 *
 * Research honestly takes sixty to ninety seconds, and an unlabelled spinner
 * for that long is indistinguishable from a page that has silently failed.
 * Naming the four stages makes the wait legible, and the elapsed counter
 * turns "is this broken?" into "it has been twenty seconds", which is a much
 * easier question for a reader to answer themselves.
 */

const STAGES: Array<{ id: Stage; label: string; detail: string }> = [
  { id: 'resolving', label: 'Finding the subject', detail: 'Matching your search to a real article' },
  { id: 'gathering', label: 'Reading sources', detail: 'Wikipedia, Wikidata, and other-language articles' },
  { id: 'synthesizing', label: 'Writing the explanation', detail: 'Two passes over everything retrieved' },
  { id: 'verifying', label: 'Checking every quote', detail: 'Locating each claim in the source it cites' },
];

export function ProgressPanel({ stage, detail }: { stage: Stage; detail?: string }) {
  const elapsed = useElapsed(stage !== 'done' && stage !== 'error');
  const current = STAGES.findIndex((s) => s.id === stage);
  if (current === -1) return null;

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="mt-6 rounded-xl border border-rule bg-paper-raised p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-base font-semibold">Researching this subject</h2>
        <span className="text-xs tabular-nums text-ink-faint">
          {elapsed}s elapsed · usually under two minutes
        </span>
      </div>

      {/* Indeterminate: the stages are known, their durations are not. */}
      <div
        className="progress-sweep relative mb-5 h-0.5 w-full overflow-hidden rounded"
        style={{ background: 'var(--rule)' }}
        aria-hidden
      />

      <ol className="space-y-3">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex items-start gap-3">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                {done ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" style={{ color: 'var(--verified)' }}>
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : active ? (
                  <span
                    className="h-2.5 w-2.5 animate-pulse rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                ) : (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--rule-strong)' }}
                  />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm ${active ? 'font-semibold text-ink' : done ? 'text-ink-muted' : 'text-ink-faint'}`}
                >
                  {s.label}
                  {active && detail && <span className="font-normal text-ink-faint"> — {detail}</span>}
                </span>
                {active && <span className="block text-xs text-ink-faint">{s.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-rule pt-3 text-xs text-ink-faint">
        Everything already on the page below is real and clickable — the timeline and sources
        come from the structured record and need no model at all.
      </p>
    </section>
  );
}

function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}
