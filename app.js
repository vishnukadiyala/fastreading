import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

const els = {
  library: document.getElementById("library"),
  libraryList: document.getElementById("library-list"),
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  status: document.getElementById("status"),
  reader: document.getElementById("reader"),
  wordDisplay: document.getElementById("word-display"),
  progressBar: document.getElementById("progress-bar"),
  playPause: document.getElementById("play-pause"),
  restart: document.getElementById("restart"),
  back: document.getElementById("back"),
  fwd: document.getElementById("fwd"),
  wpm: document.getElementById("wpm"),
  wpmVal: document.getElementById("wpm-val"),
  chunk: document.getElementById("chunk"),
  chunkVal: document.getElementById("chunk-val"),
  mode: document.getElementById("mode"),
  reset: document.getElementById("reset"),
  contextText: document.getElementById("context-text"),
  refsBar: document.getElementById("refs-bar"),
  refsInfo: document.getElementById("refs-info"),
  includeRefs: document.getElementById("include-refs"),
};

const state = {
  tokens: [],
  sentences: [],
  index: 0,
  playing: false,
  timerId: null,
  // Source-of-truth text (so we can re-tokenize when the refs toggle changes)
  mainText: "",
  refsText: "",
  includeRefs: false,
  currentEntryId: null,
  currentName: "",
};

// ---------- Storage ----------
const STORAGE = {
  library: "fastreading.library",
  settings: "fastreading.settings",
};
const MAX_LIBRARY = 10;

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE.settings);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSettings() {
  const s = {
    wpm: Number(els.wpm.value),
    chunk: Number(els.chunk.value),
    mode: els.mode.value,
  };
  try { localStorage.setItem(STORAGE.settings, JSON.stringify(s)); } catch {}
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE.library);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLibrary(lib) {
  try {
    localStorage.setItem(STORAGE.library, JSON.stringify(lib));
    return true;
  } catch {
    return false;
  }
}

function upsertLibraryEntry(entry) {
  const lib = loadLibrary();
  const idx = lib.findIndex((e) => e.id === entry.id);
  if (idx >= 0) lib[idx] = { ...lib[idx], ...entry };
  else lib.unshift(entry);
  lib.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

  // Trim to size, then drop oldest if we hit quota.
  while (lib.length > MAX_LIBRARY) lib.pop();
  while (!writeLibrary(lib) && lib.length > 1) lib.pop();
  renderLibrary();
}

function deleteLibraryEntry(id) {
  const lib = loadLibrary().filter((e) => e.id !== id);
  writeLibrary(lib);
  renderLibrary();
}

