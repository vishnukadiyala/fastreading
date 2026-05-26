import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

const els = {
  library: document.getElementById("library"),
  libraryList: document.getElementById("library-list"),
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  status: document.getElementById("status"),

  outline: document.getElementById("outline"),
  outlineTitle: document.getElementById("outline-title"),
  outlineMeta: document.getElementById("outline-meta"),
  outlineSections: document.getElementById("outline-sections"),
  outlineReadAll: document.getElementById("outline-read-all"),
  outlineBack: document.getElementById("outline-back"),
  aiStatus: document.getElementById("ai-status"),
  summarizeAll: document.getElementById("summarize-all"),

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
  backToOutline: document.getElementById("back-to-outline"),
  contextText: document.getElementById("context-text"),
  refsBar: document.getElementById("refs-bar"),
  refsInfo: document.getElementById("refs-info"),
  includeRefs: document.getElementById("include-refs"),

  openSettings: document.getElementById("open-settings"),
  settingsDialog: document.getElementById("settings-dialog"),
  apiKeyInput: document.getElementById("api-key-input"),
  settingsSave: document.getElementById("settings-save"),
  settingsCancel: document.getElementById("settings-cancel"),
  settingsClear: document.getElementById("settings-clear"),
};

const state = {
  tokens: [],
  sentences: [],
  index: 0,
  playing: false,
  timerId: null,

  // Source-of-truth text and metadata.
  mainText: "",
  refsText: "",
  includeRefs: false,
  currentEntryId: null,
  currentName: "",

  // Sections and reading scope. scopeStart/scopeEnd are token indices into
  // state.tokens; they're equal to [0, tokens.length] for "full paper" reads
  // and narrowed when the user drops into a single section.
  sections: [],
  scopeStart: 0,
  scopeEnd: 0,
  scopeTitle: "",
};

// ---------- Storage ----------
const STORAGE = {
  library: "fastreading.library",
  settings: "fastreading.settings",
  apiKey: "fastreading.apiKey",
};
const MAX_LIBRARY = 10;
const MODEL = "claude-haiku-4-5";

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

function loadApiKey() {
  try { return localStorage.getItem(STORAGE.apiKey) || ""; }
  catch { return ""; }
}

function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(STORAGE.apiKey, key);
    else localStorage.removeItem(STORAGE.apiKey);
  } catch {}
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

// ---------- Playback (scope-aware) ----------
function showCurrent() {
  const mode = els.mode.value;
  const chunkSize = Number(els.chunk.value);

  if (state.index >= state.scopeEnd) {
    setPlaying(false);
    const msg = state.scopeTitle ? `End of "${state.scopeTitle}".` : "End of document.";
    els.wordDisplay.innerHTML = `<span class="placeholder">${escapeHtml(msg)} Press Restart or return to outline.</span>`;
    return;
  }

  if (mode === "rsvp" || chunkSize === 1) {
    renderWord(state.tokens[state.index].word);
  } else {
    const slice = state.tokens.slice(state.index, Math.min(state.index + chunkSize, state.scopeEnd))
      .map((t) => t.word);
    renderChunk(slice);
  }

  const scopeSize = Math.max(1, state.scopeEnd - state.scopeStart);
  const localPos = Math.max(0, state.index - state.scopeStart);
  els.progressBar.style.width = `${(localPos / scopeSize) * 100}%`;
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
  if (state.index >= state.scopeEnd) {
    // Final frame already shown by showCurrent; schedule one more tick so the
    // "end of section" placeholder appears after the last word's dwell.
    state.timerId = setTimeout(() => {
      state.timerId = null;
      showCurrent();
    }, delay);
    return;
  }
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
  if (state.index >= state.scopeEnd) state.index = state.scopeStart;
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
  state.index = Math.max(state.scopeStart, Math.min(state.scopeEnd - 1, state.index + delta));
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
    // Persist section summaries so they survive a page reload.
    sectionsCache: state.sections.map((s) => ({
      title: s.title,
      summary: s.summary || null,
    })),
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

function reflowPageItems(rawItems, pageWidth) {
  const items = rawItems.filter((it) => it && typeof it.str === "string" && it.str.length);
  if (!items.length) return "";

  const midX = pageWidth / 2;
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

  return [
    joinItemsByLine(spanning),
    joinItemsByLine(left),
    joinItemsByLine(right),
  ].filter(Boolean).join("\n");
}

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
  const re = /(^|\n)[ \t]*(?:\d+[.)]?\s+)?(References|REFERENCES|Bibliography|BIBLIOGRAPHY|Works Cited|WORKS CITED)\s*\n/g;
  let match, lastMatch;
  while ((match = re.exec(text)) !== null) lastMatch = match;
  if (!lastMatch) return { mainText: text, refsText: "" };
  const headingStart = lastMatch.index + lastMatch[1].length;
  const refsStart = lastMatch.index + lastMatch[0].length;
  if (text.length - refsStart < text.length * 0.05) {
    return { mainText: text, refsText: "" };
  }
  return {
    mainText: text.slice(0, headingStart).trimEnd(),
    refsText: text.slice(refsStart).trimStart(),
  };
}

