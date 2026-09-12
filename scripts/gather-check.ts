/** Throwaway harness: exercises resolve + gather with no LLM involved. */
import { resolve, gather } from '../lib/core/packs/history/gather';
import { estimateTokens } from '../lib/core/connectors/http';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'Napoleon';

  const t0 = Date.now();
  const ctx = await resolve(query);
  const tResolve = Date.now() - t0;
  const t1 = Date.now();
  const { sources, facts, lead } = await gather(ctx);
  const tGather = Date.now() - t1;

  console.log(`\nQUERY "${query}" -> ${ctx.entity.title} (${ctx.entity.qid})`);
  console.log(`TYPE  ${ctx.entity.type}   evidence: ${ctx.entity.typeEvidence.join(', ')}`);
  console.log(`ALTS  ${ctx.entity.alternates.map((a) => a.title).join(' | ') || '(none)'}`);
  console.log(`TIME  resolve ${tResolve}ms, gather ${tGather}ms`);
  console.log(`DATES ${facts.start?.display ?? '?'} -> ${facts.end?.display ?? '?'}`);

  console.log(`\nRELATIONS (${Object.keys(facts.relations).length} props)`);
  for (const [prop, nodes] of Object.entries(facts.relations)) {
    console.log(`  ${prop}: ${nodes.map((n) => n.label).slice(0, 6).join(', ')}${nodes.length > 6 ? ` +${nodes.length - 6}` : ''}`);
  }

  console.log(`\nTIMELINE (${facts.timeline.length})`);
  for (const e of facts.timeline.slice(0, 14)) {
    console.log(`  ${e.date.display.padEnd(20)} [${e.kind}] ${e.label}${e.endDate ? ` -> ${e.endDate.display}` : ''}`);
  }

  const total = sources.reduce((n, s) => n + estimateTokens(s.text), 0);
  console.log(`\nSOURCES (${sources.length}, ~${total} tokens)`);
  for (const s of sources) {
    console.log(`  ${s.id.padEnd(4)} ${String(estimateTokens(s.text)).padStart(5)}t  [${s.lang}] ${s.publisher} :: ${s.section ?? '-'}${s.truncated ? ' (truncated)' : ''}`);
  }
  console.log(`\nLEAD  ${lead.slice(0, 180)}...`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
