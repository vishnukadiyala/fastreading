---
tags: [concept, orp, rsvp, ui, css]
status: active
related: [rsvp_reader]
---

# ORP Anchor Letter

**ORP** = Optimal Recognition Point. In RSVP-style readers (Spritz being the
canonical example), every word has one letter the eye naturally fixates on.
If that letter is pinned to a fixed x-coordinate on screen, the eye doesn't
need to scan — it just lets words "fall" through the anchor.

## Which letter is the anchor

Standard ORP position based on word length:

| Word length | ORP index (0-based) |
|---|---|
| 1 | 0 |
| 2-5 | 1 |
| 6-9 | 2 |
| 10-13 | 3 |
| ≥14 | 4 |

So `cat` → `cAt`, `reading` → `reAding`, `transformer` → `traNsformer`.

```js
function orpIndex(word) {
  const n = word.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}
```

## Fixing the anchor in CSS

The non-obvious half. With `text-align: center` the *whole word* centers,
which means the red ORP letter shifts left/right with word length — the
exact thing we're trying to avoid.

The fix is a three-column CSS grid:

```css
.word-display {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  overflow: hidden;
}
.word-display .pre {
  text-align: right;       /* hugs the anchor from the left */
  white-space: nowrap;
  overflow: hidden;
}
.word-display .orp {
  text-align: center;
  color: var(--accent);    /* red */
  font-weight: 700;
}
.word-display .post {
  text-align: left;        /* hugs the anchor from the right */
  white-space: nowrap;
  overflow: hidden;
}
```

The middle column is `auto`-sized (just the width of the ORP letter), and the
outer columns are equal `1fr` shares. So the ORP column is always centered on
the container width, regardless of pre/post text length.

When pre or post overflows their column, `overflow: hidden` clips on the
outer edge: long `pre` text clips on the left (because `text-align: right`
pushes overflow off the left edge), long `post` clips on the right. The
anchor stays put.

## Visual anchor rails

Two thin vertical red ticks above and below the word display reinforce the
fixed column visually. They're also positioned by `margin: 0 auto`, so they
sit on the container's horizontal center — which is exactly where the ORP
column is centered.

## Chunked-mode anchor

In chunked mode (2-5 words at once), we pick the **longest word** as the
visual anchor — its ORP letter goes in the middle column; everything else
flows in pre/post:

```
preText  = leftWords.join(" ") + " " + pivotWord.slice(0, orpIdx)
orpChar  = pivotWord[orpIdx]
postText = pivotWord.slice(orpIdx + 1) + " " + rightWords.join(" ")
```

This keeps a stable fixation point even with multiple words, though the
saccade load is higher than pure RSVP.

## Why grid and not flexbox

Flexbox can do this with `justify-content: space-between` and fixed flex
basis, but grid's `1fr auto 1fr` template states the intent more directly:
"two flexible columns flanking a content-sized middle." We also avoid
edge-case bugs with min-content on flex items.

## Files

- [`app.js`](../../app.js) — `orpIndex`, `renderWord`, `renderChunk`
- [`styles.css`](../../styles.css) — `.word-display`, `.anchor-rail`,
  `.word-display .pre/.orp/.post`

## Related

- [[rsvp_reader]] for the playback loop that drives this
