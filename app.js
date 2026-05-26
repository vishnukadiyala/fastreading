import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

const els = {
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
};

const state = {
  tokens: [],        // array of { word, sentenceIdx }
  sentences: [],     // array of strings, indexed by sentenceIdx
  index: 0,
  playing: false,
  timerId: null,
};

// ---------- ORP (Optimal Recognition Point) ----------
// Pivot letter position for the red anchor.
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
  const pre = word.slice(0, i);
  const orp = word[i] || "";
  const post = word.slice(i + 1);
  els.wordDisplay.innerHTML =
    `<span class="pre">${escapeHtml(pre)}</span>` +
    `<span class="orp">${escapeHtml(orp)}</span>` +
    `<span class="post">${escapeHtml(post)}</span>`;
}

function renderChunk(words) {
  // Pick the longest word as the visual anchor so the eye still has a fixation.
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
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---------- Tokenization ----------
function tokenize(text) {
  // Light cleanup of PDF artifacts: hyphenated line breaks, repeated whitespace.
  const cleaned = text
    .replace(/-\n/g, "")              // join hyphenated line breaks
    .replace(/\s+/g, " ")
    .trim();

  // Split into sentences (cheap heuristic; good enough for v1).
  const sentenceRegex = /[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g;
  const sentences = (cleaned.match(sentenceRegex) || [cleaned]).map((s) => s.trim()).filter(Boolean);

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
  // Per-step delay: chunked mode shows N words at once but needs more time per step.
  return (60000 / wpm) * chunkSize;
}

// Long words, clause endings, and sentence boundaries get a slight pause.
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

  // Update progress + context
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
}

function jumpSeconds(seconds) {
  const wpm = Number(els.wpm.value);
  const delta = Math.round((wpm / 60) * seconds);
  state.index = Math.max(0, Math.min(state.tokens.length - 1, state.index + delta));
  showCurrent();
}

// ---------- File loading ----------
async function loadFile(file) {
  if (!file) return;
  els.status.textContent = `Reading ${file.name}…`;
  try {
    let text;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      text = await extractPdfText(file);
    } else {
      text = await file.text();
    }
    startReading(text);
    els.status.textContent = "";
  } catch (err) {
    console.error(err);
    els.status.textContent = `Failed to read file: ${err.message}`;
  }
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    els.status.textContent = `Extracting page ${p} of ${pdf.numPages}…`;
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    pageTexts.push(pageText);
  }
  return pageTexts.join("\n\n");
}

function startReading(text) {
  const { tokens, sentences } = tokenize(text);
  if (tokens.length === 0) {
    els.status.textContent = "No readable text found in that file.";
    return;
  }
  state.tokens = tokens;
  state.sentences = sentences;
  state.index = 0;
  els.dropZone.classList.add("hidden");
  els.reader.classList.remove("hidden");
  els.wordDisplay.innerHTML = `<span class="placeholder">${tokens.length.toLocaleString()} words ready. Press Play.</span>`;
  els.progressBar.style.width = "0%";
  els.contextText.textContent = sentences[0] || "";
}

function resetReader() {
  pause();
  state.tokens = [];
  state.sentences = [];
  state.index = 0;
  els.reader.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  els.fileInput.value = "";
  els.status.textContent = "";
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

els.playPause.addEventListener("click", () => (state.playing ? pause() : play()));
els.restart.addEventListener("click", () => {
  pause();
  state.index = 0;
  showCurrent();
});
els.back.addEventListener("click", () => jumpSeconds(-10));
els.fwd.addEventListener("click", () => jumpSeconds(10));
els.reset.addEventListener("click", resetReader);

els.wpm.addEventListener("input", () => {
  els.wpmVal.value = els.wpm.value;
});
els.chunk.addEventListener("input", () => {
  els.chunkVal.value = els.chunk.value;
});
els.mode.addEventListener("change", () => {
  // RSVP mode forces chunk size of 1 for display, but slider state is preserved.
  showCurrent();
});

// Keyboard shortcuts
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
