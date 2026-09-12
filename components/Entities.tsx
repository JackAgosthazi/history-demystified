import Link from 'next/link';
import type { EntityRef, GraphNode } from '@/lib/core/types';

export function explainHref(title: string): string {
  return `/explain?q=${encodeURIComponent(title)}`;
}

/**
 * Every named subject on the page is a way further in.
 *
 * Each chip re-enters the same pipeline on a new subject, which is the whole
 * interaction model: understanding is a walk, not a page. Chips only ever
 * render for entities that resolved to a real article, so none of them is a
 * dead end.
 */
export function EntityChip({
  entity,
  hint,
}: {
  entity: EntityRef | GraphNode;
  hint?: string;
}) {
  const title = 'title' in entity ? entity.title : entity.label;
  const description = 'description' in entity ? entity.description : undefined;

  return (
    <Link
      href={explainHref(title)}
      title={hint ?? description}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:bg-accent-soft"
    >
      <span className="truncate">{title}</span>
      <span aria-hidden className="text-ink-faint transition-colors group-hover:text-accent">
        &rarr;
      </span>
    </Link>
  );
}

export function EntityChipRow({ entities }: { entities: Array<EntityRef | GraphNode> }) {
  if (entities.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entities.map((e) => (
        <EntityChip key={'qid' in e && e.qid ? e.qid : 'title' in e ? e.title : e.label} entity={e} />
      ))}
    </div>
  );
}
