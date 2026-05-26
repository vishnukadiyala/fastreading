---
tags: [feature, pdf, extraction, text-processing]
status: active
related: [pdfjs, two_column_reflow, section_detection]
---

# PDF Extraction

Browser-side pipeline that turns an uploaded PDF into a clean, reading-ordered
text stream suitable for tokenization.

## Pipeline

```
File (drop / library / chooser)
  │
  ▼ extractPdfText()
  │   pdf.js getDocument({data: arrayBuffer})
  │   for each page:
  │     getTextContent() → array of {str, transform, width, height, ...}
  │     reflowPageItems()  ← column detection + ordered join
  │   concat all pages with "\n\n"
  ▼
splitReferences()
  │   Last "References"/"Bibliography"/"Works Cited" heading on its own line
  │   Splits into { mainText, refsText }
  │   Only triggers if refs are ≥5% of doc length (avoids stray prose matches)
  ▼
detectSections() — see [[section_detection]]
  ▼
tokenize() per section
  │   Joins hyphenated line breaks (-\n → "")
  │   Collapses repeated whitespace
  │   Splits sentences on .!?
  │   Strips leading/trailing non-alphanumerics per word
  │   Preserves internal apostrophes ('don't'), hyphens ('self-attention'),
  │   and decimal numbers ('1.5')
```

## Column reflow

pdf.js returns text items in document order, not visual order — so a
two-column ML paper comes out as `line-1-left line-1-right line-2-left ...`.
We re-order them by visual column.

Detection: a page is two-column when ≥25% of items lie clearly on each side
of the page midline. Otherwise, fall back to plain y-then-x sort.

For two-column pages:

1. Items spanning the midline with width >45% of the page → "spanning" bucket
   (titles, full-width headings, full-width tables)
2. Items with center < midX → left column
3. Items with center >= midX → right column
4. Emit: spanning (sorted y desc, then x asc) → left → right

Sort key for all buckets:
```js
function sortYThenX(a, b) {
  const dy = b.transform[5] - a.transform[5];  // PDF y grows upward, so desc
  if (Math.abs(dy) > 4) return dy;
  return a.transform[4] - b.transform[4];
}
```

The 4-pixel y-tolerance treats items on the same line as left-to-right; the
45% width threshold for spanning is empirical — narrower full-width items
(e.g., a citation in a center-aligned author block) would be missed but
that's fine.

See [[two_column_reflow]] for failure modes and what to tighten if a paper
comes through garbled.

## Bibliography skip

`splitReferences` looks for the **last** occurrence of:

```
/(^|\n)[ \t]*(?:\d+[.)]?\s+)?(References|REFERENCES|Bibliography|BIBLIOGRAPHY|Works Cited|WORKS CITED)\s*\n/g
```

The last match wins (the word "references" appears in earlier prose). If
the section that follows is <5% of the doc, we treat it as a stray heading
and don't split.

UI: when refs are detected, the reader shows a chip:
`4,210 words of references skipped` with an "Include references" checkbox.
Toggling re-tokenizes and re-renders the outline.

## Known limits

- **Unusual layouts** — 1.5-column, sidebars, three-column: reflow heuristic
  doesn't catch them.
- **Inline references on a single line** — some preprints render
  "References [1] ... [2] ..." inline; the regex requires the heading on its
  own line, so these aren't split.
- **Equations / tables / figures** — come through as garbled text inline.
  Deferred per v1 scope decision; see [[outline_first_landing]] (the AI
  summary triages them) and the open list of improvements.
- **Hyphenation across columns** — the `-\n` → `""` rejoin happens *after*
  reflow, so a word split across a column wrap may not rejoin cleanly. Hasn't
  surfaced as a real problem yet.

## Files

- [`app.js`](../../app.js) — `extractPdfText`, `reflowPageItems`, `sortYThenX`,
  `joinItemsByLine`, `splitReferences`, `tokenize`

## Related

- [[pdfjs]] for pdf.js API specifics
- [[two_column_reflow]] for the heuristic and its tuning
- [[section_detection]] — runs on the cleaned, reflowed text
