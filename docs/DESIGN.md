# Design rationale — History Demystified

**Live:** https://history-demystified.vercel.app
**Repo:** https://github.com/JackAgosthazi/history-demystified
**Theme:** 1 — Exploration & Understanding
**Time spent:** ~3 hours

---

## Why this theme, and why this shape

History is taught badly, and the reason is rarely that the facts are unavailable. It is that
a newcomer cannot get a foothold: they do not know when the thing happened relative to
anything they already know, who else was in the room, what was contested about it, or which
parts of the story historians actually argue over. Wikipedia has all of this and buries it in
eight thousand words with no entry point.

An LLM is obviously good at producing an entry point. The problem is that a fluent,
confident, plausibly-cited explanation is exactly what a fabricated one looks like, and the
reader — who by definition knows nothing about the subject — has no way to tell. For a
teaching tool that is not a cosmetic flaw. It is the whole problem.

So the interesting question is not "can Claude explain the Hundred Years' War" (it can) but
**"can the reader tell which parts to trust, without already knowing the answer?"**

## What is non-obvious

I treated grounding as an architecture problem rather than a prompting problem. Two rules:

> **The model never emits a URL, and never emits a date.**

These are not instructions in a prompt that the model might drift from. They are properties
of the system.

**Dates and relationships come from a knowledge graph.** Wikidata already holds birth and
death dates, parents, spouses, children, terms of office with start and end qualifiers,
belligerents, casualties, and cause/effect edges — as structured data with references. So
the timeline and the relationship diagrams are rendered from that. Claude is never asked for
a date, which deletes an entire category of error rather than mitigating it. The payoff is
visible: Napoleon's timeline shows Emperor of the French twice, 1804–1814 and again through
the Hundred Days, with overlapping tenures as overlapping bars, because that is what the
record says. No model produced that.

**Prose is constrained to spans that can be checked.** Claude may only assert something if it
can quote a verbatim span of a document that was actually retrieved, cited by an id from a
numbered corpus. A server-side verifier then finds that span. Because verification produces a
character offset, each verified claim links out as a [text
fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments) —
`…/wiki/Napoleon#:~:text=…` — so clicking a sentence lands you on Wikipedia scrolled to and
highlighting the sentence it came from. Verification stops being a number I assert and
becomes something the reader does in one second.

**Fabricated citations become structurally impossible.** The schema has no URL field. Claude
names a subject; code resolves that name against Wikipedia and drops it if it does not
resolve. An unknown source id fails lookup. There is no path by which a made-up link reaches
the page.

**Disagreement is retrieved, not invented.** Asking a model for "multiple perspectives"
produces four paraphrases of one perspective. Instead the corpus includes the same article in
other languages, chosen from the countries the subject actually involves. The German article
on Napoleon calls the Consulate and Empire a dictatorial regime with plebiscitary elements;
the French one presents him as a founding father of contemporary French institutions. Both
are quoted in their own language with a clearly labelled translation. The disagreement is
real and sourced, because it was found rather than generated.

**Scope queries get a different answer entirely.** "Japan 1600" is not a request for an
article, and answering it as if it were is how most search boxes fail. The honest reading is
that it is a different *kind* of question — a scope, a place crossed with a stretch of time,
rather than a subject. So it gets a different pipeline, and that pipeline contains no model
at all.

### Why this is the most interesting part of the build

It is the clearest statement of the thesis. The rest of the app works hard to constrain what
a model may assert; this asks whether the model is needed at all, and finds that it is not.
A knowledge graph answers "what happened in this place, in these years" natively and
exactly. Reaching for an LLM here would add cost, latency and a fabrication risk in exchange
for nothing. **Route by the shape of the question** turns out to be a more powerful idea
than "ground the model better."

The result: free, about five seconds, and structurally incapable of inventing anything —
every row is a real Wikidata item with a real English article behind it.

### Recognising a scope query

Deliberately conservative, because the failure mode of being clever here is bad. "1984" is a
novel and "Fahrenheit 451" is not a temperature, so a time expression alone is never enough
— a residual place is always required. Four time forms are understood:

| Input | Window | Shown back as |
|---|---|---|
| `Japan 1600` | 1590–1610 | "around 1600" |
| `England 1500-1600` | as given | "1500–1600" |
| `France 1790s` | 1790–1799 | "the 1790s" |
| `Italy 16th century` | 1501–1600 | "the 16th century" |

The interpretation is rendered back in the heading — *"Japan, around 1600"* — so a reader can
see that a bare year was widened to a decade either side, rather than wondering why 1594
appears.

