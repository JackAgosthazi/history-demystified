'use client';

import { Fragment } from 'react';
import type { SourceDoc } from '@/lib/core/types';

/**
 * Renders narrative text, turning inline [S3] markers into links to the
 * source they name. Markers whose source is not in the corpus are stripped
 * rather than shown as dead references — the model occasionally invents an
 * id, and a broken citation is worse than no citation.
 */
export function Prose({ text, sources }: { text: string; sources: SourceDoc[] }) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div className="prose-body text-[1.0625rem] text-ink">
      {paragraphs.map((paragraph, pi) => (
        <p key={pi}>
          {paragraph.split(/(\[S\d+\])/g).map((part, i) => {
            const marker = /^\[(S\d+)\]$/.exec(part);
            if (!marker) return <Fragment key={i}>{part}</Fragment>;
            const source = byId.get(marker[1]);
            if (!source) return null;
            return (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                title={`${source.publisher} — ${source.section ?? source.title}`}
                className="mx-0.5 rounded px-1 align-super text-[0.65em] font-medium text-accent no-underline hover:bg-accent-soft"
              >
                {marker[1]}
              </a>
            );
          })}
        </p>
      ))}
    </div>
  );
}
