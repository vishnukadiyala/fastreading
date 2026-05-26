---
tags: [concept, heuristic, sections, parsing]
status: active
related: [pdf_extraction, ai_section_summaries, outline_first_landing]
---

# Section Detection

Heuristic that turns the reflowed plain-text paper into a list of
`{title, text}` sections. Drives the outline view and the section-scoped
RSVP playback.

## What counts as a heading

A line is treated as a section header if it is **short** (≤80 chars) AND
matches one of two patterns:

1. **Known heading word** — the line, stripped of non-word chars and
   lowercased, matches one of:

   ```
   abstract, introduction, background, related work,
   preliminaries, methodology, methods, method,
   approach, model, architecture, experiments,
   experimental setup, setup, results, analysis,
   evaluation, discussion, limitations, conclusion,
   conclusions, future work, acknowledgments,
   acknowledgements, appendix
   ```

2. **Numbered heading** — matches:

   ```
   ^(\d+(?:\.\d+){0,3}\.?)\s+([A-Z][A-Za-z][^.]{0,70})$
   ```

   Catches `1 Introduction`, `2.1 Method`, `3.2.1 Loss Function`, etc.
   Requires capitalization on the first word of the title (filters out
   numeric prose like `1 day after the experiment`).

## Algorithm

```
current = { title: "Preamble", lines: [] }
for line in text.split("\n"):
  if line is heading:
    flush(current) if current.lines
    current = { title: line, lines: [] }
  else:
    current.lines.push(line)
flush(current) if current.lines

if sections[0].title == "Preamble" and sections[0].text < 200 chars:
  drop it  # usually just title + author junk at the top of page 1
```

If detection produces zero sections (heading-light document, plain `.txt`
file with no structure), we fall back to a single "Full paper" section.

## Token offsets

After detection, sections are tokenized in order. We track each section's
start and end indices in the global `state.tokens` array:

```js
sectionList.push({
  title,
  text,
  startIdx,             // first token index in state.tokens
  endIdx,               // exclusive end
  summary: null,
  summarizing: false,
  error: null,
});
```

This is what makes section-scoped RSVP possible — `enterReader(idx)` just
sets `state.scopeStart = section.startIdx` and `state.scopeEnd = section.endIdx`.

## When `includeRefs` is on

References are appended as a trailing "References" pseudo-section after all
detected ones. This way the outline still shows them as a clickable block
and the user can RSVP through the bibliography if they want.

## Failure modes

- **Headings that aren't on their own line** — some preprints render
  "1. Introduction. We propose..." on a single line; our regex requires a
  line break before the heading.
- **Capitalization-sensitive papers** — a paper whose section titles are
  ALL CAPS but not in our known-headings list (e.g., "PROPOSED APPROACH")
  won't be caught by either rule.
- **Custom heading words** — anything outside the known set + numbered
  patterns slips through and becomes part of the previous section.
- **Mid-page figures with captions** — long figure captions can confuse the
  "preamble" merging if they appear before the first detected heading.

## Tuning options if a paper breaks this

1. Add the missing heading word to `KNOWN_HEADINGS`.
2. Relax the numbered-heading regex (e.g., allow leading whitespace, allow
   lowercase first letter).
3. Drop the `length <= 80` cap (probably bad — opens it to false positives).
4. Use the AI for fallback detection: if heuristic finds <3 sections, ask
   Claude to identify section starts. Not implemented; would require an
   extra API call per paper.

## Files

- [`app.js`](../../app.js) — `detectSections`, `KNOWN_HEADINGS`,
  `NUMBERED_HEADING`, `applyTokensFromState`

## Related

- [[pdf_extraction]] runs before this; we operate on its output
- [[ai_section_summaries]] — sections are the unit of summarization
- [[outline_first_landing]] — sections are the rows in the outline UI
