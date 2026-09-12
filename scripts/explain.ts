/**
 * CLI adapter over lib/core.
 *
 * The same engine the web route uses, driven from a terminal. It exists to
 * keep the core honest — anything that leaks a Next.js or browser dependency
 * into lib/core breaks this immediately — and because being able to run the
 * whole pipeline without a browser makes prompt iteration much faster.
 *
 *   npx tsx scripts/explain.ts "Napoleon"
 *   npx tsx scripts/explain.ts --json "Battle of Waterloo" > out.json
 */
import { explain } from '../lib/core/pipeline';
import type { Explainer } from '../lib/core/types';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const query = args.filter((a) => !a.startsWith('--')).join(' ');
  if (!query) {
    console.error('usage: tsx scripts/explain.ts [--json] "<historical concept>"');
    process.exit(1);
  }

  const started = Date.now();
  let explainer: Explainer | null = null;
  let streamedProse = false;

  for await (const event of explain(query)) {
    switch (event.type) {
      case 'status':
        if (!asJson) console.error(dim(`[${elapsed(started)}] ${event.stage}${event.detail ? ` — ${event.detail}` : ''}`));
        break;
      case 'skeleton':
        if (!asJson) {
          console.error(
            dim(
              `[${elapsed(started)}] ${event.entity.title} (${event.entity.qid}, ${event.entity.type}) · ` +
                `${event.sources.length} sources · ${event.facts.timeline.length} timeline entries`,
            ),
          );
        }
        break;
      case 'prose':
        if (!asJson) {
          if (!streamedProse) {
            process.stderr.write(dim(`[${elapsed(started)}] prose:\n`));
            streamedProse = true;
          }
          process.stderr.write(event.delta);
        }
        break;
      case 'done':
        explainer = event.explainer;
        break;
      case 'error':
        console.error(`error: ${event.message}`);
        process.exit(1);
    }
  }

  if (!explainer) {
    console.error('pipeline produced no explainer');
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(explainer, null, 2));
    return;
  }

  report(explainer, started);
}

function elapsed(started: number): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`;
}

function report(e: Explainer, started: number) {
  const pct = Math.round(e.coverage.coverage * 100);
  console.log(`\n\n${bold(e.entity.title)} — ${e.entity.type} — ${elapsed(started)} — ${e.model}`);
  console.log(
    `${bold('Coverage')} ${pct}%  (${e.coverage.verified}/${e.coverage.total} verified; ` +
      `exact ${e.coverage.byMethod.exact}, fuzzy ${e.coverage.byMethod.fuzzy}, unmatched ${e.coverage.byMethod.none})`,
  );

  console.log(`\n${bold('WHY IT MATTERS')}\n${e.whyItMatters}`);

  console.log(`\n${bold('TAKEAWAYS')}`);
  for (const c of e.takeaways) print(c);

  if (e.perspectives.length) {
    console.log(`\n${bold('PERSPECTIVES')}`);
    for (const p of e.perspectives) {
      console.log(`\n  ${bold(p.label)} — ${p.stance}`);
      console.log(`  ${p.body}`);
      print(p.evidence, '  ');
    }
  }

  if (e.comparisons.length) {
    console.log(`\n${bold('COMPARISONS')}`);
    for (const c of e.comparisons) console.log(`  ${c.entity.title} — ${c.angle}`);
  }

  console.log(`\n${bold('CONTEXT')}`);
  for (const c of e.context.slice(0, 10)) {
    console.log(`  ${c.fromGraph ? green('graph') : yellow('model')} ${c.relation.padEnd(14)} ${c.entity.title}`);
  }

  console.log(`\n${bold('DRILL DOWN')}  ${e.drilldown.map((d) => d.title).join(' · ')}`);
}

function print(c: Explainer['claims'][number], indent = '') {
  const ok = c.verification.status === 'verified';
  const badge = ok ? green(`✓ ${c.verification.method}`) : yellow('✗ unverified');
  console.log(`\n${indent}  ${badge}  ${c.text}`);
  console.log(`${indent}  ${dim(`[${c.sourceId}] "${c.quote.slice(0, 110)}${c.quote.length > 110 ? '…' : ''}"`)}`);
  if (c.verification.reason) console.log(`${indent}  ${yellow(c.verification.reason)}`);
  if (c.verification.citationUrl) console.log(`${indent}  ${dim(c.verification.citationUrl.slice(0, 150))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
