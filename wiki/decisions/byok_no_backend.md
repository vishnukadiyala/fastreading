---
tags: [decision, architecture, byok, security]
status: active
related: [anthropic_api, ai_section_summaries, static_no_build]
---

# Decision: BYOK, No Backend

**Date:** 2026-05-26 (decided when adding AI summaries)

**Decision:** Users supply their own Anthropic API key. The key lives in
their browser's localStorage and is sent only to `api.anthropic.com`. We
don't host a proxy server, don't share a credential, don't see any usage.

## Why

**The cost of hosting a proxy isn't justified for a hobby project.** A proxy
would mean:

- A server somewhere (Cloudflare Worker, Lambda, etc.)
- Anthropic billing on my account, with rate-limiting per user to prevent
  abuse
- Auth (otherwise random visitors burn through the budget)
- A privacy story for the PDFs being summarized

BYOK sidesteps all of it. The trade-offs:

| BYOK | Hosted proxy |
|---|---|
| Zero infra for me | Need a backend |
| Each user has their own key, rate limit, billing | I pay (with quotas) |
| Friction: user needs an API key (~5 min on console.anthropic.com) | One-click |
| No abuse vector | Need DDoS / abuse protection |
| Privacy: text goes browser → Anthropic, never through me | Privacy: through me |
| Stays on GitHub Pages | Need to move infra |

For a tool aimed at researchers (who often already have API keys, or can
get one in minutes), BYOK is reasonable. If this ever becomes a wider
consumer tool, hosting a proxy with auth becomes worth considering.

## Security implications

Shipping API keys to clients is generally a bad idea — that's why
Anthropic's CORS policy requires an explicit opt-in
(`anthropic-dangerous-direct-browser-access: true`). We accept that because:

1. **Each user provides their own key.** There's no shared credential. The
   "leaked key" risk is "the user leaks their own key", which is on them.
2. **The key never touches our infra.** localStorage is per-origin; we
   serve from `vishnu.kadiyala.net/fastreading/`, so only our origin can
   read the key. The key is sent only to `api.anthropic.com`.
3. **XSS would be game-over** — but we don't accept user-generated HTML.
   pdf.js produces text only, our renderer goes through `escapeHtml()`
   before any `innerHTML` write, and the API key input is type=password.

The Settings dialog tells the user explicitly: "Stored only in your browser
(localStorage) and sent directly to the Anthropic API for section
summaries." If they're unhappy with that model, they can clear the key any
time.

## What we'd do differently if hosting

If we were running a proxy server, we'd:

- Use a session token per user (signed JWT or similar) instead of shipping
  the upstream API key.
- Rate-limit per session at a sensible cap.
- Audit / log nothing about content, only usage tokens.
- Probably move off GitHub Pages (or pair with a separate API host).

That's a different project shape — feasible, but not what this is.

## What this rules in / out

- ✅ Adding more BYOK features (Q&A on sections, citation lookup, etc.) —
  same pattern, no infra change.
- ✅ Letting users pick a different model (Sonnet for higher quality) — just
  a select element wired to the request body.
- ❌ Anonymous / no-account use of AI features — we'd need a backend.
- ❌ Server-side caching across users — out of scope.

## Related

- [[anthropic_api]] — wire-level details on the BYOK calls
- [[static_no_build]] — the no-backend story is contiguous with the no-build
  story (both fall out of "stays on GitHub Pages")
- [[ai_section_summaries]] — the feature this enables
