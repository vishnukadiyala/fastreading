---
tags: [integration, pdfjs, browser]
status: active
related: [pdf_extraction, two_column_reflow, static_no_build]
---

# pdf.js Integration

Mozilla's pdf.js renders and extracts text from PDFs entirely in the browser
— no server-side processing, no PDF data leaving the user's machine.

**Version pinned:** `pdfjs-dist@4.0.379` (jsDelivr CDN).

## Loading

ESM build, loaded as a module from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs"
        type="module"></script>
<script src="app.js" type="module"></script>
```

```js
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";
```

Two URLs because pdf.js uses a Web Worker for parsing. We must point
`workerSrc` at the worker file before calling `getDocument`, or the first
call hangs.

## Extracting text

```js
const buf = await file.arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  // content.items: array of TextItem
}
```

`content.items` is the raw text-fragment list. Each `TextItem` has:

| Field | What it is |
|---|---|
| `str` | The literal text content (may be empty for spacing) |
| `transform` | `[scaleX, skewY, skewX, scaleY, x, y]` — affine transform; index 4/5 are translation |
| `width` | Item width in PDF coords |
| `height` | Item height in PDF coords |
| `hasEOL` | True if this item ends a line (we don't currently use it) |
| `fontName` | Internal font ID (not useful for us) |

We pull `transform[4]` for x, `transform[5]` for y, and `width`. See
[[two_column_reflow]] for how we use them.

## Page dimensions

Needed for the column-detection midline:

```js
const viewport = page.getViewport({ scale: 1 });
const pageWidth = viewport.width;
```

Always pass `scale: 1` — we don't actually render the page, we just need
the logical width to compare against item x-coords.

## Coordinate system

PDF coords origin is **bottom-left**, y grows upward. So:

- "Top of page" = high y
- "Bottom of page" = low y
- "Top-to-bottom reading order" = **descending** y

This is the opposite of CSS / canvas conventions and is the most common
source of off-by-one bugs in PDF text extraction. Our `sortYThenX` returns
`b.transform[5] - a.transform[5]` to sort descending.

## What we don't use

- **`getViewport({scale})` rendering** — we don't render pages, just
  extract text. If we ever add a side-by-side PDF preview, this is the API.
- **`hasEOL`** — we infer line breaks from y-coordinate jumps instead.
  Mixing the two would be more accurate but adds complexity.
- **Font metadata** — could be used to detect headings (larger font →
  heading), but our text-pattern heuristic is good enough.
- **Annotations / form fields / outline** — pdf.js exposes these but
  research papers rarely have them.

## CDN choice

jsDelivr was the first I tried and it worked. Alternatives: unpkg, esm.sh,
self-hosted. No build step means we can't self-host without committing the
pdf.js bundle to the repo, which we don't want for ~1MB of vendor code.

If jsDelivr ever has an outage, the app breaks. Tolerable for a hobby
project; if that became a problem, we'd self-host.

## Files

- [`index.html`](../../index.html) — script tags for the CDN modules
- [`app.js`](../../app.js) — `extractPdfText`, `reflowPageItems`

## Related

- [[pdf_extraction]] for our pipeline on top of pdf.js
- [[two_column_reflow]] for how we use `transform[4]` / `transform[5]`
- [[static_no_build]] — why we load from CDN at all
