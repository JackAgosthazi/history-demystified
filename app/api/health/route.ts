import { loadIndex } from '@/lib/server/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const index = await loadIndex();
  return Response.json({
    ok: true,
    // Presence only. The key itself must never leave the server.
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    cacheOnly: process.env.CACHE_ONLY === '1',
    prewarmedTopics: index?.entries.length ?? 0,
    prewarmedAt: index?.generatedAt ?? null,
  });
}
