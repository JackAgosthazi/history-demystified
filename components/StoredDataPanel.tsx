'use client';

import { useEffect, useState } from 'react';
import { clearEverything, storedCount } from '@/lib/client/store';

/** Shows what this browser is actually holding, and clears it on request. */
export function StoredDataPanel() {
  const [count, setCount] = useState<number | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void storedCount().then(setCount);
  }, []);

  return (
    <section className="mt-10 rounded-xl border border-rule bg-paper-raised p-5">
      <h2 className="display text-lg font-semibold">Your data on this device</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {count === null
          ? 'Checking…'
          : count === 0
            ? 'Nothing is stored right now.'
            : `${count} item${count === 1 ? '' : 's'} stored in this browser.`}
      </p>
      <button
        type="button"
        disabled={cleared || count === 0}
        onClick={async () => {
          await clearEverything();
          try {
            sessionStorage.clear();
          } catch {
            /* storage may be unavailable */
          }
          setCount(0);
          setCleared(true);
        }}
        className="mt-4 rounded-lg border border-rule-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {cleared ? 'Cleared' : 'Clear everything stored in this browser'}
      </button>
    </section>
  );
}
