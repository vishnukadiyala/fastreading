---
tags: [decision, architecture, deploy, build]
status: active
related: [overview, byok_no_backend, pdfjs]
---

# Decision: Static Site, No Build Step

**Date:** 2026-05-26 (project start)

**Decision:** The whole app is three files (`index.html`, `styles.css`,
`app.js`) plus a `.gitignore`. No bundler, no transpiler, no framework, no
`package.json`. Deps load from a CDN as ESM. Deploys to GitHub Pages on
push.

## Why

This is a hobby project I want to keep alive for years with minimal
maintenance. Every build tool in the JS ecosystem becomes a Wormhole of
breaking changes in 18 months. By having no build:

- The code on disk is the code in the browser.
- No `npm install`, no lockfile drift, no Node-version mismatches.
- `git push` is the entire deploy pipeline.
- Anyone can fork it and `python -m http.server` to run locally.
- I can come back to this in 3 years and still understand it.

The trade-offs (mostly minor for this scale):

| No build | With build |
|---|---|
| ES modules from CDN | Bundled, tree-shaken |
| No TypeScript | Type safety |
| No JSX | Component model |
| Source maps are the source | Need to ship maps |
| ~750 LOC in one file | Files split by concern |
| Slow CDN warmup on first load | Pre-bundled and cached |

For ~750 LOC of straightforward DOM manipulation, the build step's benefits
don't pay for themselves.

## Stack

- **HTML** — `index.html`, hand-written.
- **CSS** — `styles.css`, plain. CSS custom properties for theming. Grid +
  flexbox layouts. No preprocessor.
- **JS** — `app.js`, ES modules (`<script type="module">`). Browser-native
  imports from jsDelivr CDN for pdf.js. No bundler.
- **PDF parsing** — `pdfjs-dist@4.0.379` from jsDelivr.
- **AI summaries** — Anthropic Messages API via `fetch` from the browser.
  See [[anthropic_api]].

## Deploy

```
git push origin main
```

That's it. GitHub Pages is configured to serve from the `main` branch root.
Build time: ~30 seconds from push to live.

```
http://vishnu.kadiyala.net/fastreading/
```

(The `vishnu.kadiyala.net` apex is configured as a custom domain on the
account; `/fastreading/` is the project subpath. Default would be
`https://vishnukadiyala.github.io/fastreading/`.)

## What this rules in / out

- ✅ Anyone can read the source. The repo *is* the site.
- ✅ Trivially forkable. Drop your own GitHub Pages config and you're hosted.
- ✅ Adding more vanilla features (UI tweaks, new feature pages) — same
  pattern, no infra change.
- ❌ TypeScript / React / Vue. Adding any of those means adding a build
  step, which is exactly what we're avoiding.
- ❌ Self-hosting pdf.js without committing 1MB+ of vendor code. If
  jsDelivr ever has issues, we'd reconsider.
- ❌ Code splitting beyond `<script type="module">` lazy imports. We're
  small enough not to need it.

## When to reconsider

If the codebase exceeds ~2000 LOC of `app.js` *and* the lack of structure is
slowing changes, then it's time to either:

1. Split into multiple ES modules (still no build).
2. Bring in a tiny build (esbuild, vite) to enable TypeScript.

Not before. The "no build" property is genuinely load-bearing for the "this
should still work in 5 years" goal.

## Related

- [[overview]] — the three-file layout
- [[pdfjs]] — the only third-party dep, loaded from CDN
- [[byok_no_backend]] — the no-backend story pairs naturally with no-build
