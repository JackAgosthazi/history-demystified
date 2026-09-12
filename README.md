# History Demystified

**Live: https://history-demystified.vercel.app**

Type a historical person, period, conflict or event. Get it explained from the ground up —
and every factual claim carries the exact sentence it came from, as a link that opens the
source scrolled to and highlighting that sentence.

Built for the Anthropic take-home, Theme 1 (Exploration & Understanding).

---

## The idea

Ask a language model about Napoleon and you get fluent prose with citations that may or may
not exist. The interesting problem is not "can it write a good explainer" — it can — but
"can a reader tell which parts to trust". This treats that as an architecture problem
rather than a prompting problem, with two rules:

> **The model never emits a URL, and never emits a date.**

Everything follows from those.

**Structured facts come from a knowledge graph.** Dates, parents, spouses, children, terms
of office, belligerents, casualties, and cause/effect edges are read from Wikidata. The
timelines and relationship diagrams are drawn from that record. Claude is never asked for a
date, so it can never get one plausibly wrong.

**Prose is constrained to quote-verifiable spans.** Claude may only assert something if it
can point at a verbatim span of a document that was actually retrieved. A server-side
verifier then finds that span in the source. Claims it cannot find stay on the page,
labelled, and the coverage score is shown — hiding them would make the number meaningless.

**Names are resolved, links are never generated.** Claude refers to other subjects by name;
code resolves each against Wikipedia and drops anything that does not resolve. A fabricated
citation is structurally impossible: an unknown source id fails lookup, an invented subject
fails resolution.

The honest claim is not "everything here is true" — Wikipedia is not truth. It is **"you can
check any of it in one click"**, which is a different and more useful promise.

---

## What it does

- **Four treatments.** Person, conflict, event and period each get the arrangement that
  answers their own first question: a family tree, or belligerents, or a cause-and-effect
  chain, or an era's contents. The type is decided from Wikidata's `instance of`, walking up
  `subclass of` when the class is unfamiliar.
- **Scope search.** "Japan 1600" is not a request for an article, so it is not treated as
  one. It runs a SPARQL query and returns what the record has for that place and period —
  no model call, nothing that can be invented, and every row a door into a full explainer.
- **Competing perspectives.** Other-language Wikipedia articles on the same subject are
  pulled in, chosen from the countries the subject involves, because the historiography of
  an event reads differently in the languages of the people it happened to. The German
  article calls Napoleon's rule a plebiscitary dictatorship; the French one calls him a
  founding father of French institutions. Both are quoted, in their own language, with a
  clearly labelled translation.
- **Drill-down.** Every named subject re-enters the pipeline. Breadcrumbs show the path, and
  stepping back costs nothing — it comes from your browser.

---

## Running it

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

The engine also runs without a browser, which is the fastest way to see what it does:

```bash
npm run explain -- "Napoleon"
npm run explain -- --json "Battle of Waterloo" > out.json
npm test
```

---

## How it is put together

```
lib/core/          the engine — no Next.js or browser imports anywhere
  connectors/      wikipedia, wikidata, sparql
  packs/history/   resolve, gather, classify, per-type templates, scope
  llm/             the two Claude calls, prompts, output schema
  verify/          normalize, match, text fragments, coverage
  pipeline.ts      resolve -> gather -> synthesize -> verify, as a stream
app/api/explain/   SSE adapter over the engine
scripts/explain.ts CLI adapter over the same engine
```

`lib/core` has three consumers — the SSE route, the CLI, and the pre-warm script — which is
what keeps it honest. An MCP server or a public API would be a fourth adapter, not a
rewrite. The `DomainPack` interface is the seam for a different subject entirely: swap the
connectors for repo and AST readers and the same pipeline, verifier and UI would explain a
codebase.

### The pipeline

1. **Resolve** — Wikipedia search to a real article, then its Wikidata item, then a type.
2. **Gather** — the lead, up to 14 sections, the graph record, and two to four
   other-language leads, inside a 30k-token budget. Article substance is very unevenly
   distributed — Napoleon's "Ruler of France" runs to ~9k tokens while "Arms" is 19 — so a
   flat per-section cap spends the corpus on trivia and truncates away the history. Sections
   the type template cares about get a much larger allowance, and `Legacy` and
   `Historiography` are always kept because that is where historians disagree.
3. **Synthesize** — two Claude calls in parallel over the same corpus: streaming prose, and
   a structured pass for takeaways, perspectives, key events, figures, comparisons, context.
4. **Verify** — normalize, match, check relevance, build deep links, score coverage.
5. **Stream** — progressive, because the honest total is 60–90 seconds.

### The verifier

Models tidy text as they copy it: en dashes become hyphens, `&nbsp;` becomes a space, curly
quotes straighten, `[1]` markers vanish. Those are not fabrications and are not scored as
such, so both sides are normalized first — keeping an offset map, which is what lets a match
project back onto the raw source to build the `#:~:text=` deep link.

Matching is exact first, then word-trigram containment, because the common failure is
splicing rather than invention — the model joins two clauses or drops a parenthetical. Then
a relevance gate: a substring check only proves the quote *exists*, and cannot see a real
quote attached to a claim it does not support, which is the worse error. The claim's proper
nouns and figures are checked against the matched region.

Across a language boundary the check is necessarily weaker — an English claim shares almost
nothing with a Spanish quote — so it folds diacritics, lowers the threshold, and declines to
judge when there is only one checkable token.

---

## Cost and limits

Measured, not estimated: **~$0.44 per live query** on Claude Opus 5 — about 40k input tokens
across both calls and 9k output. Output is 51% of that.

- The example topics are **pre-generated and committed**, so browsing costs nothing.
- A cache check runs after the subject is known but before any tokens are spent, so drilling
  into an already-generated subject is free.
- A global daily ceiling and a `CACHE_ONLY=1` kill switch bound the deployment. Both are
  in-process, so they reset on a cold start and are per-instance — stated plainly rather
  than dressed up. The real ceiling is a hard spend limit on the Anthropic workspace.

**Prompt caching**: already on for the system prompts, worth about 5%. Sharing the corpus
between the two calls would save a further ~13%, but only by giving them an identical prefix
and running them sequentially, which adds 40–60 seconds. Not worth it for an interactive
demo. Details in [docs/DESIGN.md](docs/DESIGN.md).

## Privacy

No accounts, no cookies, no analytics, no server-side database. Explainers you have read are
cached in your own browser and the breadcrumb path is in sessionStorage; both are clearable
from `/privacy`. Wikimedia and Anthropic are called from the server, so they never see your
IP address.
