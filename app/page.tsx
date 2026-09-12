import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { explainHref } from '@/components/Entities';
import { EXAMPLES, TYPE_LABEL } from '@/lib/examples';
import { loadIndex } from '@/lib/server/cache';

export default async function Home() {
  const index = await loadIndex();
  const cachedTitles = new Set(Object.keys(index?.aliases ?? {}));

  return (
    <main className="mx-auto w-full max-w-4xl grow px-6 py-16 sm:py-24">
      <header className="measure">
        <h1 className="display text-4xl font-semibold sm:text-5xl">History Demystified</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Pick any historical subject you know nothing about. You will get it explained from
          the ground up — and every factual claim carries the exact sentence it came from,
          so you never have to take it on trust.
        </p>
      </header>

      <div className="mt-8 max-w-2xl">
        <SearchBox autoFocus />
      </div>

      <section className="mt-14">
        <h2 className="section-label">Or start with one of these</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example) => {
            const ready = cachedTitles.has(example.query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
            return (
              <Link
                key={example.query}
                href={explainHref(example.query)}
                className="group rounded-xl border border-rule bg-paper-raised p-4 transition-colors hover:border-accent"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="display text-lg font-semibold text-ink group-hover:text-accent">
                    {example.query}
                  </h3>
                  <span className="section-label shrink-0">{TYPE_LABEL[example.type]}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{example.blurb}</p>
                {ready && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--verified)' }}>
                    Ready now — pre-generated, loads instantly
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-16 measure">
        <h2 className="section-label">How it avoids making things up</h2>
        <div className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink-muted">
          <p>
            <strong className="text-ink">Dates and relationships are never written by Claude.</strong>{' '}
            Birth and death dates, family, terms of office, belligerents and causal links are read
            from Wikidata. The timelines and relationship diagrams are drawn from that structured
            record, not from prose a model produced.
          </p>
          <p>
            <strong className="text-ink">Every claim carries a quote, and the quote is checked.</strong>{' '}
            Claude may only assert something if it can point at a verbatim span of a document that
            was actually retrieved. A server-side verifier then finds that span in the source. Claims
            it cannot find stay on the page, labelled — hiding them would make the score meaningless.
          </p>
          <p>
            <strong className="text-ink">Claude never writes a link.</strong> It refers to other
            subjects by name, and those names are resolved against Wikipedia in code. A subject that
            does not resolve is dropped, so a fabricated citation cannot reach you.
          </p>
          <p>
            This is not a claim that everything you read is true — Wikipedia is not truth. It is a
            claim that you can check any of it in one click, which is a different and more useful
            promise.
          </p>
        </div>
      </section>

      <footer className="mt-16 border-t border-rule pt-6 text-xs text-ink-faint">
        <p>
          No accounts, no cookies, no analytics, no server-side database. Subjects you read are
          cached in your own browser and never leave it.{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            What is stored, and how to clear it
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
