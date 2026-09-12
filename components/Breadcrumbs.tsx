'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import type { TrailStep } from '@/lib/client/trail';
import { explainHref } from './Entities';

/**
 * How the reader got here.
 *
 * Every step back is free: the explainer for a subject already visited is in
 * IndexedDB, so returning to it re-renders from local storage without
 * touching the API.
 */
export function Breadcrumbs({ steps, current }: { steps: TrailStep[]; current: string }) {
  const trail = steps.slice(0, -1);

  return (
    <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Link href="/" className="text-ink-faint hover:text-accent">
        History Demystified
      </Link>
      {trail.map((step) => (
        <Fragment key={step.query}>
          <span aria-hidden className="text-ink-faint">
            /
          </span>
          <Link
            href={explainHref(step.query)}
            className="text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-accent"
          >
            {step.title ?? step.query}
          </Link>
        </Fragment>
      ))}
      <span aria-hidden className="text-ink-faint">
        /
      </span>
      <span className="truncate text-ink-muted">{current}</span>
    </nav>
  );
}
