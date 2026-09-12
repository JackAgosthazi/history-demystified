'use client';

import { useEffect, useState } from 'react';

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
 * shape. The rail tracks position with an observer rather than on scroll, so
 * it costs nothing while reading.
 */
export function SectionNav({
  sections,
  variant,
}: {
  sections: NavSection[];
  /** The rail sits beside the article; the strip pins to the top on narrow screens. */
  variant: 'rail' | 'strip';
}) {
  const active = useActiveSection(sections);

  if (sections.length < 3) return null;

  if (variant === 'rail') {
    return (
      <nav aria-label="Sections" className="hidden xl:block">
        <div className="sticky top-10">
          <p className="section-label mb-3">On this page</p>
          <ul className="space-y-1 border-l border-rule">
            {sections.map((section) => {
              const current = section.id === active;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={current ? 'true' : undefined}
                    className="-ml-px block border-l-2 py-1 pl-3 text-sm transition-colors"
                    style={{
                      borderColor: current ? 'var(--accent)' : 'transparent',
                      color: current ? 'var(--accent)' : 'var(--ink-muted)',
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

  return (
    <nav
        aria-label="Sections"
        className="sticky top-0 z-30 -mx-6 mb-8 overflow-x-auto border-b border-rule bg-paper/95 px-6 py-2.5 backdrop-blur xl:hidden"
      >
        <ul className="flex w-max gap-2">
          {sections.map((section) => {
            const current = section.id === active;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={current ? 'true' : undefined}
                  className="block whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors"
                  style={{
                    borderColor: current ? 'var(--accent)' : 'var(--rule)',
                    color: current ? 'var(--accent)' : 'var(--ink-muted)',
                    background: current ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
      </ul>
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
      // A band near the top of the viewport: a section counts as current once
      // its heading reaches the upper third, not when it merely appears.
      { rootMargin: '-80px 0px -65% 0px', threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [key]);

  return active;
}
