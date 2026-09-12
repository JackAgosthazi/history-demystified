# Subagent — design critique of the grounding pipeline

12 entries.


---

### Jack

You are pressure-testing a technical design for a take-home prototype. Do NOT write code. Return a concise critique + concrete recommendations. Working dir: /Users/atman/Documents/code (new project will live in a new subdir). This is a greenfield project — there is no existing codebase to explore, so do not waste time searching the filesystem.

CONTEXT — the product:
A web app "history explainer". User types a historical concept (person / time period / conflict / single event). App produces an accessible, visual explainer for a complete newcomer: overview, key takeaways, timeline, family tree / relationship graph, comparisons to similar figures/events, multiple opposing perspectives, broader causal context, and drill-down chips (click "Battle of Waterloo" inside the Napoleon explainer → generate an explainer for Waterloo). HARD REQUIREMENT: Claude must not fabricate facts; every claim must carry a citation the user can click and independently verify.

CONSTRAINTS:
- Must use the Anthropic API (Claude). Assume Anthropic's HOSTED web_search / web_fetch server tools are NOT permitted — we must do our own retrieval.
- Free hosting only. Node 22 available via nvm. No paid services.
- No user accounts, no server-side DB. Client-side storage only (IndexedDB), no PII.
- ANTHROPIC_API_KEY must never reach the browser.
- Assignment time budget: target 1-2 hours, hard limit 8 hours. Scoping ability is explicitly graded.

VERIFIED FACTS (I probed these myself, treat as ground truth):
- Wikipedia REST search, Action API plaintext extracts, langlinks, and per-language REST summaries all work keylessly. Wikidata `wbsearchentities` and the SPARQL endpoint (query.wikidata.org) work keylessly. Wikisource REST search works.
- Wikidata REST path /w/rest.php/wikibase/v0/... is 404 (v0 is wrong).
- Chronicling America / loc.gov returns 403 to scripted requests — unusable.
- Cloudflare Workers FREE: 100k req/day, **10ms CPU per invocation**, 50 subrequests/request, no wall-clock cap, secrets+KV+static assets supported.
- Vercel Hobby FREE: 300s max function duration, 2GB/1vCPU, full Node, streaming supported, 4.5MB response body cap.
- Claude models: claude-opus-5 ($5/$25 per MTok), claude-sonnet-5 ($2/$10), claude-haiku-4-5 ($1/$5). Thinking: `{type:"adaptive"}`. Effort via `output_config.effort`. Structured outputs via `output_config.format` — NOTE: incompatible with the API's native document `citations:{enabled:true}` feature (returns 400).

PROPOSED PIPELINE (critique this):
1. RESOLVE: query → candidate entities via Wikipedia search + Wikidata wbsearchentities; classify person/period/conflict/event using Wikidata P31 (instance of), Claude fallback. Disambiguation UI.
2. GATHER (deterministic code, no LLM): parallel fetch of a numbered corpus of SourceDocs {id,url,title,publisher,lang,retrievedAt,text} — en.wikipedia lead+sections, 2-4 other-language Wikipedia leads chosen by relevance (national historiography = the "opposing perspectives" mechanism), Wikidata structured statements (dates, P22/P25/P26/P40 family, P155/P156 follows, P361 part-of, P1344 participant-in, P828/P1542 cause/effect), Wikisource primary texts.
3. SYNTHESIZE: ONE Claude call, whole corpus in context, `output_config.format` JSON schema → typed Explainer doc. Every atomic claim must carry {sourceId, quote} where `quote` is a VERBATIM span from that source doc.
4. VERIFY (deterministic code): normalize+substring-check every quote against the fetched doc text. Claims that fail are flagged/downgraded, not silently kept. Return a verification report (coverage %) and show it in the UI.
5. Stream SSE progress events through all stages; render typed data into SVG timeline / relationship graph / comparison cards / perspective panel / drill-down chips.

WHAT I WANT FROM YOU — be specific and skeptical:
(a) Failure modes of the "verbatim quote substring check" as a grounding mechanism. How often will Opus 5 paraphrase instead of quoting? What normalization is needed (unicode dashes, nbsp, ellipses, HTML entities, whitespace)? Should we use fuzzy matching, and if so what algorithm and threshold? Is there a better cheap mechanism? Consider the alternative of two calls: call 1 with native `citations:{enabled:true}` on documents for grounded prose, call 2 with structured outputs for the viz data — is the extra latency/cost worth it?
(b) Is one giant Claude call right, or should synthesis be decomposed (e.g. narrative pass + viz-extraction pass, or per-section parallel calls)? Consider latency (target: first meaningful paint fast), cost per query, and prompt caching of the corpus.
(c) Corpus size management: how many tokens should we feed? What's a sane selection/truncation policy so we stay useful without blowing cost?
(d) Vercel vs Cloudflare for THIS workload given the 10ms CPU cap — is Cloudflare actually disqualified? Which do you recommend and why? Any gotcha with SSE on Vercel Hobby?
(e) Cost + abuse control: the API key is the author's personal key and reviewers will hit the deployed demo. Concrete plan for pre-warmed cached examples, per-IP rate limiting without a DB, and a global daily spend ceiling.
(f) The 8-hour limit is the dominant constraint. Given the pipeline above, propose an aggressive MVP cut list: what is the smallest build that still demonstrates the core idea impressively, and what should be dropped or faked. Be ruthless and concrete.
(g) Anything in the design that is over-engineered or that you'd cut outright.

