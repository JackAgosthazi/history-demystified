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
article. It runs a SPARQL query and returns what the record holds for that place and period,
ranked by how many language editions cover each subject. No model call at all: free, about
five seconds, incapable of inventing anything, and every row is a door into a full explainer.

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
