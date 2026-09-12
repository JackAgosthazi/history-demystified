import { z } from 'zod';

/**
 * The structured half of synthesis.
 *
 * Two rules are encoded here rather than merely requested in the prompt,
 * because a schema is enforced and a prompt is only hoped for:
 *
 *  - every assertion carries a `sourceId` and a verbatim `quote`, so it can
 *    be checked against the corpus afterwards;
 *  - related entities are named, never linked. The model has no way to emit a
 *    URL, so it has no way to emit a URL that does not exist. Names are
 *    resolved against Wikipedia in code and dropped if they do not resolve.
 */

export const CitedClaimSchema = z.object({
  text: z
    .string()
    .describe(
      'One self-contained factual assertion, written for a reader who knows nothing ' +
        'about the subject. Must be fully supported by the quote.',
    ),
  sourceId: z
    .string()
    .describe('The id of the source this rests on, exactly as given, e.g. "S3".'),
  quote: z
    .string()
    .describe(
      'A SINGLE CONTIGUOUS span copied character-for-character from that source, at most ' +
        '180 characters. Do not join text across a gap, do not fix spelling, do not expand ' +
        'abbreviations, do not translate. If no single span supports the assertion, weaken ' +
        'the assertion until one does.',
    ),
  quoteTranslation: z
    .string()
    .nullable()
    .describe(
      'If the source is not in English, an English translation of the quote. Otherwise null.',
    ),
});

export const PerspectiveSchema = z.object({
  label: z
    .string()
    .describe('Whose view this is, e.g. "French historiography" or "Contemporary British view".'),
  stance: z.string().describe('The position in at most eight words.'),
  body: z.string().describe('Two or three sentences explaining how this reading differs.'),
  evidence: CitedClaimSchema,
});

export const ComparisonSchema = z.object({
  entityName: z
    .string()
    .describe('The English Wikipedia article title of the thing being compared to.'),
  angle: z.string().describe('One sentence on why this comparison is illuminating.'),
  similarities: z.array(z.string()).max(3),
  differences: z.array(z.string()).max(3),
});

export const ContextLinkSchema = z.object({
  entityName: z.string().describe('The English Wikipedia article title of the related subject.'),
  relation: z.enum(['precedes', 'follows', 'partOf', 'hasPart', 'causes', 'causedBy', 'participantIn']),
  note: z.string().describe('One sentence on how it connects.'),
});

export const KeyFigureSchema = z.object({
  entityName: z.string().describe('The English Wikipedia article title of the person.'),
  relationship: z
    .string()
    .describe(
      'The nature of the connection, in at most six words, from the subject\'s point of view. ' +
        'For example "Chief opponent at Waterloo", "Mentor and patron", "Rival claimant to the throne".',
    ),
  note: z.string().describe('One sentence on why this person matters to understanding the subject.'),
});

export const KeyEventSchema = z.object({
  entityName: z
    .string()
    .describe(
      'The English Wikipedia article title for this event, if it has one. Leave empty only ' +
        'when no article exists for it.',
    ),
  label: z.string().describe('A short name for the moment, at most eight words.'),
  summary: z
    .string()
    .describe('One or two sentences: what happened, and why it changed the course of things.'),
});

export const StructuredOutputSchema = z.object({
  takeaways: z
    .array(CitedClaimSchema)
    .min(4)
    .max(7)
    .describe('The things a newcomer most needs to know, most important first.'),
  perspectives: z
    .array(PerspectiveSchema)
    .max(4)
    .describe(
      'Genuine disagreements about how to read this subject. Prefer readings that conflict ' +
        'with each other over restatements of the same view in different words. Leave empty ' +
        'if the sources show no real disagreement.',
    ),
  keyEvents: z
    .array(KeyEventSchema)
    .max(8)
    .describe(
      'For a CONFLICT or a PERIOD: the turning points, in the order they happened, so a ' +
        'reader can follow the shape of it. Leave empty for a person or a single event.',
    ),
  figures: z
    .array(KeyFigureSchema)
    .max(6)
    .describe(
      'Other people a reader needs in order to make sense of this subject — opponents, ' +
        'allies, rivals, mentors, successors. Wikidata records family but not rivalry, so ' +
        'this is where those connections come from.',
    ),
  comparisons: z
    .array(ComparisonSchema)
    .max(3)
    .describe('Subjects a newcomer could use as a reference point.'),
  context: z
    .array(ContextLinkSchema)
    .max(6)
    .describe('What this subject sits inside, what led to it, and what followed.'),
  glossary: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .max(8)
    .describe('Terms in the sources a newcomer would not know.'),
  drilldown: z
    .array(z.object({ entityName: z.string(), why: z.string() }))
    .max(8)
    .describe('The most rewarding next things to read about.'),
});

export type StructuredOutput = z.infer<typeof StructuredOutputSchema>;
