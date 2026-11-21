# GEEK-AI Procurement Intelligence

An AI sourcing agent that finds open procurement tenders in Singapore, scores them against your business profile, and drafts an Expression of Interest for the ones worth bidding on.

It is a single React component ([procurement-agent.jsx](procurement-agent.jsx)) that searches the web with the free [LangSearch](https://github.com/langsearch-ai/langsearch) Web Search API and uses Claude to pick out and score the tenders.

## What it does

1. **Configure** – Describe your business, add optional keywords, a category and a budget range, and choose which procurement portals to cover.
2. **Run** – The agent searches the web for Singapore tenders that match, has Claude extract and score the ones that look open, and records its progress in an activity log.
3. **Review** – Matching tenders appear in a sortable, filterable table with agency, budget, deadline, reference number, a 0–100% match score and a one-line reason for the match. Deadlines within 14 days are highlighted, and the list can be exported to CSV.
4. **Draft** – One click generates a formal, three-paragraph Expression of Interest for any tender, which you can edit in place and copy.

The interface is deliberately plain: one neutral palette, light and dark themes that follow the system setting, keyboard-accessible controls, and a layout that works down to phone width.

## Portals covered

| Type | Portals |
|---|---|
| Government | GeBIZ, GovTech Procurement, Sentinel Portal (MINDEF/SAF) |
| Statutory boards | HDB eBidding, JTC Procurement, SLA / Quartz, CAAS / Changi |
| Corporate | Ariba SG, Tenderboard, Sesami |
| Healthcare | SingHealth / NHG |
| Education | NTU / NUS Procurement |

## How it works

```
Business profile + keywords + portals
              │
              ▼
   LangSearch Web Search API  ──►  web pages (title, URL, text)
              │
              ▼
   Claude  ──►  JSON list of tenders (title, agency, deadline,
              │                       budget, relevance, source URL, ...)
              ▼
   Results table  ──►  Claude  ──►  Expression of Interest draft
```

- **GeBIZ, read directly** – Web search engines cannot see inside GeBIZ's tender listing, so `api/gebiz.js` runs GeBIZ's own public keyword search (up to five keywords, one at a time, first page of results each) and reads the open opportunities from the result list: title, reference, agency, category, closing date and direct link. Government agencies and statutory boards (GovTech, MINDEF, HDB, JTC, SLA, CAAS) publish on GeBIZ, so selecting one of those portals filters the GeBIZ results to that buyer. This relies on the layout of GeBIZ's public page and will need updating if GeBIZ changes it; check GeBIZ's terms of use before heavy use.
- **Searching, on the selected portals only** – `api/search.js` sends two queries per selected portal to the LangSearch Web Search API, each restricted to that portal's own web domains and filtered by the "Published within" setting. Pages from any other site are discarded.
- **Extracting and scoring** – Claude reads those pages (through `api/messages.js`) and keeps only specific, open tenders from Singapore buyers that are relevant to the business and have enough detail to act on. Each gets a relevance score, a short justification and a suggested next step. If the response is cut off, complete records are salvaged from the partial output.
- **Real results only** – Claude is told to use only what is in the search results and not to fabricate tenders. A tender is shown only if it links to a page LangSearch actually returned from a selected portal, and tenders whose closing date has passed are dropped.

The AI step runs on either Google Gemini (which has a free tier) or Claude. "Claude" above means whichever is configured.

The app adapts to which keys are set on the server:

| Keys set | Behaviour |
|---|---|
| `LANGSEARCH_API_KEY` + `GEMINI_API_KEY` | LangSearch searches, Gemini extracts, scores and drafts. Free within both services' limits |
| `LANGSEARCH_API_KEY` + `ANTHROPIC_API_KEY` | LangSearch searches, Claude extracts, scores and drafts (paid). Claude is used when both AI keys are set |
| `LANGSEARCH_API_KEY` only | Search-only mode: pages from the selected portals that mention tenders, ranked by keyword overlap. Nothing checks that they are open, relevant tenders, and there are no drafts. Free to run |
| `ANTHROPIC_API_KEY` only | Claude runs its own web searches with its `web_search` tool |

- **Drafting** – A second Claude call writes the Expression of Interest in a formal Singapore business tone.

## Running it

The repo is a small Vite + React app with two serverless functions, ready to deploy on [Vercel](https://vercel.com):

| File | Purpose |
|---|---|
| `procurement-agent.jsx` | The whole user interface and agent logic |
| `api/gebiz.js` | Server function that searches GeBIZ's public open-tender listing directly. Needs no API key |
| `api/search.js` | Server function that runs web searches through the LangSearch API. It keeps the LangSearch key on the server and rejects callers without the access code |
| `api/messages.js` | Server function that sends AI requests to Gemini or Claude. It keeps the API keys on the server and rejects callers without the access code |
| `src/main.jsx`, `index.html` | App entry point |

### Deploy on Vercel

1. Import this repository as a new Vercel project (the Vite preset is detected automatically).
2. Add environment variables under **Settings → Environment Variables**:
   - `ACCESS_CODE` (required) – any code you choose; visitors must enter it on the Search setup tab before the agent will run
   - `LANGSEARCH_API_KEY` – a free key from the [LangSearch dashboard](https://langsearch.com/dashboard)
   - `GEMINI_API_KEY` – a Google Gemini API key from [Google AI Studio](https://aistudio.google.com/api-keys), free tier available, **or**
   - `ANTHROPIC_API_KEY` – an Anthropic API key from [platform.claude.com](https://platform.claude.com) (paid)
3. Deploy. Optionally set `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) or `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), and `AI_PROVIDER` (`gemini` or `anthropic`) to choose when both keys are set.

On Gemini's free tier, Google states that content sent to the API is used to improve its products, so do not put confidential business details in the profile when using a free key.

Environment variables only apply to new deployments, so redeploy after adding or changing one. Anyone with the site already open should then reload the page.

LangSearch's free plan has rate and daily usage limits. Claude usage is billed to the Anthropic key's account, so share the access code only with people you trust.

### Run locally

```bash
npm install
```

```bash
npx vercel dev
```

`vercel dev` serves the app and both `/api` functions; put the environment variables in a `.env` file (already git-ignored).

## Limitations

- **Public listings only.** The agent finds tenders through web search. It does not log in to any portal, and many portals show full tender details only to signed-in suppliers, so results may be sparse. The selected portals tell the model where to focus; the app does not connect to each portal directly.
- **Verify before bidding.** Tender details and relevance scores are produced by an AI model from search results. Always confirm the title, deadline, budget and reference number on the official portal.
- **Drafts are starting points.** Review and edit every Expression of Interest before submitting it.
- **Singapore only.** Portals, prompts and tone are specific to the Singapore market.

## Customising

- `PROFILE_PLACEHOLDER` – the hint shown in the empty business profile box.
- `PORTALS` – the list of portals shown on the Configure tab.
- `systemPrompt` / `userMsg` inside `runAgent` – the search instructions and output schema.
- `ANTHROPIC_MODEL` environment variable – which Claude model is used.
