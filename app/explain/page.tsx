import { redirect } from 'next/navigation';
import { ExplainerView } from '@/components/ExplainerView';

export const dynamic = 'force-dynamic';

export default async function ExplainPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!query) redirect('/');
  return <ExplainerView query={query} />;
}
