---
tags: [feature, persistence, ux]
status: active
related: [overview, ai_section_summaries]
---

# Library & Resume

localStorage-backed library of recent papers with saved position, persisted
settings, and auto-resume on reopen.

## What gets saved

Three top-level keys in `localStorage`:

| Key | Shape | Notes |
|---|---|---|
| `fastreading.library` | `Array<LibraryEntry>` (max 10) | Sorted by `lastReadAt` desc |
| `fastreading.settings` | `{wpm, chunk, mode}` | Global preferences |
| `fastreading.apiKey` | string | Sent only to api.anthropic.com |

A `LibraryEntry` includes:

```js
{
  id,             // p_<hash>  — derived from filename + filesize
  name,           // file name
  mainText,       // reflowed text, refs stripped
  refsText,       // bibliography (empty string if none detected)
  includeRefs,    // user preference for this paper
  position,       // token index (where playback was when last saved)
  totalTokens,    // for the % progress display in the library list
  lastReadAt,     // ms timestamp
  sectionsCache,  // [{title, summary}] — AI summaries survive page reloads
}
```

## Saving

`saveCurrentEntry()` is called:

- On pause
- On restart
- On reset
- On `beforeunload`
- Throttled to once every 3s during playback via `schedulePositionSave()`
- After every successful AI summary

The throttle avoids hammering localStorage on every word at 600 WPM.

## Resume flow

On file drop, we hash `(name + size)` and check the library. If we find a
matching entry with non-empty `mainText`, we skip PDF extraction entirely and
re-start from the cached text + position. Status bar flashes
`Resumed at 42%`.

If the entry is missing or has no `mainText` (shouldn't happen, but
defensive), we fall through to fresh extraction.

## Eviction

`MAX_LIBRARY = 10`. Oldest entries (by `lastReadAt`) are popped on
upsert. If localStorage hits quota on write, we keep popping until the write
succeeds or only one entry remains.

A 100K-word paper is roughly 500KB of plain text — so 10 papers ≈ 5MB, near
the localStorage cap on most browsers. If a user opens an unusually large
paper (a thesis, a book), older papers will be evicted automatically.

## Library UI

Above the drop zone when non-empty. Each row:

- File name (truncated with ellipsis on overflow)
- `42% · 12,340 words` meta
- `×` delete button

Click anywhere on the row (except the `×`) to resume. The library hides
itself when empty.

## Settings persistence

WPM / chunk / mode persist across sessions via `fastreading.settings`. Slider
changes are debounced (400ms) before saving to avoid thrashing during drag.
Mode (RSVP / chunked) saves on change.

The Anthropic API key is in a separate key (`fastreading.apiKey`) so we can
clear it independently from preferences via the Settings dialog's
"Clear key" button.

## Files

- [`app.js`](../../app.js) — `loadLibrary`, `writeLibrary`,
  `upsertLibraryEntry`, `deleteLibraryEntry`, `makeEntryId`,
  `saveCurrentEntry`, `schedulePositionSave`, `loadSettings`, `saveSettings`,
  `loadApiKey`, `saveApiKey`

## Related

- [[ai_section_summaries]] — summaries are part of the library entry
- [[byok_no_backend]] for the API-key storage policy
