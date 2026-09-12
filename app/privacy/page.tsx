import Link from 'next/link';
import { StoredDataPanel } from '@/components/StoredDataPanel';

export const metadata = { title: 'What is stored — History Demystified' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl grow px-6 py-16">
      <Link href="/" className="text-sm text-ink-faint hover:text-accent">
        &larr; History Demystified
      </Link>

      <h1 className="display mt-6 text-3xl font-semibold">What is stored</h1>

      <div className="mt-6 space-y-5 leading-relaxed text-ink-muted">
        <p>
          There are no accounts, no cookies, no analytics and no server-side database. Nothing
          you do here is recorded anywhere that anyone but you can reach.
        </p>
        <p>
          <strong className="text-ink">In your browser.</strong> Explainers you have already
          read are kept in IndexedDB so revisiting one is instant and costs nothing, and the
          path you took between subjects is kept in sessionStorage to draw the breadcrumbs.
          Both are ordinary browser storage on your own device. Neither is ever sent anywhere,
          and both hold only subject names and the text of the explainers themselves.
        </p>
        <p>
          <strong className="text-ink">On the server.</strong> A search is passed to Wikipedia,
          Wikidata and the Anthropic API to research the subject, then the result is streamed
          back and forgotten. Searches are not logged, associated with you, or retained.
        </p>
        <p>
          <strong className="text-ink">Third parties.</strong> Requests reach Wikimedia and
          Anthropic from this server, not from your browser, so neither of them sees your IP
          address. Citation links point at Wikipedia; following one is an ordinary visit to
          Wikipedia, subject to their policies rather than this page.
        </p>
      </div>

      <StoredDataPanel />
    </main>
  );
}