// ---------- Section detection ----------
// Heuristic: a line is a section header if it's short and either matches a
// numbered prefix ("1 Introduction", "2.1 Method") or a known top-level
// section word. Imperfect on unusual layouts but covers the bulk of papers.
const KNOWN_HEADINGS = new Set([
  "abstract", "introduction", "background", "related work",
  "preliminaries", "methodology", "methods", "method",
  "approach", "model", "architecture", "experiments",
  "experimental setup", "setup", "results", "analysis",
  "evaluation", "discussion", "limitations", "conclusion",
  "conclusions", "future work", "acknowledgments",
  "acknowledgements", "appendix",
]);

const NUMBERED_HEADING = /^(\d+(?:\.\d+){0,3}\.?)\s+([A-Z][A-Za-z][^.]{0,70})$/;

function detectSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = { title: "Preamble", lines: [] };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let headingTitle = null;
    if (line.length <= 80) {
      const cleaned = line.replace(/[^\w\s]/g, "").toLowerCase().trim();
      if (KNOWN_HEADINGS.has(cleaned)) {
        headingTitle = line;
      } else {
        const m = line.match(NUMBERED_HEADING);
        if (m) headingTitle = line;
      }
    }

    if (headingTitle) {
      if (current.lines.length > 0) {
        sections.push({ title: current.title, text: current.lines.join("\n") });
      }
      current = { title: headingTitle, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    sections.push({ title: current.title, text: current.lines.join("\n") });
  }

  // Drop a tiny preamble; it's usually just title + authors junk.
  if (sections.length > 1 && sections[0].title === "Preamble" && sections[0].text.length < 200) {
    sections.shift();
  }
  // If detection produced nothing useful, fall back to a single section.
  if (sections.length === 0) {
    sections.push({ title: "Full paper", text });
  }
  return sections;
}

