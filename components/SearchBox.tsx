'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { startTrail } from '@/lib/client/trail';
import { MAX_QUERY_LENGTH } from '@/lib/server/guard';
import { explainHref } from './Entities';

export function SearchBox({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const tooLong = value.length > MAX_QUERY_LENGTH;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (!q || tooLong) return;
        // A typed search begins a new path; only drill-downs extend one.
        startTrail(q);
        router.push(explainHref(q));
      }}
      className="w-full"
    >
      <div className="flex items-stretch gap-2 rounded-xl border border-rule-strong bg-paper-raised p-1.5 shadow-sm focus-within:border-accent">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          spellCheck={false}
          aria-label="A historical person, period, conflict or event"
          placeholder="A person, a period, a conflict, an event…"
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[1.0625rem] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={!value.trim() || tooLong}
          className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          Explain
        </button>
      </div>
      <p className="mt-2 h-4 text-xs text-ink-faint">
        {tooLong
          ? `Too long — this takes a subject, not a question (${MAX_QUERY_LENGTH} characters max).`
          : ''}
      </p>
    </form>
  );
}
