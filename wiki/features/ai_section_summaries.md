---
tags: [feature, ai, anthropic, summaries, byok]
status: active
related: [anthropic_api, byok_no_backend, section_detection, outline_first_landing]
---

# AI Section Summaries

Per-section 2-3 sentence summaries powered by Claude Haiku 4.5, called
directly from the browser with a user-supplied Anthropic API key.

## Flow

1. User loads a paper → outline view shows detected sections with empty
   summary slots.
2. User clicks **Settings** → pastes API key → key persists in
   `localStorage` under `fastreading.apiKey`.
3. **Summarize all** fans out concurrent requests (limit 3) — one per
   section. Each section card flips to "Summarizing…" while pending.
4. Each call returns 2-3 sentences; summary appears inline on the card.
5. Summaries persist in the library entry (`sectionsCache`) so they survive
   reload / browser close.

Individual sections can also be summarized one-off via the per-card
"Summarize" button.

## Request shape

```
POST https://api.anthropic.com/v1/messages
Headers:
  content-type: application/json
  x-api-key: <user's key>
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true

Body:
  model: "claude-haiku-4-5"
  max_tokens: 300
  system: [
    {type: "text", text: <SYSTEM_PROMPT>, cache_control: {type: "ephemeral"}}
  ]
  messages: [{role: "user", content: "Paper: ...\nSection: ...\n\n<text>"}]
```

The `anthropic-dangerous-direct-browser-access: true` header is required for
browser-origin calls. See [[anthropic_api]] for why and what it implies.

## System prompt

Fixed, ~250 tokens. Constrains output to: state the content directly, capture
key claims/numbers, avoid filler ("This section discusses..."), keep it
terse. Full text in `app.js` → `SYSTEM_PROMPT` constant.

## Prompt caching — honest note

We set `cache_control: {type: "ephemeral"}` on the system prompt, but Haiku
4.5's minimum cacheable prefix is **4096 tokens**. Our prompt is ~250 tokens,
so caching silently no-ops on this workload. The marker is left in place
because:

- It's harmless when the prefix is under threshold (no extra cost, no error).
- If we ever grow the cached prefix above 4096 (e.g., by injecting the paper
  abstract or shared context), caching engages automatically.

For ~10 sections per paper at Haiku rates (~$1 / $5 per 1M in/out), total
cost per paper is sub-cent regardless of caching. Not worth padding the
prompt to game the threshold.

## Concurrency

`summarizeAll()` uses a hand-rolled pump with `CONCURRENCY = 3`. Three is a
compromise between:

- **Faster than serial** — typical ~10-section paper finishes in ~5-8s vs.
  ~15-20s sequential.
- **Rate-limit safe** — three is well under any tier's RPM limit; we don't
  need exponential backoff.

Per-section state (`summarizing`, `error`) is set before kicking off so the
UI shows pending state immediately on click.

## Error handling

If the fetch fails (HTTP non-2xx, network drop, JSON parse error), the
section's `error` field gets a `Failed: <message>` string, rendered in red on
the card. Other sections continue. The user can click "Summarize" on a
failed card to retry.

## Section text truncation

If a section's text exceeds **12,000 chars** (~3K words), we send only the
first chunk plus `[... truncated ...]`. The bulk of signal is in the first
chunk for typical academic sections; this caps the input token cost.

## Persistence

Summaries are cached by section **title** in the library entry's
`sectionsCache: [{title, summary}]`. On reload, `applyTokensFromState` builds
a `cacheByTitle` map and re-attaches summaries to freshly detected sections.

This works as long as section titles are stable across loads of the same
paper (they are, since detection is deterministic given the same text).

## Files

- [`app.js`](../../app.js) — `summarizeSection`, `summarizeOne`,
  `summarizeAll`, `updateAiStatus`, `renderOutline`, `SYSTEM_PROMPT`
- [`styles.css`](../../styles.css) — `.outline-section`, `.section-summary`,
  `.ai-bar`, `.settings-dialog`

## Related

- [[anthropic_api]] for the wire-level details and gotchas
- [[byok_no_backend]] for why we don't host this
- [[section_detection]] — defines what gets summarized
- [[outline_first_landing]] — the UX rationale for showing summaries first
