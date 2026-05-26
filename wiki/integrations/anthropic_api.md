---
tags: [integration, anthropic, claude, api, byok]
status: active
related: [ai_section_summaries, byok_no_backend]
---

# Anthropic API Integration

We call the Anthropic Messages API directly from the browser using `fetch`,
with the user's API key from `localStorage`. No SDK (the official SDK is
Node-only), no proxy, no server.

## Endpoint

```
POST https://api.anthropic.com/v1/messages
```

## Required headers

```
content-type: application/json
x-api-key: <user's API key>
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
```

The last one is the load-bearing piece. Without it, Anthropic's CORS policy
rejects browser-origin requests because shipping API keys to clients is
generally unsafe. We opt into it explicitly because:

- The key never leaves the user's browser (we store it in localStorage and
  send it only to `api.anthropic.com`).
- Each user provides their own key — there's no shared credential to leak.
- The trade-off is documented in the Settings dialog UI.

See [[byok_no_backend]] for the broader reasoning.

## Model

`claude-haiku-4-5` for section summaries. Chosen because:

| Property | Value |
|---|---|
| Pricing | $1 / $5 per 1M input/output tokens |
| Context | 200K tokens (plenty for a section + system prompt) |
| Speed | Sub-second per call for short outputs |
| Quality | More than enough for 2-3 sentence triage summaries |

A typical paper costs sub-cent to summarize end-to-end. Not worth the
quality bump to Sonnet 4.6 for this triage workload.

## Prompt caching gotcha

We set `cache_control: {type: "ephemeral"}` on the system prompt:

```js
system: [
  {type: "text", text: SYSTEM_PROMPT, cache_control: {type: "ephemeral"}}
]
```

But — and this is the gotcha — **Haiku 4.5 has a 4096-token minimum
cacheable prefix**. Our system prompt is ~250 tokens. So the marker silently
no-ops. No error, just `cache_creation_input_tokens: 0` on every response.

We leave the marker in because:

- Adding it to a short prompt has zero cost (it doesn't trigger a write
  attempt).
- If we ever grow the prefix above 4096 (e.g., by injecting paper-wide
  context shared across all sections), caching engages automatically.
- For ~10 sections × Haiku rates, total cost is sub-cent regardless.
- It documents intent for the next reader.

Reference: `shared/prompt-caching.md` in the `claude-api` skill, which lists
the minimum prefix per model.

## Per-model minimum cacheable prefix

For reference if we ever switch models:

| Model | Min prefix |
|---|---:|
| Opus 4.7 / 4.6 / 4.5, Haiku 4.5 | 4096 tokens |
| Sonnet 4.6, Haiku 3.5, Haiku 3 | 2048 tokens |
| Sonnet 4.5 / 4.1 / 4 / 3.7 | 1024 tokens |

So a switch to Sonnet would let our prompt cache *if* we grew it to ~2K
tokens. Not currently justified.

## Request body

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 300,
  "system": [...],
  "messages": [
    {"role": "user", "content": "Paper: <name>\nSection: <title>\n\n<text>"}
  ]
}
```

`max_tokens: 300` is generous for 2-3 sentences; we don't ask for streaming
because the output is short and we want the full response before rendering
the summary card.

## Response shape

```json
{
  "content": [{"type": "text", "text": "<summary>"}],
  "usage": {"input_tokens": ..., "output_tokens": ...},
  "stop_reason": "end_turn"
}
```

We grab the first `text`-type block and call it the summary. No structured
output / JSON schema — keeping it free-form text avoids the schema-compile
latency overhead and is fine for 2-3 sentences.

## Error handling

```js
if (!response.ok) {
  let detail = `HTTP ${response.status}`;
  try {
    const err = await response.json();
    if (err?.error?.message) detail = err.error.message;
  } catch {}
  throw new Error(detail);
}
```

Common errors the user sees:

| Status | Likely cause | UI behavior |
|---|---|---|
| 401 | Invalid API key | "Failed: invalid x-api-key" on the card |
| 429 | Rate limit exceeded | "Failed: rate_limit_error" — user can retry |
| 529 | Overloaded | "Failed: overloaded_error" — user can retry |
| 400 | Bad request (very unlikely with our fixed shape) | Surface raw message |

Errors are per-card. We don't retry automatically — the user clicks
"Summarize" again on the failed card.

## Concurrency

`summarizeAll()` runs up to 3 requests in parallel via a hand-rolled pump.
See [[ai_section_summaries]] for the algorithm. Three is safe under any
tier's RPM cap.

## Files

- [`app.js`](../../app.js) — `summarizeSection`, `summarizeOne`,
  `summarizeAll`, `SYSTEM_PROMPT`, `MODEL`

## Related

- [[ai_section_summaries]] for the feature this powers
- [[byok_no_backend]] for the architectural rationale
