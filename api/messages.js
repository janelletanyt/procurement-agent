// Vercel serverless function: sends AI requests (tender scoring and drafts) to a language model.
// API keys stay on the server, and callers must send the shared access code.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   ACCESS_CODE        – required: the code visitors must enter before the agent will run
//   GEMINI_API_KEY     – Google Gemini API key (has a free tier): https://aistudio.google.com/api-keys
//   ANTHROPIC_API_KEY  – Anthropic API key (paid). Used instead of Gemini when both are set
// With neither key the app runs in search-only mode.
// Optional:
//   GEMINI_MODEL       – defaults to gemini-3.5-flash-lite
//   ANTHROPIC_MODEL    – defaults to claude-sonnet-5-5
//   AI_PROVIDER        – "gemini" or "anthropic" to force one when both keys are set

import { createHash, timingSafeEqual } from "node:crypto";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-flash-lite-latest";
const MAX_TOKENS_CAP = 16000;
const MAX_CONTINUATIONS = 4;

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message, code) => res.status(status).json({ error: { message, code } });

function pickProvider() {
  const forced = String(process.env.AI_PROVIDER || "").toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

// Google Gemini, through the Interactions API (https://aistudio.google.com/docs/text-generation).
async function geminiOnce(model, system, input, maxTokens) {
  const body = { model, input, store: false, generation_config: { max_output_tokens: maxTokens } };
  if (system) body.system_instruction = system;
  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => ({}));
  return { upstream, data };
}

async function callGemini(res, system, messages, maxTokens) {
  const input = messages.map((m) => (typeof m?.content === "string" ? m.content : "")).filter(Boolean).join("\n\n");
  if (!input) return fail(res, 400, "messages must contain text");
  try {
    let { upstream, data } = await geminiOnce(GEMINI_MODEL, system, input, maxTokens);
    // If the configured model name is not available to this key, try Google's "latest" alias once.
    if (upstream.status === 404 && GEMINI_MODEL !== GEMINI_FALLBACK_MODEL) {
      ({ upstream, data } = await geminiOnce(GEMINI_FALLBACK_MODEL, system, input, maxTokens));
    }
    const err = data.error || (Array.isArray(data.errors) ? data.errors[0] : null);
    if (!upstream.ok || err || data.status === "failed") {
      const detail = err?.message || data.message || `Gemini API returned ${upstream.status}`;
      const hint = upstream.status === 429 ? " The free tier limit was reached; wait a minute and try again." : "";
      return fail(res, upstream.ok ? 502 : upstream.status, `${detail}${hint}`, "ai_failed");
    }
    const text = (data.steps || [])
      .filter((s) => s?.type === "model_output")
      .flatMap((s) => s.content || [])
      .filter((c) => c?.type === "text")
      .map((c) => c.text || "")
      .join("");
    if (!text) return fail(res, 502, `Gemini returned no text (status: ${data.status || "unknown"}).`, "ai_failed");
    return res.status(200).json({ content: [{ type: "text", text }], stop_reason: data.status, model: data.model, provider: "gemini" });
  } catch (e) {
    return fail(res, 502, `Could not reach the Gemini API: ${e.message}`, "ai_failed");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ACCESS_CODE) return fail(res, 500, "Server is not configured: set ACCESS_CODE in Vercel.", "not_configured");
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.", "bad_access_code");
  const provider = pickProvider();
  if (!provider) return fail(res, 501, "AI scoring and drafting are not configured: set GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY in Vercel.", "ai_not_configured");

  const { system, messages, max_tokens, web_search, domains } = req.body || {};
  const allowedDomains = (Array.isArray(domains) ? domains : [])
    .filter((d) => typeof d === "string" && /^(?=.{4,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d))
    .slice(0, 40);
  if (!Array.isArray(messages) || messages.length === 0) return fail(res, 400, "messages is required");

  if (provider === "gemini") {
    if (web_search) return fail(res, 501, "Web search is not configured: set LANGSEARCH_API_KEY in Vercel.", "search_unavailable");
    return callGemini(res, typeof system === "string" ? system : "", messages, Math.min(Number(max_tokens) || 4000, MAX_TOKENS_CAP));
  }

  const body = {
    model: MODEL,
    max_tokens: Math.min(Number(max_tokens) || 4000, MAX_TOKENS_CAP),
    messages: [...messages],
    fallbacks: "default",
  };
  if (typeof system === "string" && system) body.system = system;
  if (web_search) {
    const tool = { type: "web_search_20260209", name: "web_search", max_uses: 8 };
    if (allowedDomains.length > 0) tool.allowed_domains = allowedDomains;
    body.tools = [tool];
  }

  try {
    const content = [];
    let data;
    // Server tools can pause a long turn; send the partial turn back to let it continue.
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2026-10-21",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify(body),
      });
      data = await upstream.json();
      if (!upstream.ok || data.error) {
        return fail(res, upstream.status || 502, data.error?.message || "Anthropic API error");
      }
      content.push(...(data.content || []));
      if (data.stop_reason !== "pause_turn") break;
      body.messages = [...body.messages, { role: "assistant", content: data.content }];
    }
    if (data.stop_reason === "refusal") return fail(res, 422, "The model declined this request.");
    return res.status(200).json({ content, stop_reason: data.stop_reason, model: data.model });
  } catch (e) {
    return fail(res, 502, `Could not reach the Anthropic API: ${e.message}`);
  }
}
