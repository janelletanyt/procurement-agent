// Vercel serverless function: forwards requests to the Anthropic Messages API.
// The API key stays on the server, and callers must send the shared access code.
//
// Required environment variables (set in Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  – your Anthropic API key
//   ACCESS_CODE        – the code visitors must enter before the agent will run
// Optional:
//   ANTHROPIC_MODEL    – defaults to claude-sonnet-5-5

import { createHash, timingSafeEqual } from "node:crypto";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOKENS_CAP = 16000;
const MAX_CONTINUATIONS = 4;

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest();
const codeMatches = (given) => timingSafeEqual(sha(given), sha(process.env.ACCESS_CODE));
const fail = (res, status, message) => res.status(status).json({ error: { message } });

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!process.env.ANTHROPIC_API_KEY || !process.env.ACCESS_CODE) {
    return fail(res, 500, "Server is not configured: set ANTHROPIC_API_KEY and ACCESS_CODE in Vercel.");
  }
  if (!codeMatches(req.headers["x-access-code"])) return fail(res, 401, "Wrong or missing access code.");

  const { system, messages, max_tokens, web_search } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) return fail(res, 400, "messages is required");

  const body = {
    model: MODEL,
    max_tokens: Math.min(Number(max_tokens) || 4000, MAX_TOKENS_CAP),
    messages: [...messages],
    fallbacks: "default",
  };
  if (typeof system === "string" && system) body.system = system;
  if (web_search) body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }];

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
