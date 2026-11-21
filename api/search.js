// Vercel serverless function: runs web searches through the LangSearch Web Search API.
// Docs: https://github.com/langsearch-ai/langsearch
//
// Required environment variables:
//   LANGSEARCH_API_KEY – free key from https://langsearch.com/dashboard
//   ACCESS_CODE        – the code visitors must enter before the agent will run

import { createHash, timingSafeEqual } from "node:crypto";

const ENDPOINT = "https://api.langsearch.com/v1/web-search";
const FRESHNESS = ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"];
const MAX_QUERIES = 16;
const RESULTS_PER_QUERY = 8;
const MAX_RESULTS = 60;
const TEXT_CHARS = 1200;
const BATCH_SIZE = 3;      // new LangSearch accounts start at 5 requests per second
const BATCH_PAUSE_MS = 700;

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message, code) => res.status(status).json({ error: { message, code } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchOnce(query, freshness) {
  const upstream = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LANGSEARCH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, count: RESULTS_PER_QUERY, freshness, contents: { text: { maxCharacters: TEXT_CHARS } } }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || String(data.code ?? "200") !== "200") {
    const err = new Error(data.message || data.msg || `LangSearch returned ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  return data.data?.webPages?.value || [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ACCESS_CODE) return fail(res, 500, "Server is not configured: set ACCESS_CODE in Vercel.", "not_configured");
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.", "bad_access_code");
  if (!process.env.LANGSEARCH_API_KEY) return fail(res, 501, "LangSearch is not configured: set LANGSEARCH_API_KEY in Vercel.", "search_not_configured");

  const body = req.body || {};
  const queries = (Array.isArray(body.queries) ? body.queries : [])
    .filter((q) => typeof q === "string" && q.trim())
    .map((q) => q.trim().slice(0, 300))
    .slice(0, MAX_QUERIES);
  if (queries.length === 0) return fail(res, 400, "queries is required");
  const freshness = FRESHNESS.includes(body.freshness) ? body.freshness : "oneMonth";

  const seen = new Set();
  const results = [];
  let failed = 0;
  let lastError = null;

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_PAUSE_MS);
    const settled = await Promise.allSettled(queries.slice(i, i + BATCH_SIZE).map((q) => searchOnce(q, freshness)));
    for (const s of settled) {
      if (s.status === "rejected") { failed++; lastError = s.reason; continue; }
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
  return res.status(200).json({ results, queries: queries.length, failed });
}
