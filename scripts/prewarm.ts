/**
 * Generate the committed demo cache.
 *
 * Runs the full pipeline for a fixed list of subjects and writes the results
 * into public/cache, so the example topics load instantly, cost nothing, and
 * keep working if the API key is exhausted or Wikipedia is slow. Reviewers
 * browsing the demo never touch the key.
 *
 *   npm run prewarm            generate everything missing
 *   npm run prewarm -- --force regenerate even if a file exists
 *   npm run prewarm -- --dry   list what would run, and the estimated cost
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { explain } from '../lib/core/pipeline';
import type { Explainer } from '../lib/core/types';
import { DRILLDOWN_WARMUP, EXAMPLES } from '../lib/examples';
import { normalizeQuery, type CacheIndex } from '../lib/server/cache';

const CACHE_DIR = path.join(process.cwd(), 'public', 'cache');
/** Measured average for a live run on Opus 5; used only for the estimate. */
const ESTIMATED_USD_PER_RUN = 0.45;
/** Refuse to start a run that could exceed this, as a backstop. */
const BUDGET_USD = 20;

const TOPICS = [...EXAMPLES.map((e) => e.query), ...DRILLDOWN_WARMUP];

async function main() {
  const force = process.argv.includes('--force');
  const dry = process.argv.includes('--dry');

  await mkdir(CACHE_DIR, { recursive: true });
  const existing = new Set(
    (await readdir(CACHE_DIR).catch(() => [])).filter((f) => f.endsWith('.json')),
  );
  const index = await loadExistingIndex();

  const pending = force
    ? TOPICS
    : TOPICS.filter((topic) => {
        const qid = index.aliases[normalizeQuery(topic)];
        return !qid || !existing.has(`${qid}.json`);
      });

  console.log(`${TOPICS.length} topics, ${pending.length} to generate`);
  console.log(`estimated cost ~$${(pending.length * ESTIMATED_USD_PER_RUN).toFixed(2)}\n`);

  if (pending.length * ESTIMATED_USD_PER_RUN > BUDGET_USD) {
    console.error(`Refusing to run: estimate exceeds the $${BUDGET_USD} backstop.`);
    process.exit(1);
  }
  if (dry) {
    for (const topic of pending) console.log(`  would generate: ${topic}`);
    return;
  }

  let spent = 0;
  for (const topic of pending) {
    process.stdout.write(`${topic.padEnd(46)}`);
    try {
      const explainer = await run(topic);
      if (!explainer) {
        console.log('skipped (no explainer produced)');
        continue;
      }
      await writeFile(
        path.join(CACHE_DIR, `${explainer.entity.qid}.json`),
        `${JSON.stringify(explainer, null, 1)}\n`,
      );
      register(index, topic, explainer);
      spent += explainer.usage?.usd ?? 0;
      console.log(
        `${explainer.entity.qid.padEnd(10)} ${Math.round(explainer.coverage.coverage * 100)
          .toString()
          .padStart(3)}%  $${(explainer.usage?.usd ?? 0).toFixed(3)}`,
      );
    } catch (error) {
      console.log(`FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  index.generatedAt = new Date().toISOString();
  await writeFile(path.join(CACHE_DIR, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`\n${index.entries.length} topics cached. Spent $${spent.toFixed(2)} this run.`);
}

async function run(topic: string): Promise<Explainer | null> {
  // Always regenerate: reading the cache here would defeat the point.
  for await (const event of explain(topic)) {
    if (event.type === 'done') return event.explainer;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'survey') return null;
  }
  return null;
}

/**
 * Aliases let a lookup skip resolution entirely. The subject's own title is
 * registered alongside whatever was typed, so a drill-down chip pointing at
 * "Battle of Waterloo" hits the same file as a search for "waterloo".
 */
function register(index: CacheIndex, topic: string, explainer: Explainer): void {
  const qid = explainer.entity.qid;
  index.aliases[normalizeQuery(topic)] = qid;
  index.aliases[normalizeQuery(explainer.entity.title)] = qid;

  const entry = {
    qid,
    title: explainer.entity.title,
    type: explainer.entity.type,
    description: explainer.entity.description,
    coverage: explainer.coverage.coverage,
  };
  const at = index.entries.findIndex((e) => e.qid === qid);
  if (at === -1) index.entries.push(entry);
  else index.entries[at] = entry;
}

async function loadExistingIndex(): Promise<CacheIndex> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, 'index.json'), 'utf8');
    return JSON.parse(raw) as CacheIndex;
  } catch {
    return { generatedAt: new Date().toISOString(), aliases: {}, entries: [] };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
