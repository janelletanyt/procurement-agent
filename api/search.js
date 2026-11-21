// Vercel serverless function: runs web searches through the LangSearch Web Search API.
// Docs: https://github.com/langsearch-ai/langsearch
//
// Required environment variables:
//   LANGSEARCH_API_KEY – free key from https://langsearch.com/dashboard
//   ACCESS_CODE        – the code visitors must enter before the agent will run

import { createHash, timingSafeEqual } from "node:crypto";

const ENDPOINT = "https://api.langsearch.com/v1/web-search";
const FRESHNESS = ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"];
const MAX_QUERIES = 24;
const RESULTS_PER_QUERY = 8;
const MAX_RESULTS = 80;
const DOMAIN = /^(?=.{4,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const TEXT_CHARS = 1200;
const BATCH_SIZE = 2;      // stay well under LangSearch's 5 requests per second for new accounts
const BATCH_PAUSE_MS = 600;
const MAX_ATTEMPTS = 3;    // per query, for rate limits and temporary server errors
const TIME_BUDGET_MS = 50000;

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message, code) => res.status(status).json({ error: { message, code } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const onDomains = (url, domains) => { const h = hostOf(url); return domains.some((d) => h === d || h.endsWith(`.${d}`)); };

// Each query is { query, domains }. Results are restricted to those domains by LangSearch
// (includeDomains) and checked again here, so nothing from another site gets through.
async function searchOnce({ query, domains }, freshness) {
  const upstream = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LANGSEARCH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, count: RESULTS_PER_QUERY, freshness, includeDomains: domains, contents: { text: { maxCharacters: TEXT_CHARS } } }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || String(data.code ?? "200") !== "200") {
    const err = new Error(data.message || data.msg || `LangSearch returned ${upstream.status}`);
    err.status = upstream.status;
    err.retryAfter = Number(upstream.headers.get("retry-after")) || 0;
    throw err;
  }
  return (data.data?.webPages?.value || []).filter((r) => r?.url && onDomains(r.url, domains));
}

// Retries a query when LangSearch says it was rate limited (429) or had a temporary fault (5xx, timeout).
async function searchWithRetry(q, freshness, deadline) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await searchOnce(q, freshness);
    } catch (e) {
      const retryable = e.status === 429 || e.status >= 500 || e.name === "TimeoutError" || e.name === "AbortError";
      const wait = Math.min(Math.max(e.retryAfter * 1000, 1200 * attempt), 5000) + Math.floor(Math.random() * 400);
      if (!retryable || attempt >= MAX_ATTEMPTS || Date.now() + wait > deadline) throw e;
      await sleep(wait);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ACCESS_CODE) return fail(res, 500, "Server is not configured: set ACCESS_CODE in Vercel.", "not_configured");
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.", "bad_access_code");
  if (!process.env.LANGSEARCH_API_KEY) return fail(res, 501, "LangSearch is not configured: set LANGSEARCH_API_KEY in Vercel.", "search_not_configured");

  const body = req.body || {};
  const queries = (Array.isArray(body.queries) ? body.queries : [])
    .map((q) => ({
      query: typeof q?.query === "string" ? q.query.trim().slice(0, 300) : "",
      domains: (Array.isArray(q?.domains) ? q.domains : []).filter((d) => typeof d === "string" && DOMAIN.test(d)).map((d) => d.toLowerCase()).slice(0, 6),
    }))
    .filter((q) => q.query && q.domains.length > 0)
    .slice(0, MAX_QUERIES);
  if (queries.length === 0) return fail(res, 400, "queries is required: each needs a query and at least one portal domain");
  const freshness = FRESHNESS.includes(body.freshness) ? body.freshness : "oneMonth";

  const seen = new Set();
  const results = [];
  let failed = 0;
  let lastError = null;

  // One entry per query, so the app can show exactly what was searched and what came back.
  const detail = queries.map((q) => ({ query: q.query, domains: q.domains, pages: 0, error: "not run: ran out of time" }));

  const deadline = Date.now() + TIME_BUDGET_MS;
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_PAUSE_MS);
    if (Date.now() > deadline) { failed += queries.length - i; lastError = new Error("ran out of time"); break; }
    const settled = await Promise.allSettled(queries.slice(i, i + BATCH_SIZE).map((q) => searchWithRetry(q, freshness, deadline)));
    for (const [j, s] of settled.entries()) {
      const entry = detail[i + j];
      if (s.status === "rejected") {
        failed++; lastError = s.reason;
        entry.error = s.reason?.status === 429 ? "rate limit reached" : String(s.reason?.message || "failed").slice(0, 120);
        continue;
      }
      entry.error = null;
      entry.pages = s.value.length;
      for (const r of s.value) {
        if (!r?.url || seen.has(r.url) || results.length >= MAX_RESULTS) continue;
        seen.add(r.url);
        results.push({
          name: r.name || "",
          url: r.url,
          displayUrl: r.displayUrl || "",
          datePublished: r.datePublished || null,
          text: String(r.text || r.snippet || "").slice(0, TEXT_CHARS),
        });
      }
    }
  }

  if (failed === queries.length) {
    const status = lastError?.status >= 400 ? lastError.status : 502;
    return fail(res, status, `LangSearch search failed: ${lastError?.message || "unknown error"}`, "search_failed");
  }
  const failureReason = failed ? (lastError?.status === 429 ? "rate limit reached" : String(lastError?.message || "unknown error").slice(0, 120)) : null;
  return res.status(200).json({ results, queries: queries.length, failed, failureReason, freshness, detail });
}
