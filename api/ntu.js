// Vercel serverless function: reads NTU's public list of open sourcing events.
//
// NTU publishes its open tenders and quotations on its "Information for Suppliers" page, which
// loads them from the public data feed used here. One request returns every open event with its
// title, document number, categories, publish and close dates, and a public link to the event.
//
// Required environment variable:
//   ACCESS_CODE – the code visitors must enter before the agent will run

import { createHash, timingSafeEqual } from "node:crypto";

const FEED = "https://www.ntu.edu.sg/collaborate-with-us/information-for-suppliers/GetOpportunities/";
const PAGE = "https://www.ntu.edu.sg/collaborate-with-us/information-for-suppliers";
const MAX_EVENTS = 60;

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message, code) => res.status(status).json({ error: { message, code } });
const safeLink = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : PAGE);

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ACCESS_CODE) return fail(res, 500, "Server is not configured: set ACCESS_CODE in Vercel.", "not_configured");
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.", "bad_access_code");

  try {
    const upstream = await fetch(FEED, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; GEEK-AI-procurement-agent/1.0)", Referer: PAGE },
      // Same fields the NTU page itself sends; the dates are returned in Singapore time.
      body: JSON.stringify({
        description: "", documentNo: "", category: "", status: "open", page: "1", offset: "0", timezone: "+08:00",
        publishDateFrom: "", publishDateTo: "", closeDateFrom: "", closeDateTo: "",
        publishDateFromTime: "00:00:00", publishDateToTime: "23:59:59", closeDateFromTime: "00:00:00", closeDateToTime: "23:59:59",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return fail(res, 502, `NTU returned ${upstream.status}`, "ntu_failed");
    const data = await upstream.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const results = events
      .filter((e) => e && e.posting_title && String(e.status || "open").toLowerCase() === "open")
      .slice(0, MAX_EVENTS)
      .map((e) => ({
        title: String(e.posting_title).trim(),
        url: safeLink(e.discovery_url),
        refNo: String(e.posting_id || ""),
        type: "Sourcing event",
        status: "OPEN",
        agency: "Nanyang Technological University",
        category: (Array.isArray(e.categories) ? e.categories : []).join(", "),
        published: String(e.publish_date || "").slice(0, 10) || null,
        deadline: String(e.close_date || "").slice(0, 10) || null,
        closingTime: String(e.close_date || "").slice(11, 16),
      }));
    return res.status(200).json({ results, total: Number(data.total) || results.length });
  } catch (e) {
    return fail(res, 502, `NTU's tender list could not be read: ${e.message}`, "ntu_failed");
  }
}