// ---------- Reading session ----------
function applyTokensFromState(sectionsCache) {
  // Detect sections on main text, optionally append References as a section.
  const detected = detectSections(state.mainText);

  // Merge cached summaries by section title when available.
  const cacheByTitle = new Map((sectionsCache || []).map((s) => [s.title, s.summary || null]));

  const allTokens = [];
  const allSentences = [];
  const sectionList = [];

  const appendBlock = (title, text) => {
    const { tokens, sentences } = tokenize(text);
    if (!tokens.length) return;
    const startIdx = allTokens.length;
    const sentOffset = allSentences.length;
    for (const t of tokens) allTokens.push({ ...t, sentenceIdx: t.sentenceIdx + sentOffset });
    for (const s of sentences) allSentences.push(s);
    sectionList.push({
      title,
      text,
      startIdx,
      endIdx: allTokens.length,
      summary: cacheByTitle.get(title) || null,
      summarizing: false,
      error: null,
    });
  };

  for (const sec of detected) appendBlock(sec.title, sec.text);
  if (state.includeRefs && state.refsText) appendBlock("References", state.refsText);

  state.tokens = allTokens;
  state.sentences = allSentences;
  state.sections = sectionList;
  state.scopeStart = 0;
  state.scopeEnd = allTokens.length;
  state.scopeTitle = "";
  state.index = Math.max(0, Math.min(state.index, Math.max(0, allTokens.length - 1)));
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

function startReading({ entryId, name, mainText, refsText, position, includeRefs, sectionsCache }) {
  state.currentEntryId = entryId;
  state.currentName = name;
  state.mainText = mainText || "";
  state.refsText = refsText || "";
  state.includeRefs = Boolean(includeRefs);
  state.index = Number.isFinite(position) ? position : 0;

  applyTokensFromState(sectionsCache);
  if (state.tokens.length === 0) {
    els.status.textContent = "No readable text found in that file.";
    return;
  }

  els.library.classList.add("hidden");
  els.dropZone.classList.add("hidden");
  els.reader.classList.add("hidden");
  els.outline.classList.remove("hidden");

  updateRefsBar();
  renderOutline();
  saveCurrentEntry();
}

// ---------- Outline rendering ----------
function renderOutline() {
  els.outlineTitle.textContent = state.currentName || "Untitled";
  const wordCount = state.tokens.length;
  const sectionCount = state.sections.length;
  els.outlineMeta.textContent = `${sectionCount} sections · ${wordCount.toLocaleString()} words`;

  updateAiStatus();

  els.outlineSections.innerHTML = state.sections.map((s, idx) => {
    const wordCount = s.endIdx - s.startIdx;
    let summaryHtml;
    if (s.summarizing) {
      summaryHtml = `<p class="section-summary empty">Summarizing…</p>`;
    } else if (s.error) {
      summaryHtml = `<p class="section-summary error">${escapeHtml(s.error)}</p>`;
    } else if (s.summary) {
      summaryHtml = `<p class="section-summary">${escapeHtml(s.summary)}</p>`;
    } else {
      summaryHtml = `<p class="section-summary empty">No summary yet.</p>`;
    }
    return `<li class="outline-section" data-idx="${idx}">
      <div class="section-row">
        <h3 class="section-title">${escapeHtml(s.title)}</h3>
        <span class="section-meta">${wordCount.toLocaleString()} words</span>
      </div>
      ${summaryHtml}
      <div class="section-actions">
        <button class="btn" data-action="summarize" type="button">${s.summary ? "Re-summarize" : "Summarize"}</button>
        <button class="btn primary" data-action="read" type="button">Read this section</button>
      </div>
    </li>`;
  }).join("");
}

function updateAiStatus() {
  const haveKey = !!loadApiKey();
  if (!haveKey) {
    els.aiStatus.textContent = "Add your Anthropic API key in Settings to enable AI section summaries (Haiku 4.5).";
    els.aiStatus.classList.remove("ok", "error");
    els.summarizeAll.disabled = true;
    els.summarizeAll.style.opacity = "0.5";
    return;
  }
  const done = state.sections.filter((s) => s.summary).length;
  els.aiStatus.textContent = `API key set. ${done} of ${state.sections.length} sections summarized.`;
  els.aiStatus.classList.remove("error");
  els.aiStatus.classList.toggle("ok", done === state.sections.length && state.sections.length > 0);
  els.summarizeAll.disabled = false;
  els.summarizeAll.style.opacity = "1";
}

// ---------- Anthropic API client ----------
const SYSTEM_PROMPT = `You summarize sections of a research paper for a researcher skimming to decide what's worth reading carefully.

For the section you are given, write 2-3 sentences capturing:
- What the section actually says or argues
- The key result, claim, or contribution (if any)
- Any concrete numbers, methods, or findings that matter

Be terse and state the content directly. Do NOT start with phrases like "This section discusses..." or "The authors...". Do NOT hedge. If the section is short or trivial (e.g., an acknowledgments block), say so in one sentence.`;

async function summarizeSection(apiKey, section, paperTitle) {
  // Cap section text so we don't blow up the request for unusually long
  // sections — the bulk of the signal is in the first chunk anyway.
  const sectionText = section.text.length > 12000
    ? section.text.slice(0, 12000) + "\n[... truncated ...]"
    : section.text;

  const userMessage = `Paper: ${paperTitle}
Section: ${section.title}

${sectionText}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      // cache_control marks the system prompt for caching. Haiku 4.5 has a
      // 4096-token minimum cacheable prefix, so this short prompt won't
      // actually trigger caching — it's a no-op marker that will start
      // working automatically if the prompt grows past the threshold.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      if (err?.error?.message) detail = err.error.message;
    } catch {}
    throw new Error(detail);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return (textBlock?.text || "").trim();
}

async function summarizeOne(idx) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    openSettings();
    return;
  }
  const sec = state.sections[idx];
  if (!sec) return;
  sec.summarizing = true;
  sec.error = null;
  renderOutline();
  try {
    const summary = await summarizeSection(apiKey, sec, state.currentName);
    sec.summary = summary;
    sec.error = null;
  } catch (err) {
    sec.error = `Failed: ${err.message}`;
  } finally {
    sec.summarizing = false;
    renderOutline();
    saveCurrentEntry();
  }
}

// Simple concurrency-limited batch — three in flight is a reasonable
// compromise between speed and rate-limit safety for a hobby project.
async function summarizeAll() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    openSettings();
    return;
  }
  const queue = state.sections
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => !s.summary && !s.summarizing);

  if (queue.length === 0) return;

  // Pre-flag everything so the UI shows pending state immediately.
  for (const { s } of queue) { s.summarizing = true; s.error = null; }
  renderOutline();

  const CONCURRENCY = 3;
  let active = 0;
  let next = 0;

  await new Promise((resolve) => {
    const pump = () => {
      if (next >= queue.length && active === 0) return resolve();
      while (active < CONCURRENCY && next < queue.length) {
        const { s, idx } = queue[next++];
        active++;
        summarizeSection(apiKey, s, state.currentName)
          .then((summary) => { s.summary = summary; s.error = null; })
          .catch((err) => { s.error = `Failed: ${err.message}`; })
          .finally(() => {
            s.summarizing = false;
            active--;
            renderOutline();
            saveCurrentEntry();
            pump();
          });
      }
    };
    pump();
  });
}

// ---------- Scope (section vs full) ----------
function enterReader(sectionIdx) {
  if (sectionIdx === null || sectionIdx === undefined) {
    state.scopeStart = 0;
    state.scopeEnd = state.tokens.length;
    state.scopeTitle = "";
  } else {
    const sec = state.sections[sectionIdx];
    if (!sec) return;
    state.scopeStart = sec.startIdx;
    state.scopeEnd = sec.endIdx;
    state.scopeTitle = sec.title;
  }
  // When jumping into a section, start at its beginning unless we have a
  // saved position inside it (only happens on a full-paper resume).
  if (state.index < state.scopeStart || state.index >= state.scopeEnd) {
    state.index = state.scopeStart;
  }

  els.outline.classList.add("hidden");
  els.reader.classList.remove("hidden");

  els.wordDisplay.innerHTML = `<span class="placeholder">${(state.scopeEnd - state.scopeStart).toLocaleString()} words ${state.scopeTitle ? `in "${escapeHtml(state.scopeTitle)}"` : "ready"}. Press Play.</span>`;
  els.progressBar.style.width = `${((state.index - state.scopeStart) / Math.max(1, state.scopeEnd - state.scopeStart)) * 100}%`;
  els.contextText.textContent = state.sentences[state.tokens[state.index]?.sentenceIdx || 0] || "";
}

function backToOutline() {
  pause();
  els.reader.classList.add("hidden");
  els.outline.classList.remove("hidden");
  renderOutline();
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
      sectionsCache: existing.sectionsCache || [],
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
      sectionsCache: [],
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
  state.sections = [];
  state.index = 0;
  state.scopeStart = 0;
  state.scopeEnd = 0;
  state.scopeTitle = "";
  state.currentEntryId = null;
  state.mainText = "";
  state.refsText = "";
  els.reader.classList.add("hidden");
  els.outline.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  els.refsBar.classList.add("hidden");
  els.fileInput.value = "";
  els.status.textContent = "";
  renderLibrary();
}

// ---------- Settings dialog ----------
function openSettings() {
  els.apiKeyInput.value = loadApiKey();
  if (typeof els.settingsDialog.showModal === "function") {
    els.settingsDialog.showModal();
  } else {
    els.settingsDialog.setAttribute("open", "");
  }
}

function closeSettings() {
  if (typeof els.settingsDialog.close === "function") {
    els.settingsDialog.close();
  } else {
    els.settingsDialog.removeAttribute("open");
  }
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
    sectionsCache: entry.sectionsCache || [],
  });
});

els.outlineSections.addEventListener("click", (e) => {
  const li = e.target.closest("li.outline-section");
  if (!li) return;
  const idx = Number(li.dataset.idx);
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "read") {
    enterReader(idx);
  } else if (action === "summarize") {
    summarizeOne(idx);
  }
});

els.outlineReadAll.addEventListener("click", () => enterReader(null));
els.outlineBack.addEventListener("click", () => {
  saveCurrentEntry();
  els.outline.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  renderLibrary();
});
els.summarizeAll.addEventListener("click", summarizeAll);
els.backToOutline.addEventListener("click", backToOutline);

els.includeRefs.addEventListener("change", () => {
  if (!state.mainText) return;
  const wasPlaying = state.playing;
  pause();
  state.includeRefs = els.includeRefs.checked;
  // Preserve existing summaries by feeding them in as cache.
  const cache = state.sections.map((s) => ({ title: s.title, summary: s.summary }));
  applyTokensFromState(cache);
  updateRefsBar();
  renderOutline();
  saveCurrentEntry();
  if (wasPlaying) play();
});

els.playPause.addEventListener("click", () => (state.playing ? pause() : play()));
els.restart.addEventListener("click", () => {
  pause();
  state.index = state.scopeStart;
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

els.openSettings.addEventListener("click", openSettings);
els.settingsCancel.addEventListener("click", closeSettings);
els.settingsSave.addEventListener("click", () => {
  saveApiKey(els.apiKeyInput.value.trim());
  closeSettings();
  updateAiStatus();
});
els.settingsClear.addEventListener("click", () => {
  saveApiKey("");
  els.apiKeyInput.value = "";
  updateAiStatus();
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  // Don't capture keys while a dialog is open.
  if (els.settingsDialog.open) return;
  if (e.code === "Space") {
    if (els.reader.classList.contains("hidden")) return;
    e.preventDefault();
    state.playing ? pause() : play();
  } else if (e.key === "ArrowLeft") {
    if (!els.reader.classList.contains("hidden")) jumpSeconds(-5);
  } else if (e.key === "ArrowRight") {
    if (!els.reader.classList.contains("hidden")) jumpSeconds(5);
  }
});

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
