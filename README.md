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

- **Sourcing** – One call to the Anthropic Messages API with the `web_search` tool. Claude runs several searches and returns a JSON array of tenders. If the response is cut off, complete records are salvaged from the partial output.
- **Scoring** – Claude assigns each tender a relevance score and a short justification based on the business profile.
- **Real results only** – Claude is told not to fabricate tenders, and anything it marks as simulated is removed before display.
- **Drafting** – A second Claude call writes the Expression of Interest in a formal Singapore business tone.

## Running it

The component calls `https://api.anthropic.com/v1/messages` directly from the browser and does not include an API key, so it is designed to run **as a Claude artifact**, where the API call is handled for you:

1. Open [claude.ai](https://claude.ai) and start a chat.
2. Paste the contents of `procurement-agent.jsx` and ask Claude to render it as an artifact.
3. Edit the business profile, then click **Run Procurement Agent**.

To run it in your own React app instead, route the two `fetch` calls through a small backend that adds your Anthropic API key. Do not put an API key in browser code.

The only dependency is React (`useState`, `useRef`, `useEffect`). Styling is inline; fonts load from Google Fonts.

## Limitations

- **Public listings only.** The agent finds tenders through web search. It does not log in to any portal, and many portals show full tender details only to signed-in suppliers, so results may be sparse. The per-portal "Scanning…" lines in the log are progress messages, not direct connections to each portal.
- **Verify before bidding.** Tender details and relevance scores are produced by an AI model from search results. Always confirm the title, deadline, budget and reference number on the official portal.
- **Drafts are starting points.** Review and edit every Expression of Interest before submitting it.
- **Singapore only.** Portals, prompts and tone are specific to the Singapore market.

## Customising

- `BUSINESS_PROFILE` – the default company description.
- `PORTALS` – the list of portals shown on the Configure tab.
- `systemPrompt` / `userMsg` inside `runAgent` – the search instructions and output schema.
- The `model` field in both `fetch` calls – which Claude model is used.
