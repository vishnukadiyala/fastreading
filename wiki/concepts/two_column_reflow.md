---
tags: [concept, pdf, heuristic, layout]
status: active
related: [pdf_extraction, pdfjs]
---

# Two-Column Reflow

pdf.js's `getTextContent()` returns text items in **document order**, which
is roughly the order they were written to the file — *not* the order a reader
would scan them. On a two-column research paper, this means the items
interleave like:

```
[left col line 1] [right col line 1]
[left col line 2] [right col line 2]
...
```

Concatenating them as-is gives you garbled prose. We need to recover the
visual reading order.

## Detection heuristic

For each page, classify items by their x-coordinate relative to the page
midline (`midX = pageWidth / 2`):

- `clearLeft` — items whose right edge is < `midX - 10`
- `clearRight` — items whose left edge is > `midX + 10`

A page is "two-column" if **both** clearLeft and clearRight are ≥25% of the
total items. The 10px slack absorbs near-midline items (often spanning
content or close to the gutter).

If not two-column, fall back to a single y-then-x sort.

## Column assignment

For two-column pages, each item lands in one of three buckets based on its
center x and width:

```js
const x = it.transform[4];        // left edge in PDF coords
const w = it.width || 0;
const center = x + w / 2;
const xEnd = x + w;

if (x < midX && xEnd > midX && w > pageWidth * 0.45) {
  spanning.push(it);              // titles, full-width headings
} else if (center < midX) {
  left.push(it);
} else {
  right.push(it);
}
```

The 45%-width threshold for "spanning" filters out items that just happen to
cross the midline because of italic kerning or a wide character. Real
spanning content (a paper title, a full-width table caption) is typically
much wider than half the page.

## Emission order

After sorting each bucket by `sortYThenX`:

```
spanning  →  left  →  right
```

Spanning items go first because they're almost always at the top of the page
(titles, banners) or constitute headers that should bracket the column
content. This isn't perfect — a wide figure caption mid-page will appear at
the top of the reflowed text rather than between the columns above/below it
— but it's far better than the interleaved baseline.

## sortYThenX

PDF y-coordinates grow **upward** from the bottom-left origin. So
top-to-bottom reading order is descending y:

```js
function sortYThenX(a, b) {
  const dy = b.transform[5] - a.transform[5];  // PDF y desc = visual top→bot
  if (Math.abs(dy) > 4) return dy;
  return a.transform[4] - b.transform[4];      // same line → left to right
}
```

The 4-pixel y-tolerance treats items on the same baseline as a single line
even when their reported y differs by a fraction.

## Known failure modes

- **1.5-column / sidebar layouts** — single main column with a thin sidebar.
  Detection sees `clearRight` (or left) below 25% and falls back to
  single-column sort, leaving the sidebar interleaved with main text.
- **Three-column papers** — both halves have items, so it detects as
  two-column. The middle column ends up split between left and right.
- **Rotated text** (e.g., page numbers in margins) — comes through in
  whatever order pdf.js emits; usually not enough volume to matter.
- **Equation arrays** — y-coordinates per fragment can be inconsistent;
  the 4px tolerance sometimes misorders them. We deferred equation handling
  anyway, so this rarely surfaces.

## Tuning levers

If a specific paper comes through garbled, the levers (in priority order):

1. Adjust the 25% column-detection threshold — lower it to catch more
   two-column pages, higher to avoid false positives.
2. Adjust the 45% spanning-width threshold — lower to catch narrower
   full-width content.
3. Adjust the 4px line-tolerance — higher merges noisier baselines, lower
   separates closely spaced lines.

None of these have been tuned against a corpus — they're educated initial
guesses. If we ever collect a "papers that break this" set, that's the time
to tune.

## Files

- [`app.js`](../../app.js) — `reflowPageItems`, `sortYThenX`, `joinItemsByLine`

## Related

- [[pdf_extraction]] for the full pipeline this fits into
- [[pdfjs]] for the underlying API surface
