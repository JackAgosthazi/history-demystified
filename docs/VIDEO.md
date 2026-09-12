# Video script — ~5 minutes

Record at 1440×900 or wider so the timeline and the section nav have room. Use the
**deployed** site, https://history-demystified.vercel.app, so nothing looks local.

**Before recording:** open `/privacy`, clear stored data, and reload. Otherwise the first
page loads from your browser cache and the progress panel — which is worth showing — never
appears. Have a second tab on the repo.

The structure: **show it working first, explain why it is built that way at the end.** The
close walks the five points from "What is non-obvious" in the design doc, which is the real
argument of the project.

---

## 0:00 — The problem (~40s)

*Home page, nothing typed yet.*

> Hi, my name is Soma, and I'm here to show you the app I've built. History is a remarkable thing that all too often gets taught badly.
> It's hard to accurately and succinctly convey the historical context and meaning of seemingly arbitrary events.
> The app I've built I'm hoping will help with that in ways that can be extrapolated outside the realm of history.
>
> Claude is obviously good at writing that explanation. The problem is that a confident,
> fluent, plausibly-cited explanation is exactly what a fabricated one looks like — and the
> reader, who by definition knows nothing, can't tell the difference. For a teaching tool
> that isn't cosmetic. It's the whole problem.

## 0:40 — What it does (~60s)

*Click an example — it loads instantly from the committed cache.*

> Every example here is pre-generated, so browsing costs nothing.

*Scroll at a readable pace. Don't narrate every section — let them read.*

> Key takeaways, a timeline, who was connected to whom, where accounts differ, and a way
> further in from almost everything on the page.

*Search something not in the cache so the progress panel appears.*

> A live one takes about a minute, and the page tells you where it is. The timeline and the
> sources are already there while it works — those come from structured data and need no
> model at all.

## 1:40 — Verification, shown not claimed (~45s)

*Open a takeaway's "show the source text", then click through.*

> Every claim carries the sentence it came from. And this is the part that matters —

*The Wikipedia page opens, scrolled to and highlighting that exact sentence.*

> — not a link to the article. To the sentence. I didn't have to trust anything.

*Point at the coverage badge, then find an unverified claim.*

> And where it fails it says so. Claims that don't verify stay on the page, labelled, with
> the reason. Hiding them would push that number to a meaningless 100% and take the
> judgement away from the reader.

## 2:25 — Scope queries (~35s)

*Search "England in the XV century".*

> This isn't a request for an article — it's a place crossed with a stretch of time. Most
> search boxes would guess at the nearest single subject.

*Results appear in about five seconds.*

> Two SPARQL queries against Wikidata: one for events, one for people. No model call at all,
> so it's free, fast, and can't invent anything. Every row opens as a full explainer.

## 2:55 — Closing: why it's built this way (~1:35)

*Back on an explainer page. This is the argument — slow down here.*

> Five things make this different from asking Claude the same question.
>
> **One. The rules are in the code, not the prompt.** Claude isn't allowed to make up URLs or
> dates — not discouraged from it, prevented. The output schema has no URL field. A
> fabricated citation fails a lookup rather than scoring badly.
>
> **Two. Dates and relationships come from Wikidata.** Claude never has to build or guess a
> knowledge graph, so every bar on that timeline is a vetted record, not a recollection.
>
> **Three. Prose is constrained to spans that can be checked.** Every claim carries a source
> id and a verbatim quote, and server-side code confirms that quote really appears in that
> document. That's what the coverage number counts.
>
> **Four. Disagreement is preserved, not averaged.** History depends who you ask. Rather than
> flattening that into a bland consensus, the app pulls the same article in other languages
> and quotes them against each other — the German account calls Napoleon's rule a
> plebiscitary dictatorship, the French one calls him a founding father of French
> institutions. Both sourced. The reader decides.
>
> **Five. It knows when not to use a model at all.** The scope search is the clearest case:
> where a graph answers the question exactly, reaching for an LLM adds cost, latency and
> risk in exchange for nothing.

## 4:30 — Where it goes, and time spent (~30s)

> At its core this isn't a history tool — it's a tool for understanding a subject you're new
> to, where the inputs are predictable enough to build real structure around. The same shape
> would explain a codebase, or help make sense of a candidate's history in a hiring loop:
> gather rigorously, present it well, and leave the judgement to the human.
> CMS system, Opus 5, how to use this in real-life examples.
> This took me about five hours. 
>

---

## Worth showing if there's room

- The CLI: `npm run explain -- "Napoleon"` — same engine, no browser, prints coverage.
- A drill-down two levels deep, then stepping back through the breadcrumbs instantly.
- `scripts/diag/cache-check.ts` — measuring rather than assuming.

## Skip

- Deployment, folder structure, the dependency list.
- Narrating every section while scrolling.
- Apologising for what isn't finished. Say what's next once, and move on.