Keep the response under ~1200 words. Prioritize concrete, actionable specifics over general advice.


---

### Claude

## (a) The verbatim-substring check

**It will fail more than you expect, and the failures are systematic, not random.** Expect 15–35% of spans to miss on exact match, concentrated in predictable buckets:

1. **Cross-language is a total failure.** Your best feature (non-English perspectives) is where the check breaks hardest — Opus will quote a French lead *in English translation*, which can never substring-match. Fix in the schema: `quote` (source language, verbatim) + `quoteTranslation` (English, unverified, clearly labeled in UI).
2. **Splicing.** Model joins two clauses across a sentence boundary or drops a parenthetical/date qualifier. Longest offender class. Mitigate by capping quotes at ~180 chars in the schema description and requiring "a single contiguous span."
3. **Silent tidying:** expanded abbreviations, normalized dates, stripped `[1]` citation markers, dropped IPA/pronunciation parentheses.

**Normalization (do all of these, both sides):** NFKC → strip zero-width (`\u200b-\u200d\ufeff`) → all space classes (`\u00a0\u2007\u2009\u202f\u3000`) to `' '` → dashes `\u2010-\u2015\u2212` and `--` to `-` → quotes `'''""„«»` to `'`/`"` → `…`→`...` → decode HTML entities → strip `\[\d+\]` and `\[[a-z]\]` → collapse whitespace → lowercase. Keep an index map from normalized offsets back to raw offsets so you can build links.

**Fuzzy:** yes, but don't Levenshtein the whole doc. Two-stage: `indexOf` first (catches ~80%); on miss, build a word-3-gram inverted index over the doc, find the best candidate window by shingle overlap, then run bounded similarity on that window only. Thresholds: `≥0.92` = VERIFIED_FUZZY, `0.75–0.92` = PARTIAL (show with a warning badge), `<0.75` = UNVERIFIED. Honestly, for the demo a pure **content-word 3-gram containment ratio ≥0.8** is O(n), 30 lines, and easier to explain in the README than an edit-distance threshold.

**The deeper hole:** a substring check proves the quote *exists*, not that the *claim follows from it*. A reviewer will ask this in five seconds. Cheap patch: extract numbers, years, and capitalized tokens from `claim` and require ≥50% of them to appear in the quote-or-its-±200-char window. Catches "real quote, irrelevant to claim," which is the actual failure mode.

**Highest-leverage addition:** once verified, you have the char offset — emit the citation link as `…wikipedia.org/wiki/X#:~:text=<encoded first 8 words>,<last 8 words>`. Clicking a claim scrolls and highlights the exact sentence on Wikipedia. Near-zero cost, enormous demo impact, and it makes verification *visible* rather than a percentage.

**Two-call vs one on native citations:** native `citations` is the more correct grounding mechanism (offsets come from the API, no verifier needed), but I'd not make it the MVP — your hand-rolled verifier with a coverage report is a *better artifact for a graded take-home* than "I turned on a flag." If you do both, **run them in parallel, not sequentially** — the narrative call and the viz call are independent, so the latency argument mostly evaporates. Caveat: parallel = both miss prompt cache and pay full input; sequential = second call pays 0.1x. At these corpus sizes that's ~$0.03. Take the latency.

## (b) Decompose — and cut work out of the LLM entirely

The single biggest design improvement: **don't ask Claude for dates or family edges at all.** Wikidata already returns P569/P570/P22/P25/P26/P40/P155/P156 deterministically, with reference URLs. Generate the timeline and relationship graph from structured data in code; the LLM only labels, orders, and writes prose. That deletes an entire hallucination class and shrinks your JSON schema by half.

Then: **three producers, staged for perceived speed.**
- t≈1s: render the Wikipedia lead paragraph verbatim as "Source overview" + the Wikidata-derived timeline/tree skeleton. Zero LLM. This is your first meaningful paint.
- t≈3–25s: Call A (Sonnet 5, streaming text) — overview, takeaways, perspectives. Streams token-by-token into the page.
- Parallel: Call B (Sonnet 5, `output_config.format`) — comparisons, causal context, drill-down chips, claim/quote objects.

One giant Opus call over 30k tokens with a large schema is 60–120s to *first* rendered pixel, because structured output doesn't render until parsed. That alone justifies the split.

## (c) Corpus budget

Hard cap **~30k input tokens**, allocated: en lead full (~700 tok) + 8 selected sections capped at 1200 tok each (~10k) + Wikidata statements serialized (~2k) + 3 non-English leads (~2.5k) + system/schema (~2k). Section selection: drop `References|Notes|Bibliography|Further reading|External links|See also|Gallery|Sources`, then keep by heading match against a per-type template (person: early life / rise / major events / death / legacy / historiography). **Always keep "Legacy" and "Historiography"** — that's where real disagreement lives, and it's a better perspectives source than three foreign leads that paraphrase the same facts. Mark truncated sections explicitly so the verifier doesn't chase quotes into elided text. Cost at that size: ~$0.09 in + ~$0.06 out on Sonnet ≈ **$0.15/query**; Opus ≈ $0.45. Default Sonnet.

