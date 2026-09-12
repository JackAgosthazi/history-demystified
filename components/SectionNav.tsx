'use client';

import { useEffect, useRef, useState } from 'react';

export interface NavSection {
  id: string;
  label: string;
}

/**
 * Navigation for a page that gets long.
 *
 * A finished explainer runs to a dozen sections, and the reader's question is
 * usually a specific one — when did this happen, who else was involved, where
 * do accounts differ. Scrolling past everything to find out is the wrong
 * shape, so the bar stays put and always says where you are.
 *
 * Position is tracked with an IntersectionObserver rather than a scroll
 * handler, so it costs nothing while reading.
 */
export function SectionNav({ sections, subject }: { sections: NavSection[]; subject?: string }) {
  const active = useActiveSection(sections);
  const scroller = useRef<HTMLDivElement>(null);
  const activeChip = useRef<HTMLAnchorElement>(null);

  /*
   * Keep the highlighted chip on screen. The bar scrolls horizontally when the
   * sections outrun the viewport, so by the time a reader reaches Sources the
   * marker for it has long since slid off to the right and the bar looks as
   * though nothing is selected.
   */
  useEffect(() => {
    const chip = activeChip.current;
    const box = scroller.current;
    if (!chip || !box) return;

    const chipBox = chip.getBoundingClientRect();
    const boxBox = box.getBoundingClientRect();
    if (chipBox.left >= boxBox.left && chipBox.right <= boxBox.right) return;

    box.scrollTo({
      left: box.scrollLeft + (chipBox.left - boxBox.left) - boxBox.width / 3,
      behavior: 'smooth',
    });
  }, [active]);

  if (sections.length < 3) return null;

  return (
    <nav
      aria-label="Sections"
      /*
       * Full-bleed on a centred page: negative margins pull the bar out to the
       * page gutters so the rule under it spans the whole width, while the
       * content inside stays aligned with the article.
       */
      className="sticky top-0 z-30 -mx-6 mb-10 border-b border-rule bg-paper/90 backdrop-blur-sm relative"
    >
      {/* A hint that there is more to the right, without a scrollbar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10"
        style={{ background: 'linear-gradient(to right, transparent, var(--paper))' }}
      />
      <div
        ref={scroller}
        className="flex items-center gap-4 overflow-x-auto px-6 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {subject && (
          <>
            <span className="hidden shrink-0 max-w-[14rem] truncate text-sm font-semibold text-ink sm:block">
              {subject}
            </span>
            <span aria-hidden className="hidden h-4 w-px shrink-0 bg-rule-strong sm:block" />
          </>
        )}

        <ul className="flex w-max gap-1.5">
          {sections.map((section) => {
            const current = section.id === active;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  ref={current ? activeChip : undefined}
                  aria-current={current ? 'true' : undefined}
                  /*
                   * Selected state is ink on a tinted ground, not the brand
                   * red. A red pill in a navigation bar reads as an error
                   * rather than as "you are here".
                   */
                  className="block whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors"
                  style={{
                    borderColor: current ? 'var(--accent)' : 'transparent',
                    color: current ? 'var(--accent)' : 'var(--ink-muted)',
                    background: current ? 'var(--accent-soft)' : 'transparent',
                    fontWeight: current ? 600 : 400,
                  }}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function useActiveSection(sections: NavSection[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = sections.map((s) => s.id).join('|');

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Whichever visible section comes first in document order wins, so the
        // highlight does not flicker between two sections sharing the viewport.
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      // A band just below the sticky bar: a section becomes current when its
      // heading reaches the top of the reading area, not when it first appears.
      { rootMargin: '-72px 0px -66% 0px', threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [key]);

  return active;
}
