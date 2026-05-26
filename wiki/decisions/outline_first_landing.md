---
tags: [decision, ux, ai, triage]
status: active
related: [ai_section_summaries, rsvp_reader, section_detection]
---

# Decision: Outline-First Landing

**Date:** 2026-05-26 (decided after the wife-review pivot)

**Decision:** When a paper loads, the user lands on an **outline view**
(section list with AI summary slots), not directly in the RSVP reader. To
read, they either click "Read this section" on one of the cards or
"Read full paper" at the top.

## Why

This was a direct response to feedback: the wife test of v1 confirmed
that RSVP is polarizing and that comprehension research doesn't strongly
support RSVP for deep reading of technical material. The pivot was to
reframe the app from "replace your reading" to "triage what's worth
reading."

The outline view IS the product, in this framing:

1. Drop a paper.
2. Glance at section titles + AI summaries.
3. Decide:
   - This whole paper is worth a careful read on paper → close the app.
   - This one section is the interesting part → RSVP that section, then
     decide whether to read the original.
   - This is irrelevant → close.

RSVP becomes a tool for **section-level skimming**, not a primary reading
mode. That's a much more defensible niche than "replace eye scanning."

## What changed in the code

- New `<section id="outline">` between drop-zone and reader.
- `startReading()` now hides the reader and shows the outline by default;
  the reader is hidden until the user explicitly enters it.
- New `enterReader(sectionIdx | null)` sets `scopeStart`/`scopeEnd` based on
  the user's choice (a section, or the whole paper).
- "Back to outline" button in the reader controls bar.

See [[ai_section_summaries]] for the AI infrastructure, [[section_detection]]
for how the outline is populated.

## Trade-offs

| Outline-first | Reader-first |
|---|---|
| Skim-first workflow matches comprehension research | One fewer click to start reading |
| Forces the user to choose what to read | "Just play" works for short docs |
| AI summaries discoverable on load | API key is opt-in, summaries appear later |
| Encourages section-scoped reading | Encourages start-to-finish reading |

The "one fewer click" cost is real but small. Users who want to read the
whole paper can hit "Read full paper" at the top.

## What rules-in this decision

- ✅ Adding a triage view that condenses all summaries into one scrollable
  card (recommended next step).
- ✅ Adding per-section actions: "Ask a question about this section",
  "Show original PDF page", "Save to notes."
- ✅ Tree-structured section nav (2 → 2.1 → 2.2) — naturally lives in the
  outline.

## What this rules out

- ❌ Auto-play on load. The outline is the explicit pause.
- ❌ A "fully linear" experience where the user only sees one word at a
  time. We expose more chrome than a Spritz-style reader by design.

## Honest caveat

Section detection isn't perfect (see [[section_detection]] failure modes).
On papers where it produces one giant section or wildly wrong splits, the
outline view becomes less useful than it should be. If we encounter that in
practice, the fix is to improve detection — possibly by adding an
AI-fallback section-detection pass — not to abandon outline-first.

## Related

- [[ai_section_summaries]] — the AI infrastructure that makes the outline
  worth landing on
- [[rsvp_reader]] — what the user enters from the outline
- [[section_detection]] — what populates the outline
