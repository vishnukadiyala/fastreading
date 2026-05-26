---
tags: [feature, rsvp, playback, ui]
status: active
related: [orp_anchor, section_detection, library_resume]
---

# RSVP Reader

The core playback engine. Renders one word (RSVP mode) or a 2-5-word chunk
(chunked mode) at the ORP anchor, then advances on a timer.

## Modes

- **RSVP** — single word at a time. Default. Reads at 100-900 WPM via slider.
- **Chunked** — 2-5 words at once, with the longest word's ORP letter as the
  anchor. Better for technical text where context matters; consumes more eye
  movement than pure RSVP.

## Controls

| Control | Range | Effect |
|---|---|---|
| WPM | 100-900 | Base delay = `60000 / wpm`. Chunked multiplies by chunk size. |
| Chunk | 1-5 words | Stride per step in chunked mode |
| Mode | RSVP / Chunked | Toggle between word and phrase display |
| Play/Pause | — | Space bar shortcut |
| Restart | — | Jumps to `scopeStart` (section start, or 0 for full paper) |
| ±10s | — | Jumps `±(wpm/60 × 10)` tokens; clamped to scope |
| Back to outline | — | Pauses and returns to outline view |

Keyboard: **Space** play/pause, **←/→** jump 5s. Disabled when a dialog is
open or focus is in an input.

## Dwell timing

`baseDelay = (60000 / wpm) × chunkSize`. Each step multiplies by:

| Condition | Multiplier |
|---|---|
| Long word (≥8 chars) | 1.15× |
| Ends a clause (`,;:`) | 1.3× |
| Ends a sentence (next token is in a new sentence) | 2.2× |

The 2.2× pause on sentence endings was bumped from 1.6× per user request —
the original beat wasn't noticeable enough.

## Scope-aware playback

`state.scopeStart` and `state.scopeEnd` bound the playback loop. The progress
bar tracks position *within* the scope, not the whole document. Restart goes
to `scopeStart`. End-of-scope shows the section title in the placeholder
("End of '3.2 Method'. Press Restart or return to outline.").

Entry points:

- **Read full paper** — `scopeStart = 0`, `scopeEnd = tokens.length`
- **Read this section** — `scopeStart = section.startIdx`, `scopeEnd = section.endIdx`

## ORP anchor

The red letter is pinned to a fixed center column via CSS Grid
(`grid-template-columns: 1fr auto 1fr`). The grid layout was added after a
user-reported regression: with plain `text-align: center` the anchor letter
shifted left/right as word length changed. See [[orp_anchor]] for the
selection algorithm.

In chunked mode, the longest word's ORP letter is the anchor; other words
flow as text in the pre/post columns. Long chunks clip on the outer edges
rather than pushing the anchor.

## Sentence context panel

Below the controls, a collapsible `<details>` block shows the current
sentence in full. Updated on every step from `state.sentences[token.sentenceIdx]`.
Useful for re-anchoring when you miss a word.

## Files

- [`app.js`](../../app.js) — `showCurrent`, `step`, `play`, `pause`,
  `jumpSeconds`, `enterReader`, `backToOutline`
- [`styles.css`](../../styles.css) — `.word-display`, `.anchor-rail`,
  `.controls`, `.reader-display`
- [`index.html`](../../index.html) — `<section id="reader">`

## Related

- [[orp_anchor]] for the anchor letter math and CSS pinning
- [[section_detection]] for how the scope bounds are computed
- [[ai_section_summaries]] — outline summaries decide *which* section to RSVP
