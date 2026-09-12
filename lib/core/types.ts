/**
 * Core contracts for the explainer engine.
 *
 * This file — and everything under lib/core — must stay free of Next.js and
 * browser imports. The engine is consumed by three adapters: the SSE route
 * (app/api/explain), the CLI (scripts/explain.ts) and the pre-warm script.
 */

export type EntityType = 'person' | 'period' | 'conflict' | 'event';

/** A Wikipedia page we can actually reach. Produced only by resolution. */
export interface EntityRef {
  title: string;
  url: string;
  lang: string;
  qid?: string;
  description?: string;
  thumbnail?: string;
}

export interface ResolvedEntity extends EntityRef {
  qid: string;
  type: EntityType;
  /** Human-readable P31/P279 labels that drove the classification. */
  typeEvidence: string[];
  /** Other plausible matches, offered as "did you mean" chips. */
  alternates: EntityRef[];
}

/* ------------------------------------------------------------------ *
 * Source corpus
 * ------------------------------------------------------------------ */

/**
 * One retrieved document. Every citation in the finished explainer points at
 * one of these by `id`, so the model can never invent a source: an unknown id
 * simply fails lookup during verification.
 */
export interface SourceDoc {
  /** Stable within a single run: "S1", "S2", ... */
  id: string;
  url: string;
  title: string;
  lang: string;
  publisher: string;
  /** Section heading, when the doc is one section of a larger article. */
  section?: string;
  text: string;
  /** True when text was cut to fit the token budget. */
  truncated: boolean;
}

/* ------------------------------------------------------------------ *
 * Knowledge-graph facts — never authored by the model
 * ------------------------------------------------------------------ */

export type DatePrecision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'millennium';

export interface GraphDate {
  /** Signed ISO-ish string straight from Wikidata, e.g. "-0100-01-01". */
  raw: string;
  year: number;
  precision: DatePrecision;
  /** Pre-formatted for display, e.g. "15 August 1769" or "c. 100 BC". */
  display: string;
}

export interface GraphNode {
  qid: string;
  label: string;
  description?: string;
  /** Wikipedia URL, present only when the entity has an en-wiki article. */
  url?: string;
  start?: GraphDate;
  end?: GraphDate;
}

/** Relations keyed by Wikidata property id, e.g. "P22" -> [father]. */
export type Relations = Record<string, GraphNode[]>;

export type TimelineKind = 'life' | 'position' | 'event' | 'battle' | 'period' | 'related';

export interface TimelineEvent {
  id: string;
  label: string;
  kind: TimelineKind;
  date: GraphDate;
  endDate?: GraphDate;
  qid?: string;
  /** Where a reader can check this date. Always a real URL. */
  sourceUrl: string;
}

export interface EntityFacts {
  qid: string;
  label: string;
  description?: string;
  /** Birth/death for a person; start/end for everything else. */
  start?: GraphDate;
  end?: GraphDate;
  relations: Relations;
  timeline: TimelineEvent[];
  sourceUrl: string;
}

/* ------------------------------------------------------------------ *
 * Claims and verification
 * ------------------------------------------------------------------ */

export type VerificationStatus = 'verified' | 'unverified';
export type MatchMethod = 'exact' | 'fuzzy' | 'none';

export interface Verification {
  status: VerificationStatus;
  method: MatchMethod;
  /** 0..1. 1 for an exact match. */
  score: number;
  /** Why an unverified claim failed, shown in the UI. */
  reason?: string;
  /** Source URL with a #:~:text= fragment pointing at the matched span. */
  citationUrl?: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

/**
 * One atomic assertion plus the span it rests on. The model supplies
 * `text`, `sourceId` and `quote`; `verification` is filled in by code.
 */
export interface Claim {
  id: string;
  text: string;
  sourceId: string;
  /** Verbatim span from the cited document, in that document's own language. */
  quote: string;
  /** English rendering of a non-English quote. Never counts as verified. */
  quoteTranslation?: string;
  verification: Verification;
}

export interface CoverageReport {
  total: number;
  verified: number;
  /** 0..1 */
  coverage: number;
  byMethod: Record<MatchMethod, number>;
}

/* ------------------------------------------------------------------ *
 * The finished document
 * ------------------------------------------------------------------ */

export interface Perspective {
  /** e.g. "French historiography", "Contemporary British press". */
  label: string;
  stance: string;
  body: string;
  /** The cited span this reading rests on, verified like any other claim. */
  evidence: Claim;
}

export interface Comparison {
  entity: EntityRef;
  /** Why these two are worth putting side by side. */
  angle: string;
  similarities: string[];
  differences: string[];
}

export type ContextRelation = 'precedes' | 'follows' | 'partOf' | 'hasPart' | 'causes' | 'causedBy' | 'participantIn';

export interface ContextLink {
  entity: EntityRef;
  relation: ContextRelation;
  note: string;
  /** true when the edge came from Wikidata rather than the model. */
  fromGraph: boolean;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface Explainer {
  version: 1;
  query: string;
  entity: ResolvedEntity;
  facts: EntityFacts;
  sources: SourceDoc[];

  /** Narrative (Call A). Carries [S3] markers, resolved against `sources`. */
  summary: string;
  whyItMatters: string;

  /** Structured (Call B), verified. */
  takeaways: Claim[];
  perspectives: Perspective[];
  /** Every claim above, flattened. This is what coverage is computed over. */
  claims: Claim[];
  comparisons: Comparison[];
  context: ContextLink[];
  glossary: GlossaryTerm[];
  /** Suggested next hops; each resolves to a real article. */
  drilldown: EntityRef[];

  coverage: CoverageReport;
  generatedAt: string;
  model: string;
  /** Set when served from the committed pre-warm cache. */
  prewarmed?: boolean;
}

/* ------------------------------------------------------------------ *
 * Streaming protocol
 * ------------------------------------------------------------------ */

export type StreamEvent =
  | { type: 'status'; stage: string; detail?: string }
  /** Zero-LLM first paint: resolved entity, graph facts, source list. */
  | { type: 'skeleton'; entity: ResolvedEntity; facts: EntityFacts; sources: SourceDoc[]; lead: string }
  | { type: 'prose'; delta: string }
  | { type: 'structured'; explainer: Explainer }
  | { type: 'done'; explainer: Explainer }
  | { type: 'error'; message: string; code?: string };

/* ------------------------------------------------------------------ *
 * Domain pack — the seam for non-history subjects
 * ------------------------------------------------------------------ */

export interface GatherResult {
  sources: SourceDoc[];
  facts: EntityFacts;
  /** Lead paragraph, rendered verbatim as the zero-LLM first paint. */
  lead: string;
}

/**
 * A subject domain the engine can explain.
 *
 * `resolve` returns an opaque context so a pack can hand whatever it already
 * fetched straight to `gather` instead of paying for the round trip twice.
 * Swapping this implementation — repo + AST connectors instead of Wikipedia
 * and Wikidata — is how the same pipeline, verifier and UI would explain a
 * codebase rather than a historical subject.
 */
export interface DomainPack<TCtx extends { entity: ResolvedEntity } = { entity: ResolvedEntity }> {
  id: string;
  /** Free text -> a real, addressable entity, plus whatever was fetched. */
  resolve(query: string, signal?: AbortSignal): Promise<TCtx>;
  /** Context -> numbered corpus + graph facts, within a token budget. */
  gather(ctx: TCtx, signal?: AbortSignal): Promise<GatherResult>;
  /** Per-type prompt guidance handed to both Claude calls. */
  guidanceFor(type: string): string;
}