function makeEntryId(name, size) {
  let h = 0;
  const s = `${name}|${size}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `p_${(h >>> 0).toString(36)}`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function renderLibrary() {
  const lib = loadLibrary();
  if (!lib.length) {
    els.library.classList.add("hidden");
    els.libraryList.innerHTML = "";
    return;
  }
  els.library.classList.remove("hidden");
  els.libraryList.innerHTML = lib.map((e) => {
    const total = e.totalTokens || 0;
    const pct = total ? Math.min(100, Math.round((e.position / total) * 100)) : 0;
    return `<li class="library-item" data-id="${escapeAttr(e.id)}">
      <button class="library-resume" type="button">
        <span class="lib-name">${escapeHtml(e.name)}</span>
        <span class="lib-meta">${pct}% &middot; ${total.toLocaleString()} words</span>
      </button>
      <button class="library-delete" type="button" title="Remove" aria-label="Remove">&times;</button>
    </li>`;
  }).join("");
}

// ---------- ORP (Optimal Recognition Point) ----------
function orpIndex(word) {
  const n = word.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

function renderWord(word) {
  const i = orpIndex(word);
  els.wordDisplay.innerHTML =
    `<span class="pre">${escapeHtml(word.slice(0, i))}</span>` +
    `<span class="orp">${escapeHtml(word[i] || "")}</span>` +
    `<span class="post">${escapeHtml(word.slice(i + 1))}</span>`;
}

function renderChunk(words) {
  let pivot = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i].length > words[pivot].length) pivot = i;
  }
  const pivotWord = words[pivot];
  const i = orpIndex(pivotWord);
  const left = words.slice(0, pivot).join(" ");
  const right = words.slice(pivot + 1).join(" ");
  const preText = (left ? left + " " : "") + pivotWord.slice(0, i);
  const orpChar = pivotWord[i] || "";
  const postText = pivotWord.slice(i + 1) + (right ? " " + right : "");
  els.wordDisplay.innerHTML =
    `<span class="pre">${escapeHtml(preText)}</span>` +
    `<span class="orp">${escapeHtml(orpChar)}</span>` +
    `<span class="post">${escapeHtml(postText)}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---------- Tokenization ----------
function tokenize(text) {
  const cleaned = text
    .replace(/-\n/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  const sentenceRegex = /[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g;
  const sentences = (cleaned.match(sentenceRegex) || [cleaned])
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const tokens = [];
  sentences.forEach((sentence, sIdx) => {
    const rawWords = sentence.split(/\s+/).filter(Boolean);
    for (const raw of rawWords) {
      const trailing = raw.match(/[^\p{L}\p{N}]+$/u);
      const trailingPunct = trailing ? trailing[0] : "";
      const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!word) continue;
      const endsClause = /[,;:]/.test(trailingPunct);
      tokens.push({ word, sentenceIdx: sIdx, endsClause });
    }
  });

  return { tokens, sentences };
}

// ---------- Timing ----------
function baseDelay() {
  const wpm = Number(els.wpm.value);
  const chunkSize = Number(els.chunk.value);
  return (60000 / wpm) * chunkSize;
}

function dwellMultiplier(token, nextToken) {
  let m = 1;
  if (token.word.length >= 8) m *= 1.15;
  const endsSentence = nextToken ? nextToken.sentenceIdx !== token.sentenceIdx : false;
  if (endsSentence) m *= 2.2;
  else if (token.endsClause) m *= 1.3;
  return m;
}

// ---------- Playback ----------
function showCurrent() {
  const mode = els.mode.value;
  const chunkSize = Number(els.chunk.value);

  if (state.index >= state.tokens.length) {
    setPlaying(false);
    els.wordDisplay.innerHTML = `<span class="placeholder">End of document. Press Restart.</span>`;
    return;
  }

  if (mode === "rsvp" || chunkSize === 1) {
    renderWord(state.tokens[state.index].word);
  } else {
    const slice = state.tokens.slice(state.index, state.index + chunkSize).map((t) => t.word);
    renderChunk(slice);
  }

  els.progressBar.style.width = `${(state.index / state.tokens.length) * 100}%`;
  const sIdx = state.tokens[state.index].sentenceIdx;
  els.contextText.textContent = state.sentences[sIdx] || "";
}

function step() {
  const chunkSize = Number(els.chunk.value);
  const stride = els.mode.value === "chunked" ? chunkSize : 1;
  showCurrent();

  const current = state.tokens[state.index];
  const next = state.tokens[state.index + stride];
  const delay = baseDelay() * dwellMultiplier(current, next);

  state.index += stride;
  schedulePositionSave();
  state.timerId = setTimeout(step, delay);
}

function setPlaying(playing) {
  state.playing = playing;
  els.playPause.textContent = playing ? "Pause" : "Play";
  if (!playing && state.timerId) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function play() {
  if (state.tokens.length === 0) return;
  if (state.index >= state.tokens.length) state.index = 0;
  setPlaying(true);
  step();
}

function pause() {
  setPlaying(false);
  showCurrent();
  saveCurrentEntry();
}

function jumpSeconds(seconds) {
  const wpm = Number(els.wpm.value);
  const delta = Math.round((wpm / 60) * seconds);
  state.index = Math.max(0, Math.min(state.tokens.length - 1, state.index + delta));
  showCurrent();
  schedulePositionSave();
}

let positionSaveTimer = null;
function schedulePositionSave() {
  if (positionSaveTimer) return;
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    saveCurrentEntry();
  }, 3000);
}

function saveCurrentEntry() {
  if (!state.currentEntryId) return;
  upsertLibraryEntry({
    id: state.currentEntryId,
    name: state.currentName,
    mainText: state.mainText,
    refsText: state.refsText,
    includeRefs: state.includeRefs,
    position: state.index,
    totalTokens: state.tokens.length,
    lastReadAt: Date.now(),
  });
}

// ---------- PDF extraction with column reflow ----------
async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    els.status.textContent = `Extracting page ${p} of ${pdf.numPages}…`;
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    pageTexts.push(reflowPageItems(content.items, viewport.width));
  }
  return pageTexts.join("\n\n");
}

