# GEEK-AI Procurement Intelligence

An AI sourcing agent that finds open procurement tenders in Singapore, scores them against your business profile, and drafts an Expression of Interest for the ones worth bidding on.

It is a single React component ([procurement-agent.jsx](procurement-agent.jsx)) powered by Claude with web search.

## What it does

1. **Configure** – Describe your business, add optional keywords, a category and a budget range, and choose which procurement portals to cover.
2. **Run** – The agent asks Claude to search the web for currently open Singapore tenders that match, and streams its progress to a terminal-style log.
3. **Review** – Matching tenders appear in a sortable table with agency, budget, deadline, reference number, a 0–100% relevance score and a one-line reason for the match. Deadlines within 14 days are highlighted.
4. **Draft** – One click generates a formal, three-paragraph Expression of Interest for any tender, ready to copy.

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
   Claude (with web_search tool)  ──►  JSON list of tenders
              │                         (title, agency, deadline, budget,
              ▼                          relevance, source URL, ...)
   Results table  ──►  Claude  ──►  Expression of Interest draft
```

- **Sourcing** – One request to the Anthropic Messages API (through `api/messages.js`) with the `web_search` tool. Claude runs several searches and returns a JSON array of tenders. If the response is cut off, complete records are salvaged from the partial output.
- **Scoring** – Claude assigns each tender a relevance score and a short justification based on the business profile.
- **Real results only** – Claude is told not to fabricate tenders, and anything it marks as simulated is removed before display.
- **Drafting** – A second Claude call writes the Expression of Interest in a formal Singapore business tone.

## Running it

The repo is a small Vite + React app with one serverless function, ready to deploy on [Vercel](https://vercel.com):

| File | Purpose |
|---|---|
| `procurement-agent.jsx` | The whole user interface and agent logic |
| `api/messages.js` | Server function that forwards requests to the Anthropic API. It keeps the API key on the server and rejects callers without the access code |
| `src/main.jsx`, `index.html` | App entry point |

### Deploy on Vercel

1. Import this repository as a new Vercel project (the Vite preset is detected automatically).
2. Add two environment variables under **Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY` – an Anthropic API key from [platform.claude.com](https://platform.claude.com)
   - `ACCESS_CODE` – any code you choose; visitors must enter it on the Configure tab before the agent will run
3. Deploy. Optionally set `ANTHROPIC_MODEL` to change the Claude model (default `claude-sonnet-5-5`).

Every run is billed to the API key's account, so share the access code only with people you trust.

### Run locally

```bash
npm install
```

```bash
npx vercel dev
```

`vercel dev` serves both the app and the `/api/messages` function; put the two environment variables in a `.env` file (already git-ignored).

## Limitations

- **Public listings only.** The agent finds tenders through web search. It does not log in to any portal, and many portals show full tender details only to signed-in suppliers, so results may be sparse. The per-portal "Scanning…" lines in the log are progress messages, not direct connections to each portal.
- **Verify before bidding.** Tender details and relevance scores are produced by an AI model from search results. Always confirm the title, deadline, budget and reference number on the official portal.
- **Drafts are starting points.** Review and edit every Expression of Interest before submitting it.
- **Singapore only.** Portals, prompts and tone are specific to the Singapore market.

## Customising

- `BUSINESS_PROFILE` – the default company description.
- `PORTALS` – the list of portals shown on the Configure tab.
- `systemPrompt` / `userMsg` inside `runAgent` – the search instructions and output schema.
- `ANTHROPIC_MODEL` environment variable – which Claude model is used.
