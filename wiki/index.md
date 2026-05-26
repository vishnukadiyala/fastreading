# fastreading Wiki — Index

LLM-maintained knowledge base for the fastreading hobby project — a browser-based
RSVP speed reader for research papers, with AI section summaries.

Read this first to navigate. See [log.md](log.md) for activity history.

Last updated: 2026-05-26

> **Status — 2026-05-26: v1 shipped.** Static site live at
> `http://vishnu.kadiyala.net/fastreading/`. Core flow works:
> drop PDF → outline view with detected sections → optional AI summaries
> (Haiku 4.5, BYOK) → scoped RSVP reader with ORP anchor.
> No backend. No build step. Hosted on GitHub Pages.

---

## Architecture

- [Overview](architecture/overview.md) — The whole app in one page: three files,
  the data flow from PDF to RSVP, where state lives, how the views switch.

## Features

- [RSVP Reader](features/rsvp_reader.md) — Single-word and chunked playback with
  the ORP anchor letter, WPM/chunk/mode controls, sentence-context panel.
- [PDF Extraction](features/pdf_extraction.md) — pdf.js text extraction, two-column
  reflow, bibliography auto-skip, hyphenation cleanup.
- [Library & Resume](features/library_resume.md) — localStorage-backed library of
  recent papers with saved position, persisted settings, auto-resume on reopen.
- [AI Section Summaries](features/ai_section_summaries.md) — Browser-direct
  Anthropic API calls (Haiku 4.5, BYOK), concurrent batch over detected sections,
  cached per-paper in the library entry.

## Concepts

- [ORP Anchor Letter](concepts/orp_anchor.md) — Optimal Recognition Point: which
  letter to pin red, and how the CSS grid keeps it at a fixed x-coordinate
  across every word.
- [Two-Column Reflow](concepts/two_column_reflow.md) — How we recover reading
  order from pdf.js's flat text-item list when a page has two columns.
- [Section Detection](concepts/section_detection.md) — Heuristic for finding
  section headers in extracted PDF text (numbered prefixes + known headings).

## Integrations

- [pdf.js](integrations/pdfjs.md) — Loaded from jsDelivr CDN, runs entirely in
  the browser. Notes on the `transform` array, `getTextContent`, and reading-order
  quirks.
- [Anthropic API](integrations/anthropic_api.md) — Browser-direct fetch with
  `anthropic-dangerous-direct-browser-access`, model selection, prompt-caching
  gotchas (Haiku's 4096-token minimum).

## Decisions

- [BYOK, No Backend](decisions/byok_no_backend.md) — Why users supply their own
  Anthropic API key instead of us hosting a proxy.
- [Static Site, No Build](decisions/static_no_build.md) — Three plain files,
  ES modules from CDN, deploys to GitHub Pages on push.
- [Outline-First Landing](decisions/outline_first_landing.md) — Why a paper
  opens to an outline view (with summaries) rather than dropping straight into
  the RSVP reader.

**Raw manifest:** [`raw/manifest.md`](../raw/manifest.md) — what the
authoritative sources are (code + git, no separate raw documents).