// pdf.js returns text items in document order, not visual order, so a paper
// with two columns gets read as line-1-left, line-1-right, line-2-left, ...
// We group items by visual column (using x-coordinates) and emit each column
// top-to-bottom in turn.
function reflowPageItems(rawItems, pageWidth) {
  const items = rawItems.filter((it) => it && typeof it.str === "string" && it.str.length);
  if (!items.length) return "";

  const midX = pageWidth / 2;

  // Detect two-column layout: a meaningful number of items must lie clearly
  // on EACH side of the page midline.
  let clearLeft = 0, clearRight = 0;
  for (const it of items) {
    const x = it.transform[4];
    const w = it.width || 0;
    if (x + w < midX - 10) clearLeft++;
    else if (x > midX + 10) clearRight++;
  }
  const isTwoColumn =
    clearLeft > items.length * 0.25 && clearRight > items.length * 0.25;

  if (!isTwoColumn) {
    return joinItemsByLine([...items].sort(sortYThenX));
  }

  const left = [];
  const right = [];
  const spanning = [];
  for (const it of items) {
    const x = it.transform[4];
    const w = it.width || 0;
    const center = x + w / 2;
    if (x < midX && x + w > midX && w > pageWidth * 0.45) {
      spanning.push(it);
    } else if (center < midX) {
      left.push(it);
    } else {
      right.push(it);
    }
  }
  spanning.sort(sortYThenX);
  left.sort(sortYThenX);
  right.sort(sortYThenX);

  // Page-spanning items (titles, full-width headings, full-width tables) get
  // emitted first; that's not perfect when a wide figure sits mid-page, but
  // it's far better than the interleaved baseline.
  return [
    joinItemsByLine(spanning),
    joinItemsByLine(left),
    joinItemsByLine(right),
  ].filter(Boolean).join("\n");
}

// PDF coordinate y grows upward, so we sort descending y for top-to-bottom.
function sortYThenX(a, b) {
  const dy = b.transform[5] - a.transform[5];
  if (Math.abs(dy) > 4) return dy;
  return a.transform[4] - b.transform[4];
}

function joinItemsByLine(items) {
  if (!items.length) return "";
  let out = "";
  let lastY = null;
  for (const it of items) {
    const y = it.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      out += "\n";
    } else if (out && !out.endsWith(" ") && !it.str.startsWith(" ")) {
      out += " ";
    }
    out += it.str;
    lastY = y;
  }
  return out;
}

// ---------- Bibliography split ----------
function splitReferences(text) {
  // Look for a line that is just "References" / "Bibliography" / "Works Cited"
  // (or a numbered variant like "6 References"). Last occurrence wins, since
  // these words can also appear in earlier prose.
  const re = /(^|\n)[ \t]*(?:\d+[.)]?\s+)?(References|REFERENCES|Bibliography|BIBLIOGRAPHY|Works Cited|WORKS CITED)\s*\n/g;
  let match, lastMatch;
  while ((match = re.exec(text)) !== null) lastMatch = match;
  if (!lastMatch) return { mainText: text, refsText: "" };
  const headingStart = lastMatch.index + lastMatch[1].length;
  const refsStart = lastMatch.index + lastMatch[0].length;
  // Only treat as references if the section is at least 5% of the document —
  // otherwise it's likely just a stray heading.
  if (text.length - refsStart < text.length * 0.05) {
    return { mainText: text, refsText: "" };
  }
  return {
    mainText: text.slice(0, headingStart).trimEnd(),
    refsText: text.slice(refsStart).trimStart(),
  };
}

// ---------- Reading session ----------
function applyTokensFromState() {
  const text = state.includeRefs && state.refsText
    ? state.mainText + "\n\n" + state.refsText
    : state.mainText;
  const { tokens, sentences } = tokenize(text);
  state.tokens = tokens;
  state.sentences = sentences;
  state.index = Math.max(0, Math.min(state.index, Math.max(0, tokens.length - 1)));
}

function updateRefsBar() {
  if (!state.refsText) {
    els.refsBar.classList.add("hidden");
    return;
  }
  const refTokenCount = tokenize(state.refsText).tokens.length;
  els.refsInfo.textContent = `${refTokenCount.toLocaleString()} words of references ${state.includeRefs ? "included" : "skipped"}`;
  els.includeRefs.checked = state.includeRefs;
  els.refsBar.classList.remove("hidden");
}

function startReading({ entryId, name, mainText, refsText, position, includeRefs }) {
  state.currentEntryId = entryId;
  state.currentName = name;
  state.mainText = mainText || "";
  state.refsText = refsText || "";
  state.includeRefs = Boolean(includeRefs);
  state.index = Number.isFinite(position) ? position : 0;

  applyTokensFromState();
  if (state.tokens.length === 0) {
    els.status.textContent = "No readable text found in that file.";
    return;
  }

  els.library.classList.add("hidden");
  els.dropZone.classList.add("hidden");
  els.reader.classList.remove("hidden");

  updateRefsBar();

  if (state.index > 0) {
    showCurrent();
  } else {
    els.wordDisplay.innerHTML = `<span class="placeholder">${state.tokens.length.toLocaleString()} words ready. Press Play.</span>`;
    els.progressBar.style.width = "0%";
    els.contextText.textContent = state.sentences[0] || "";
  }

  saveCurrentEntry();
}

