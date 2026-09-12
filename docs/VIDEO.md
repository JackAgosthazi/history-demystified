# Video script — ~5 minutes

Record at 1440×900 or wider so the timeline and nav have room. Use the
**deployed** site, https://history-demystified.vercel.app, so nothing looks local.

**Before recording:** open `/privacy` and clear stored data, so the first load shows the
real thing rather than a browser cache hit. Have a second tab ready on the repo.

Timings are a guide. The aim is to be specific rather than complete — pick the two or three
things that are genuinely non-obvious and show them properly.

---

## 0:00 — The problem (~40s)

*On the home page, without searching yet.*

> History is taught badly, and usually not because the facts are hard to find. It's that if
> you know nothing about a subject, you can't get a foothold — you don't know when it
> happened relative to anything you already know, who else was involved, or what's actually
> contested about it.
>
> An LLM is obviously good at writing that explanation. The problem is that a confident,
> fluent, plausibly-cited explanation is exactly what a fabricated one looks like — and the
> reader, who by definition knows nothing, has no way to tell. For a teaching tool that
> isn't cosmetic. It's the whole problem.
>
> So the question I set myself wasn't "can Claude explain the Hundred Years' War". It can.
> It was: **can the reader tell which parts to trust, without already knowing the answer?**

## 0:40 — Show it working (~50s)

*Click an example topic — Napoleon loads instantly from the committed cache.*

> Everything here is built for someone starting from zero.

*Scroll through at a readable pace: takeaways, timeline, relationships. Don't narrate every
section.*

> And this is the part that matters.

*Open one takeaway's "show the source text", then click "Open … at this sentence".*

> That's Wikipedia, scrolled to and highlighting the exact sentence the claim came from. Not
> a link to the article — to the sentence. I didn't have to trust anything.

## 1:30 — The two rules (~70s)

*Back on the explainer, hovering the timeline.*

> Two rules do most of the work, and they're properties of the system rather than requests
> in a prompt.
>
> **The model never emits a date.** Every bar here is Wikidata — birth, death, terms of
> office, with the start and end qualifiers. Napoleon shows as Emperor twice, 1804 to 1814
> and again through the Hundred Days, because that's what the record says. Claude was never
> asked for a date, so it can't get one plausibly wrong.
>
> **The model never emits a URL.** It cites a numbered source and quotes a verbatim span.
> Server-side code then finds that span in the document we actually fetched — and because
> that gives a character offset, the citation becomes a text fragment link. A made-up
> citation isn't unlikely here, it's structurally impossible: an unknown source id fails
> lookup, an invented subject fails resolution.

*Point at the coverage badge.*

> And where it fails, it says so. Claims that don't verify stay on the page, labelled, with
> the reason. Hiding them would push this number to a meaningless 100% and take the
> judgement away from the reader.

## 2:40 — Disagreement you can't fake (~45s)

*Scroll to "Where accounts differ".*

> Asking a model for "multiple perspectives" gets you four paraphrases of one perspective.
> So instead the corpus includes the same article in other languages, picked from the
> countries the subject actually involves.
>
> The German article calls Napoleon's rule a plebiscitary dictatorship. The French one
> presents him as a founding father of French institutions. Both quoted in their own
> language, with the translation clearly marked as unverified — because a translation isn't
> something I can check with a substring match.
>
> That disagreement is real and sourced. It was found, not generated.

## 3:25 — A different question (~40s)

*Search "Japan 1600".*

> This isn't a request for an article, so it isn't treated as one. It's a SPARQL query
> against Wikidata: what the record holds for that place and period.
>
> No model call at all — free, a few seconds, and incapable of inventing anything. Sekigahara
> at the top, which is exactly right. Every row is a door into the full explainer.

*Click Battle of Sekigahara, then use the breadcrumbs to step back.*

> And going back costs nothing — it's already in your browser.

## 4:05 — What I'd change (~45s)

> Things I'd do next, in order. The summary carries source markers but isn't span-verified —
> running the same verifier over its sentences would extend the guarantee to the part people
> read first. More charts: casualty comparisons and a map are both straightforward from data
> I'm already fetching. And `lib/core` has no framework imports and three adapters already —
> the web route, a CLI, the pre-warm script — so an MCP server is a fourth adapter, not a
> rewrite.
>
> The thing I'd flag honestly: this is only as good as Wikipedia and Wikidata. I'm not
> claiming everything here is true. I'm claiming you can check any of it in one click, which
> is a different promise, and the one the architecture actually delivers.

## 4:50 — Close (~15s)

> Roughly [N] hours. Built with Claude Code — the most useful single thing I did was hand a
> subagent the pipeline design and ask it to attack the grounding approach before I wrote
> any of it. It predicted the cross-language quoting failure and pushed me toward Wikidata
> for dates, both of which turned out to be right.

---

## Things worth showing if there's room

- The CLI: `npm run explain -- "Napoleon"` — same engine, no browser, prints coverage.
- `scripts/diag/cache-check.ts` — measuring rather than assuming.
- An unverified claim, expanded, so the failure mode is visible rather than described.

## Things to skip

- Deployment, project structure, the dependency list.
- Narrating every section — scroll and let them read.
- Apologising for what isn't finished. Say what you'd do next, once, and move on.
