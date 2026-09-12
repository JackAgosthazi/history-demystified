import type { ResolvedEntity, SourceDoc } from '../types';
import { templateFor } from '../packs/history/templates';

/**
 * Rules shared by both calls.
 *
 * The quoting rules are stated in the imperative and with the failure mode
 * named, because the model's instinct while copying is to tidy: it expands
 * abbreviations, straightens quotes, and splices two clauses into one. Those
 * are the edits that cause a true statement to fail verification.
 */
const GROUNDING_RULES = `
You are given a numbered set of sources. They are the only material you may use.

Absolute rules:
1. Never state anything that is not supported by the sources. If you do not know, omit it.
2. Every assertion you are asked to cite must carry the id of ONE source and a quote from it.
3. A quote must be copied EXACTLY: one contiguous run of characters from that source, at
   most 180 characters. Never join text across a gap. Never fix spelling or punctuation,
   expand an abbreviation, or reword. If no single span supports what you want to say, say
   something weaker that a single span does support.
4. Quote a non-English source in its own language, then supply an English translation
   separately. Never translate inside the quote itself.
5. Never write a URL or a link. Refer to other subjects by their English Wikipedia article
   title and nothing else.
6. Never invent a source id. Only ids that appear below exist.
7. State the assertion itself, never where it came from. Write "Napoleon abolished the free
   press", not "the English article says Napoleon abolished the free press". The source is
   already attached separately, and naming it inside the sentence makes the claim unverifiable
   against that very source.

You are writing for an intelligent adult who knows nothing whatsoever about this subject.
Assume no prior knowledge of the period, the institutions, the geography or the other people
involved. Explain a term the first time it appears. Prefer concrete detail over abstraction.
Do not be reverent, do not be cynical, and do not smooth over disagreement between sources.
`.trim();

export function renderCorpus(sources: SourceDoc[]): string {
  return sources
    .map((s) => {
      const attrs = [
        `id="${s.id}"`,
        `publisher="${s.publisher}"`,
        `title="${escapeAttr(s.title)}"`,
        s.section ? `section="${escapeAttr(s.section)}"` : '',
        `lang="${s.lang}"`,
        s.truncated ? 'truncated="true"' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<source ${attrs}>\n${s.text}\n</source>`;
    })
    .join('\n\n');
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function subjectHeader(entity: ResolvedEntity): string {
  return [
    `Subject: ${entity.title}`,
    entity.description ? `Wikidata description: ${entity.description}` : '',
    `Treatment: ${entity.type}`,
    templateFor(entity.type).guidance,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * Call A — streaming narrative
 * ------------------------------------------------------------------ */

/**
 * Plain text with two fixed headings rather than JSON.
 *
 * Structured output cannot be rendered until it parses, so a JSON summary
 * would show the reader nothing for thirty seconds. Delimited prose streams
 * word by word and still parses deterministically at the end.
 */
export const PROSE_SYSTEM = `${GROUNDING_RULES}

Write an orientation for this subject in exactly this format, with no other headings:

## SUMMARY
Exactly two short paragraphs, no more. The first says what this is and why anyone
remembers it. The second gives the shape of what happened and what was at stake. Attach
source markers like [S3] to sentences that rest on a specific source. A sentence may
carry more than one marker.

## WHY IT MATTERS
Three or four sentences on what changed because of this. Be specific and avoid grand
claims the sources do not support.

This is an orientation, not an article — the reader gets timelines, charts and a
structured breakdown alongside it, so do not try to cover everything here. Plain, direct
English. Short sentences. No bullet points, no bold, no headings other than the two
above.`;

export function proseUserMessage(entity: ResolvedEntity, corpus: string): string {
  return `${subjectHeader(entity)}\n\nSources:\n\n${corpus}`;
}

/* ------------------------------------------------------------------ *
 * Call B — structured extraction
 * ------------------------------------------------------------------ */

export const STRUCTURED_SYSTEM = `${GROUNDING_RULES}

Produce the structured breakdown described by the output schema.

Guidance that the schema cannot express:
- Takeaways are the things a newcomer most needs, not the things most easily cited. Order
  them by importance. Each must stand alone without the others.
- For perspectives, look for places where the sources actually disagree — where a
  non-English source emphasises something the English one passes over, or where a
  "Legacy", "Historiography" or "Controversy" section names competing readings. Do not
  manufacture a disagreement. Fewer real ones beat four invented ones, and an empty list
  is a valid answer.
- Key events apply to conflicts and periods, and should be left empty otherwise. Pick the
  moments after which things were different, not simply the famous ones, and say in a
  sentence or two what changed. Do not state dates: they are looked up separately from the
  structured record, so an article title is more useful than a year.
- Key figures are the other people without whom the subject does not make sense: the
  opponent across the battlefield, the mentor, the rival claimant, the successor who undid
  it. Say what the relationship actually was, not merely that one existed. Prefer people who
  shaped the subject over people who merely appear near it.
- Comparisons must give a newcomer a foothold, which means picking something they have
  plausibly heard of. A famous counterpart from another time or place is far more useful
  than an obscure relative or a minor contemporary: for Cleopatra, Julius Caesar or
  Elizabeth I, not Berenice IV. If nothing well known compares, return fewer.
- Context is what this sits inside and what it caused. Prefer connections a reader would
  not already know over restating the subject.
- Glossary terms are ones a newcomer would stumble on, not ones you find interesting.`;

export function structuredUserMessage(entity: ResolvedEntity, corpus: string): string {
  return `${subjectHeader(entity)}\n\nSources:\n\n${corpus}`;
}

/* ------------------------------------------------------------------ *
 * Parsing the narrative back out
 * ------------------------------------------------------------------ */

export interface ParsedProse {
  summary: string;
  whyItMatters: string;
}

export function parseProse(text: string): ParsedProse {
  const summary = section(text, 'SUMMARY');
  const why = section(text, 'WHY IT MATTERS');
  // A truncated or unheaded response still has to render something useful.
  if (!summary && !why) return { summary: text.trim(), whyItMatters: '' };
  return { summary, whyItMatters: why };
}

function section(text: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  return re.exec(text)?.[1].trim() ?? '';
}

/** Source markers the prose carries, e.g. "[S3]" or "[S3][S7]". */
export function extractProseMarkers(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))];
}