// ---------- File loading ----------
async function loadFile(file) {
  if (!file) return;
  const id = makeEntryId(file.name, file.size);
  const existing = loadLibrary().find((e) => e.id === id);
  if (existing && existing.mainText) {
    startReading({
      entryId: existing.id,
      name: existing.name,
      mainText: existing.mainText,
      refsText: existing.refsText || "",
      position: existing.position || 0,
      includeRefs: !!existing.includeRefs,
    });
    flashStatus(`Resumed at ${Math.round(100 * (existing.position || 0) / Math.max(1, existing.totalTokens || 1))}%`);
    return;
  }

  els.status.textContent = `Reading ${file.name}…`;
  try {
    let text;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      text = await extractPdfText(file);
    } else {
      text = await file.text();
    }
    const { mainText, refsText } = splitReferences(text);
    startReading({
      entryId: id,
      name: file.name,
      mainText,
      refsText,
      position: 0,
      includeRefs: false,
    });
    els.status.textContent = "";
  } catch (err) {
    console.error(err);
    els.status.textContent = `Failed to read file: ${err.message}`;
  }
}

let statusTimer = null;
function flashStatus(msg, ms = 3000) {
  els.status.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (els.status.textContent = ""), ms);
}

function resetReader() {
  saveCurrentEntry();
  pause();
  state.tokens = [];
  state.sentences = [];
  state.index = 0;
  state.currentEntryId = null;
  state.mainText = "";
  state.refsText = "";
  els.reader.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  els.refsBar.classList.add("hidden");
  els.fileInput.value = "";
  els.status.textContent = "";
  renderLibrary();
}

// ---------- Wiring ----------
els.fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

els.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropZone.classList.add("dragover");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
});

els.libraryList.addEventListener("click", (e) => {
  const li = e.target.closest("li.library-item");
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest(".library-delete")) {
    deleteLibraryEntry(id);
    return;
  }
  const entry = loadLibrary().find((x) => x.id === id);
  if (!entry) return;
  startReading({
    entryId: entry.id,
    name: entry.name,
    mainText: entry.mainText,
    refsText: entry.refsText || "",
    position: entry.position || 0,
    includeRefs: !!entry.includeRefs,
  });
});

els.includeRefs.addEventListener("change", () => {
  if (!state.mainText) return;
  const wasPlaying = state.playing;
  pause();
  state.includeRefs = els.includeRefs.checked;
  applyTokensFromState();
  updateRefsBar();
  showCurrent();
  saveCurrentEntry();
  if (wasPlaying) play();
});

els.playPause.addEventListener("click", () => (state.playing ? pause() : play()));
els.restart.addEventListener("click", () => {
  pause();
  state.index = 0;
  showCurrent();
  saveCurrentEntry();
});
els.back.addEventListener("click", () => jumpSeconds(-10));
els.fwd.addEventListener("click", () => jumpSeconds(10));
els.reset.addEventListener("click", resetReader);

let settingsSaveTimer = null;
function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(saveSettings, 400);
}
els.wpm.addEventListener("input", () => {
  els.wpmVal.value = els.wpm.value;
  scheduleSettingsSave();
});
els.chunk.addEventListener("input", () => {
  els.chunkVal.value = els.chunk.value;
  scheduleSettingsSave();
});
els.mode.addEventListener("change", () => {
  saveSettings();
  showCurrent();
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    state.playing ? pause() : play();
  } else if (e.key === "ArrowLeft") {
    jumpSeconds(-5);
  } else if (e.key === "ArrowRight") {
    jumpSeconds(5);
  }
});

// Save position on tab close/navigation
window.addEventListener("beforeunload", () => {
  if (positionSaveTimer) clearTimeout(positionSaveTimer);
  saveCurrentEntry();
});

// ---------- Init ----------
(function init() {
  const s = loadSettings();
  if (s) {
    if (Number.isFinite(s.wpm)) { els.wpm.value = s.wpm; els.wpmVal.value = s.wpm; }
    if (Number.isFinite(s.chunk)) { els.chunk.value = s.chunk; els.chunkVal.value = s.chunk; }
    if (typeof s.mode === "string") els.mode.value = s.mode;
  }
  renderLibrary();
})();
