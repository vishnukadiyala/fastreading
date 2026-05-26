---
tags: [architecture, overview, data-flow]
status: active
related: [rsvp_reader, pdf_extraction, library_resume, ai_section_summaries]
---

# Architecture Overview

The entire app is three files plus a `.gitignore`. No build step, no bundler,
no framework. ES modules load directly from a CDN in the browser.

```
index.html   ~100 lines  — UI shell + element IDs
styles.css   ~400 lines  — dark theme, grid layouts, dialog
app.js       ~750 lines  — all logic, loaded as <script type="module">
```

## Runtime layers

```
Browser
  ├── pdf.js (CDN, jsDelivr)        ← PDF parsing, runs entirely client-side
  ├── app.js (our code)             ← all UI + state + flow
  │     ├── extraction               (PDF bytes → ordered text)
  │     ├── tokenization             (text → word + sentence stream)
  │     ├── outline + reader views   (which DOM section is visible)
  │     ├── playback engine          (setTimeout-driven RSVP loop)
  │     └── localStorage             (library, settings, API key)
  └── api.anthropic.com (optional)  ← BYOK section summaries
```

## Data flow (PDF → playback)

```
File (drop or library)
  │
  ▼
extractPdfText (pdf.js)
  │   Per page: getTextContent → reflowPageItems (column-aware)
  ▼
splitReferences
  │   Last "References"/"Bibliography" heading splits mainText / refsText
  ▼
detectSections (on mainText)
  │   Heuristic: numbered prefix OR known heading word
  ▼
applyTokensFromState
  │   Per section: tokenize → strip surrounding punctuation
  │   Accumulate into state.tokens with section startIdx/endIdx offsets
  ▼
Outline view (renderOutline)
  │   User clicks "Read this section" or "Read full paper"
  ▼
enterReader (sets state.scopeStart / state.scopeEnd)
  │
  ▼
play() → step() loop
  │   Render current token at the ORP anchor
  │   setTimeout(step, baseDelay * dwellMultiplier)
  ▼
Word renders at fixed center column (grid 1fr auto 1fr)
```

## State

All UI state lives in a single `state` object in [app.js](../../app.js) plus
DOM element references in `els`. No reactive framework; we re-render targeted
DOM regions (the outline list, the word display) on change.

Key state fields:

| Field | Purpose |
|---|---|
| `tokens` / `sentences` | Full token + sentence list for the current paper |
| `index` | Current token index (the word being displayed) |
| `scopeStart` / `scopeEnd` | Bounds for the playback loop — full paper or a single section |
| `sections` | Array of `{title, startIdx, endIdx, summary, summarizing, error}` |
| `mainText` / `refsText` | Source-of-truth text — re-tokenized when the refs toggle flips |
| `currentEntryId` | localStorage library key for the current paper |
| `playing` / `timerId` | RSVP timer state |

## Persistence

Everything is in `localStorage` under three keys:

- `fastreading.library` — array of up to 10 papers (text, position, summaries, timestamps)
- `fastreading.settings` — global WPM / chunk / mode preferences
- `fastreading.apiKey` — Anthropic API key (sent only to `api.anthropic.com`)

No server, no IndexedDB (yet). 5MB localStorage cap is plenty for ~10 papers
of plain text; oldest entries get evicted on quota error.

## Views

Three top-level sections in the DOM, one visible at a time:

1. `#library` + `#drop-zone` — landing screen (recent papers + drop target)
2. `#outline` — per-paper outline (sections + AI summary slots)
3. `#reader` — the RSVP playback view itself

Transitions are just `.hidden` class toggles in [app.js](../../app.js). No
router, no URL state — refreshing returns to the library/drop-zone view but
auto-resumes on reopen.

## Related

- [[rsvp_reader]] for the playback engine details
- [[pdf_extraction]] for the column-aware text pipeline
- [[ai_section_summaries]] for the Anthropic integration
- [[static_no_build]] for the deploy story
