# History Demystified

## Intention

History is a remarkable thing that all too often gets taught in less-than-fantastic ways. I wanted to create a tool that helps uncover, explain and internalize complex historical concepts in easy-to-understand ways. Complicated things can be broken down into easy-to-digest chunks if we know how to go about it. I chose this theme of exploration & understanding because I personally really appreciate and find it valuable to convey complex concepts in understandable ways. I also feel like this product is pretty relevant to the position I’m applying for, as I’ll explain in the End result and its utility section. 

## Starting point

I wanted it to start with a simple search box like google.com with a handful of pre-canned examples. Then the user types in something like “100 years war” and then Claude does coordinated research on the subject and it’s displayed in an interactive way with charts, graphs, bullet points conveying the key concepts of the subject and relevant historical context. Each node here can be drilled down and start a new search from there and users can navigate history itself through these nodes\!

## Architecture

Claude by itself does a pretty decent job at explaining complicated concepts, we don’t need an app for that. What this tool does is specialize for explaining history, and we can anticipate and handle input types. This means that we don’t have to spend tokens on what we can anticipate, only on the targeted and well-defined research itself. We don’t need to spend tokens on thinking through what aspects of a certain subject we want to investigate, how to render it, what charts and graphs to use etc. We can code these parameters into the tool and leave it flexible only on the data gathering.

I want the UI to be abstract from the very lean server and the LLM layer. This is so that we can in the future turn this into an API-only tool or an MCP that can be called from Claude or other apps directly.

I’ve also used prompt caching to save on API costs for recurring queries.

There are 2 calls in parallel: one for prose and one for structured output. This means faster response with reasonably good results and cost trade-off.

Progressive rendering with a fast first paint. Data and charts get added progressively so the app feels fast and also rich.

## What is non-obvious

I also wanted to eliminate guessing and hallucinating by creating a research and eval framework where Claude is not allowed to make up URLs and dates and each piece of information is cited. These are not only in the prompt but baked into the code. Every run is evaluated and shared with the reader: n of m claims located in the source they cite. This is key for a trusted research framework.

Dates and relationships come from a knowledge graph in Wikidata, further guaranteeing accuracy. Claude doesn’t have to build (and guess) knowledge graphs, this is coming from a vetted source.

Prose is constrained to spans that can be checked. Every claim in the structured output carries a source id and a verbatim quote, and server-side code confirms that quote appears in that document. This keeps traceability intact along the research lifecycle.

Varying opinions are respected and not fabricated into arbitrary consensus. History is a uniquely complex subject and it depends who you ask. Instead of Claude making assumptions and trying to crudely “average” opinions, it provides sources from a wide spectrum of stances and presents them as context. Then it’s up to the researcher to make up their minds about it.

Scope queries\! When a user searches for not a specific historical subject, but rather a scope like “England in the 15th century”, most search engines would try to assume the closest individual subject and respond based on a very vague assumption. Instead of doing an expensive LLM search here, we make 2 SPARQL queries sequentially: one for events of a specific relevant subset of types and then one for people, within a reasonable time frame based on the timeline. This will return a compact set of relevant individual historical subjects that the user can then choose from and go into the explain flow. I felt like this was a pretty clever way to handle ambiguity.

## Trade-offs along the way

I’ve chosen to use a Claude API key in this exercise to fetch data for the targeted research. Although not in the requirements, I’ve cleared this with the recruiter because I thought this was most in line with a real-life use case of a Staff Software Engineer on People Products.

For this exercise I’ve (hard) coded how to handle specific types of historical concepts. In a future iteration and vision for this tool, this could be abstracted into a CMS system where user inputs a concept → pre-classifier agent finds the right category from a CMS → tool does research based on that and displays it based on info from the CMS. An easily expandable system using coded modules to research and display information based on CMS-maintained data. If you ask about codebases, we can configure to display competitors in tables with usage statistics graphs. If you ask about a company, we can display key metrics in KPI cards and gauge charts about where they stand on certain qualities. Making this an expandable tool rather than a history-specific one.

I’m using Opus 5 for this exercise which could be considered excessive. For the interview circumstances with a limited time frame, anticipated number of queries I feel like this is a reasonable choice. For longer-term and broader usage this might need to be re-evaluated. 

No database. An app like this would really deserve its own database, cache layer and a whole slew of considerations around it. In the interest of time and considering the scope of the exercise, I elected to only use browser-based retention for this iteration. This should give a smooth user experience to anyone testing this out on their own but it’s not a very scalable solution cost and compute wise.

Access control has also been completely omitted from this, consciously, under the assumption that it’ll only exist for the hiring cycle and taken down from the public internet afterwards. This is to make access easier and save on time.

## End result and its utility

In the position I’m applying for, I’d have to build intelligent tools for specific workflows where we can anticipate input and the format of output, but need flexibility to adapt to different people’s use cases. The tool I’ve built, at its core, helps you understand a subject. This could be extrapolated to explain codebases or software tools (that we hear 10 new of each day for no reason) or to help the hiring process by helping “explain” people, their career, interview transcripts, score cards to help decision making during a hiring process. Just like I’ve built this tool to be objective, unbiased and provide resources from a wide spectrum of opinions, the same principles would make this tool helpful in understanding other types of subjects especially to help make decisions. Which I imagine is a key pain point on the People team: making high-stakes decisions based on a complex dataset. AI is really good at gathering information, the coded tool can present it well, and then it’s up to the human to make a well-informed decision.

## Roadmap possibilities

Adding support for more subject types, whether in the historical context or other fields.  
CMS system instead of hardcoding types as mentioned above.  
More charts and graphs and animations to help create a visual for the subject.  
Expand sources from wikimedia to trusted and labeled web\_search and web\_fetch items.  
Rate limiting and scalability considerations based on usage.

## Development timeline

I’ve spent approximately 5 hours on this task. I started at 9:11am on Sat, Sep 12, and I was done by 2:11pm. This included a 10-minute lunch break and 20 minutes to take my dog for a walk.  
