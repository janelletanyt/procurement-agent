// Vercel serverless function: searches GeBIZ's own public "Opportunities" listing for OPEN tenders.
//
// Web search engines cannot see inside GeBIZ's listing, so this goes one level deeper: it runs the
// same keyword search a person would run on https://www.gebiz.gov.sg and reads the result list.
// Each listing row already carries the title, reference, agency, category, closing date and a
// direct link, so the individual tender pages do not need to be opened.
//
// It is deliberately gentle: at most 5 keywords per run, one at a time, first page of results only.
//
// Required environment variable:
//   ACCESS_CODE – the code visitors must enter before the agent will run

import { createHash, timingSafeEqual } from "node:crypto";

const ORIGIN = "https://www.gebiz.gov.sg";
const LISTING = `${ORIGIN}/ptn/opportunity/BOListing.xhtml`;
const MAX_KEYWORDS = 5;
const PAUSE_MS = 400;
const USER_AGENT = "Mozilla/5.0 (compatible; GEEK-AI-procurement-agent/1.0)";
const MONTHS = { jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06", jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12" };

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message, code) => res.status(status).json({ error: { message, code } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => String(s)
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i")); return m ? decode(m[1]) : null; };
const isoDate = (s) => { const m = String(s).match(/(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/); return m && MONTHS[m[2].toLowerCase()] ? `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null; };

// A tiny cookie jar: GeBIZ ties the search to a session cookie.
function makeJar() {
  const jar = new Map();
  return {
    store(response) {
      const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
      for (const c of list) { const pair = c.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
    },
    header() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
  };
}

async function request(url, jar, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en", ...(jar.header() ? { Cookie: jar.header() } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  jar.store(response);
  const text = await response.text();
  if (!response.ok) throw new Error(`GeBIZ returned ${response.status}`);
  return text;
}

// Collects the fields of the page's search form exactly as a browser would submit them.
function readSearchForm(html) {
  const form = html.match(/<form\b[^>]*id="contentForm"[\s\S]*?<\/form>/i)?.[0];
  if (!form) throw new Error("GeBIZ search form not found (the page layout may have changed)");
  const fields = [];
  let keywordField = null, goButton = null;
  for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
    const name = attr(tag, "name"); if (!name) continue;
    const type = (attr(tag, "type") || "text").toLowerCase();
    if (/_searchBar_INPUT-SEARCH$/.test(name)) keywordField = name;
    if (/_searchBar_BUTTON-GO$/.test(name)) goButton = name;
    if (["submit", "button", "image", "reset", "file"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(tag)) continue;
    fields.push([name, attr(tag, "value") ?? (type === "checkbox" ? "on" : "")]);
  }
  for (const m of form.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const options = m[2].match(/<option\b[^>]*>/gi) || [];
    const chosen = options.find((o) => /\bselected\b/i.test(o)) || options[0];
    fields.push([decode(m[1]), chosen ? attr(chosen, "value") ?? "" : ""]);
  }
  if (!keywordField || !goButton) throw new Error("GeBIZ search box not found (the page layout may have changed)");
  return { fields, keywordField, goButton };
}

// Reads the tenders out of a listing page. Row text runs: "<Type> - <DocNo>", status, title link,
// "Agency", <agency>, "Published", <date>, "Procurement Category", <category>, "Closing on", <date>, <time>.
function parseListing(html) {
  const marked = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\b[^>]*href="([^"]*directlink\.xhtml\?docCode=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => `\n@@LINK|${href}|${inner.replace(/<[^>]+>/g, " ")}\n`)
    .replace(/<[^>]+>/g, "\n");
  const lines = decode(marked).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("@@LINK|")) continue;
    const [, href, title] = lines[i].split("|");
    const docCode = decode(href).match(/docCode=([^&]+)/)?.[1] || "";
    const before = lines.slice(Math.max(0, i - 4), i);
    const typeLine = before.find((l) => l.includes(docCode) && l.includes(" - ")) || "";
    const item = {
      title: (title || "").trim(),
      url: new URL(decode(href), ORIGIN).href,
      refNo: typeLine.includes(" - ") ? typeLine.slice(typeLine.indexOf(" - ") + 3).trim() : docCode,
      type: typeLine.includes(" - ") ? typeLine.slice(0, typeLine.indexOf(" - ")).trim() : "",
      status: before.find((l) => /^(OPEN|CLOSED|AWARDED|CANCELLED|PENDING AWARD|NO AWARD)$/i.test(l)) || "",
      agency: "", category: "", published: null, deadline: null, closingTime: "",
    };
    for (let j = i + 1; j < lines.length && !lines[j].startsWith("@@LINK|"); j++) {
      const next = lines[j + 1] || "";
      if (lines[j] === "Agency") item.agency = next;
      else if (lines[j] === "Published") item.published = isoDate(next);
      else if (lines[j] === "Procurement Category") item.category = next.replace(/\s*⇒\s*/g, " > ");
      else if (/^Clos(ing|ed) on$/i.test(lines[j])) { item.deadline = isoDate(next); item.closingTime = /\d{1,2}:\d{2}/.test(lines[j + 2] || "") ? lines[j + 2] : ""; }
    }
    if (item.title && docCode) items.push(item);
  }
  return items;
}

async function searchKeyword(keyword) {
  const jar = makeJar();
  const page = await request(`${LISTING}?origin=menu`, jar);
  const { fields, keywordField, goButton } = readSearchForm(page);
  const prefix = goButton.replace(/_searchBar_BUTTON-GO$/, "");
  const body = new URLSearchParams(fields.filter(([name]) => name !== keywordField));
  body.set(keywordField, keyword);
  body.set("javax.faces.source", goButton);
  body.set("javax.faces.partial.event", "click");
  body.set("javax.faces.partial.execute", `${goButton} ${prefix}`);
  body.set("javax.faces.partial.render", prefix);
  body.set("javax.faces.behavior.event", "action");
  body.set("javax.faces.partial.ajax", "true");

  const answer = await request(LISTING, jar, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Faces-Request": "partial/ajax", "X-Requested-With": "XMLHttpRequest", Referer: `${LISTING}?origin=menu` },
    body: body.toString(),
  });
  const redirect = answer.match(/<redirect\s+url="([^"]+)"/i)?.[1];
  if (!redirect) throw new Error("GeBIZ did not accept the search (unexpected response)");
  const results = await request(new URL(decode(redirect), ORIGIN).href, jar, { headers: { Referer: `${LISTING}?origin=menu` } });

  const openCount = Number(results.match(/value="Open \((\d+)\)"/i)?.[1] ?? NaN);
  const closedCount = Number(results.match(/value="Closed \((\d+)\)"/i)?.[1] ?? NaN);
  const items = parseListing(results).filter((t) => !t.status || /^open$/i.test(t.status));
  return { items, openCount: Number.isNaN(openCount) ? items.length : openCount, closedCount: Number.isNaN(closedCount) ? null : closedCount };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ACCESS_CODE) return fail(res, 500, "Server is not configured: set ACCESS_CODE in Vercel.", "not_configured");
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.", "bad_access_code");

  const keywords = [...new Set((Array.isArray(req.body?.keywords) ? req.body.keywords : [])
    .filter((k) => typeof k === "string").map((k) => k.trim().slice(0, 60)).filter((k) => k.length >= 2))]
    .slice(0, MAX_KEYWORDS);
  if (keywords.length === 0) return fail(res, 400, "keywords is required");

  const seen = new Set();
  const results = [];
  const detail = [];
  for (const [i, keyword] of keywords.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    try {
      const { items, openCount, closedCount } = await searchKeyword(keyword);
      detail.push({ keyword, open: openCount, closed: closedCount, read: items.length, error: null });
      for (const t of items) { if (seen.has(t.url)) continue; seen.add(t.url); results.push({ ...t, keyword }); }
    } catch (e) {
      detail.push({ keyword, open: 0, closed: null, read: 0, error: String(e.message || e).slice(0, 160) });
    }
  }
  if (detail.every((d) => d.error)) return fail(res, 502, `GeBIZ search failed: ${detail[0].error}`, "gebiz_failed");
  return res.status(200).json({ results, detail });
}
