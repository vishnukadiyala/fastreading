# Wiki Log

Chronological record of wiki activity. Each entry: `## [YYYY-MM-DD] action | Description`
Actions: init, ingest, query, update, lint.

## [2026-05-26] init | Wiki bootstrapped

Created the initial wiki for fastreading after v1 shipped. Structure follows
the user-level CLAUDE.md convention, adapted from the ICML/VABL wiki layout
but reshaped for a web-app project: `architecture/`, `features/`, `concepts/`,
`integrations/`, `decisions/` instead of `algorithms/`, `experiments/`,
`papers/`, `reviews/`.

Pages created:
- `index.md`, `log.md`
- `architecture/overview.md`
- `features/`: rsvp_reader, pdf_extraction, library_resume, ai_section_summaries
- `concepts/`: orp_anchor, two_column_reflow, section_detection
- `integrations/`: pdfjs, anthropic_api
- `decisions/`: byok_no_backend, static_no_build, outline_first_landing
- `raw/manifest.md` (catalog only — no separate raw docs)

Also registered the project in the cross-project dashboard at
`~/.claude/wiki/projects/fastreading.md`.

State at init time: app is feature-complete for the v1 brief (RSVP + chunked
modes, PDF extraction with two-column reflow, bibliography skip, library
with resume, AI section summaries). Live at
`http://vishnu.kadiyala.net/fastreading/`.

Latest commit on `main` at init: `4f58514` (AI section summaries with BYOK
Anthropic API). Five commits total since project start, same day.