There are two fall-throughs, and both matter more than the parser. If no place survives
parsing, the query goes to normal subject resolution. And if the place resolves but the
survey comes back empty — "Japanese cuisine 1600" resolves to an article that is not a
country — it also falls through, rather than presenting an empty page as an answer.

### Making the graph query actually work

This is where the real engineering was. The obvious query — start from the country, or start
from the date — makes the query planner scan an enormous set, and Wikidata's public endpoint
answers **502** rather than waiting. My first version did exactly that.

The fix was to anchor on a small `VALUES` set of event classes (battle, war, siege, treaty,
revolution, historical period, and a dozen more) so the planner starts from a few thousand
candidates instead of millions:

```sparql
VALUES ?class { wd:Q178561 wd:Q198 wd:Q180684 … }
?item wdt:P31 ?class ; wdt:P17 wd:Q17 ; wikibase:sitelinks ?sitelinks .
{ ?item wdt:P585 ?date } UNION { ?item wdt:P580 ?date }
FILTER(YEAR(?date) >= 1590 && YEAR(?date) <= 1610)
```

Same results, **502 → one second**. People are a separate query, matching on citizenship and
a lifespan that overlaps the window rather than a birth inside it, so someone born in 1543
and dominant in 1600 still appears.

Two smaller things that were only discoverable by running it:

- **The two queries must run sequentially.** Issued in parallel they are throttled, and the
  second silently returns nothing — the people column was empty for an hour while the same
  query worked perfectly on its own.
- **SPARQL is used only to discover identifiers.** Everything readable comes from a second
  batch call. The label service is unreliable under `ORDER BY` — it returned a bare
  "Q193344" where Miyamoto Musashi should have been — and only the entity call yields the
  English Wikipedia title each row needs in order to be a working link. Items with no English
  article are dropped, because there would be nothing to drill into.

### Ranking, and its bias

Results are ordered by interwiki count — how many language editions carry an article. It is
a crude proxy for significance and it works well in practice: for Japan around 1600 it puts
the Battle of Sekigahara and the Edo period at the top, and Tokugawa Ieyasu, Toyotomi
Hideyoshi and Miyamoto Musashi at the top of the people.

It should be named for what it is, though: a measure of *how much Wikipedia covers
something*, which inherits Wikipedia's own biases toward European and anglophone subjects.
For a tool whose whole argument is that the reader should be able to see where a claim comes
from, the ranking deserves the same honesty as the citations do.

### What it does not do yet

Scoping is by country, via `country` and `citizenship`, so pre-modern polities and anything
that does not map onto a modern state are patchy — "Mesopotamia 2000 BC" is much weaker than
"Japan 1600". There is no way to narrow by topic ("Japan 1600 art"). And the ten-year window
around a bare year is a guess that happens to read well, not a considered choice.

## Key decisions and tradeoffs

**Two Claude calls in parallel, not one.** Streaming prose and a structured pass run
simultaneously over the same corpus. One call producing structured output shows the reader
nothing until it parses; splitting means prose streams word by word while the structured half
is still working. The cost is forgoing the prompt-cache discount the second call could get
from the first's prefix — measured at about $0.06 a query. Worth it against thirty seconds of
someone watching a spinner.

**Progressive rendering with a zero-token first paint.** The honest total is 60–90 seconds.
About one second in, before any tokens are spent, the reader already has the resolved
subject, the Wikidata timeline, the relationship structure and the lead paragraph.

**Rank-weighted corpus budgeting.** Article substance is wildly uneven: Napoleon's "Ruler of
France" is ~9,000 tokens and "Arms" is 19. A flat per-section cap — my first version — spent
the budget on trivia and truncated away the history. Sections the type template cares about
now get a much larger allowance, and `Legacy` and `Historiography` are always kept, because
that is where historians disagree with each other and the perspectives panel is empty without
them.

**Unverified claims stay on the page.** Dropping them would push coverage to a meaningless
100% and take the judgement away from the reader. They render with the reason attached.

**Prompt caching: measured, then declined.** Already on for the system prompts (~5%). Sharing
the corpus between the two calls needs an identical prefix and sequential execution; that is
~13% saved for 40–60 seconds added. Declined. The levers that actually matter are the
pre-generated cache (those queries cost $0) and the pre-spend cache check on drill-downs.

**No database.** Everything the app remembers is in the reader's browser. It fits the
privacy story, and it means going back through breadcrumbs costs nothing.

## How this is evaluated

1. **Every run is its own eval.** Coverage is computed on every explainer and shown to the
   reader: *N of M claims located in the source they cite*. Across the twelve pre-warmed
   topics it runs **82–100%, mean 91%**, and the pre-warm script prints it per topic, so a
   prompt change that degrades grounding shows up as a number moving.