On perspectives: pick languages from Wikidata belligerents/country (P710/P1344/P27) rather than "relevance," and prompt explicitly for **divergences in emphasis**, not summaries. Otherwise you get four translations of the same paragraph and the feature reads as noise.

## (d) Hosting

**Cloudflare free is disqualified — correctly.** 10ms CPU/invocation covers I/O-bound proxying fine (awaits don't count), but your verifier normalizes and 3-gram-indexes ~150k chars per request, and re-encoding thousands of SSE frames is real CPU. You'd be fighting the limit all evening.

**Vercel Hobby, Next.js App Router.** Gotchas: `export const maxDuration = 300` and `export const dynamic = 'force-dynamic'`; headers must include `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` or the CDN buffers your stream; send a `: ping\n\n` heartbeat every 10s; the 4.5MB cap applies to buffered responses, not streams. Use the Node runtime, not Edge.

## (e) Cost and abuse

1. **Anthropic Console workspace with a $20 spend limit and a key scoped to that workspace.** This is the only ceiling that actually holds; everything else is best-effort.
2. **Commit 6–8 pre-generated explainers as static JSON** in `/public/cache/` (Napoleon, French Revolution, Waterloo, Cuban Missile Crisis, Cleopatra…). Home page = those cards. Most reviewers never trigger a live call. Drill-down chips on those topics resolve to cache too.
3. **Gate before spending:** query >80 chars → reject; Wikipedia search returns nothing → reject *without any LLM call*. This also makes the endpoint useless as a general LLM proxy (fixed corpus, fixed schema).
4. In-process `Map` token bucket keyed by `sha256(salt + first x-forwarded-for hop)`, 5/hour. Per-instance and leaky — say so in the README rather than pretending otherwise.
5. Module-level daily token counter + `CACHE_ONLY=1` kill switch env var.

## (f) The 8-hour cut

Deploy a hello-world to Vercel in the first 20 minutes. Then:

| Time | Build |
|---|---|
| 0:20–1:20 | GATHER: Wikipedia search + extracts + `wbgetentities` on the QID (**skip SPARQL entirely** — one wbgetentities call gives you every property you listed) |
| 1:20–2:45 | Call A streaming prose + Call B structured, in parallel |
| 2:45–3:30 | Verifier: normalization + exact match only, coverage % |
| 3:30–5:30 | UI: overview, takeaways, CSS timeline (not SVG), citation popovers with `#:~:text=` links, drill-down chips |
| 5:30–6:30 | 2 non-English leads + perspectives panel |
| 6:30–8:00 | Pre-warm cache, rate limit, README of tradeoffs |

**Fake or drop:** disambiguation UI (take top hit, offer alternates as chips); force-directed graph (three-row CSS family tree from Wikidata, or drop); Wikisource; fuzzy matching (ship exact-only, put fuzzy in "future work" with the algorithm named); IndexedDB (`localStorage` + `idb-keyval` if you must); the SSE event taxonomy (five coarse events, not a bus); Opus.

**Keep at all costs:** drill-down chips (highest wow-per-minute — it's just re-entering the pipeline) and clickable verified citations.

## (g) Cut outright

- **SPARQL** — replaced by one `wbgetentities` call.
- **The classify step** — pass P31 labels into the prompt and use one schema with optional fields. A separate classifier with a Claude fallback is a whole code path buying nothing.
- **`publisher` / `retrievedAt` / `lang` metadata plumbing** beyond `{id, url, title}`.
- **"Flagged/downgraded" verification semantics** — two states: verified, unverified. Nothing else.
- **Relevance scoring for language selection** — hardcode from Wikidata country/belligerent, fall back to `[fr, de, es, ru]`.

One framing note for the README: don't claim "no fabrication" — Wikipedia isn't truth. Claim **"every assertion is traceable to a cited source span the reader can click and check,"** and make the coverage % your headline metric. That's a defensible claim, and it's the one your architecture actually delivers.

### Critical Files for Implementation
(Greenfield — these are the files the plan implies, under a new subdir e.g. `/Users/atman/Documents/code/history-explainer/`)
- `/Users/atman/Documents/code/history-explainer/app/api/explain/route.ts` — SSE handler, `maxDuration`, gating, rate limit, orchestration of the two parallel Claude calls
- `/Users/atman/Documents/code/history-explainer/lib/gather.ts` — Wikipedia search/extracts + `wbgetentities`, section selection and token budgeting
- `/Users/atman/Documents/code/history-explainer/lib/verify.ts` — normalization pipeline, offset map, exact match, `#:~:text=` link construction, coverage report
- `/Users/atman/Documents/code/history-explainer/lib/schema.ts` — the Explainer JSON schema shared by `output_config.format` and the UI types
- `/Users/atman/Documents/code/history-explainer/public/cache/*.json` — pre-warmed explainers that make the demo free to browse