2. **The check is mechanical, not a judge model.** Normalise both sides, match exactly, then
   by word-trigram containment for splices. Nothing is graded by an LLM, so the evaluation
   cannot inherit the generator's blind spots — the usual failure of LLM-as-judge on exactly
   this task.
3. **A relevance gate catches what a substring check structurally cannot**: a real quote
   attached to a claim it does not support. The claim's proper nouns, years and figures must
   appear in the matched region.
4. **Whole classes of fabrication are excluded by construction, so they need no evaluation.**
   Dates and relationships come from Wikidata. The schema has no URL field. Entity names are
   resolved against Wikipedia and dropped if they do not resolve. A fabricated citation fails
   lookup rather than scoring badly.
5. **The verifier itself is unit-tested against adversarial fixtures** — a spliced quote that
   should pass, a paraphrase that should fail, a genuine quote attached to an unrelated claim
   that should fail, plus en dashes, `&nbsp;`, curly quotes and `[1]` markers.

**What the number does not mean.** Coverage measures *traceability, not truth*. A claim can
be perfectly verified against a source that is itself wrong, or be a subtle misreading of a
sentence it genuinely quotes, and the summary prose carries source markers but is not
span-verified. The honest reading is "this many assertions can be checked in one click" — not
"this many are correct". Closing that gap needs a labelled set with human adjudication, which
is the first thing I would build next.

## Iterations, and what using it taught me

Almost everything worth fixing was invisible until I read real output.

- **Cross-language verification was rejecting correct citations.** An English claim shares
  almost nothing with a Spanish quote — "wars" and "guerras" do not match. Coverage on
  Napoleon sat at 64% with every failure a false negative. Folding diacritics, lowering the
  threshold across a language boundary, and declining to judge on a single token took it to
  100%.
- **Claims that named their own source could never verify against it.** "French Wikipedia
  describes Napoleon's reforms as…" cites the French article, in which the words "French
  Wikipedia" naturally do not appear. Fixed in the prompt: state the assertion, never its
  provenance — that is attached structurally.
- **A substring check is not enough.** It proves a quote exists, not that it supports the
  claim, which is the more damaging error. Added a relevance gate over the claim's proper
  nouns and figures.
- **A silent `catch` hid a malformed request for an hour.** A Wikidata parameter is illegal
  with more than one title, so every batch lookup failed — and the bare catch meant
  comparisons still rendered, just with no dates. It looked like a modelling weakness rather
  than a broken URL. The catch now logs.
- **A person's birthday was rendering as an event date.** "Abdication and the Bourbon
  restoration" resolved to Louis XVIII and displayed 17 November 1755. Event dates now come
  only from `point in time` or `start time`.
- **The first perspectives panel was four translations of one paragraph.** Prompting
  explicitly for *divergences in emphasis*, and always retaining the historiography sections,
  produced genuine disagreement instead.
- **A SPARQL query that 502'd became a one-second response** for identical results, by
  anchoring on a small set of classes rather than starting from the country or the date.
- **Two concurrent SPARQL queries** were being throttled, silently emptying the people list on
  scope pages. Serialised.

## What I would do next

- **Verify the summary too.** The narrative carries source markers but is not span-verified.
  Running the same verifier over its sentences would extend the guarantee to the part people
  actually read first.
- **More charts.** Casualty comparisons for conflicts and a map from Wikidata coordinates are
  both straightforward from data already fetched.
- **A second, clearly-labelled source tier.** Anthropic's hosted `web_search` and `web_fetch`
  would broaden the corpus well beyond Wikimedia. It has to be a separate tier with its own
  verification story, not blended in.
- **An MCP server.** `lib/core` already has three adapters; a fourth exposing
  `explain_concept` is perhaps sixty lines.
- **A codebase pack.** The `DomainPack` interface is the seam — swap the connectors for repo
  and AST readers and the same pipeline, verifier and UI explain a codebase instead.
- **Durable rate limiting.** The current ceilings are in-process and reset on cold start.

## Using AI to build it

Built with Claude Code throughout. The division that worked: I held the product judgement and
the architecture — the two rules above, what to cut, what "honest" means here — and used
Claude for implementation velocity and as a critic. The most valuable single use was handing
a subagent the proposed pipeline and asking it to attack the grounding design before I wrote
any of it. It predicted the cross-language quoting failure and pushed me toward Wikidata for
dates and toward text-fragment links, all of which turned out to be right.

The rest of the value came from tight loops: run it on a real subject, read the actual
output, find the thing that is subtly wrong, fix it. Every item in the iterations list above
came from looking at output, not from reasoning about the design.
