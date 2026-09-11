// =====================================================================
// NEXUS — single combined script.js
// =====================================================================

// ---- Shared config ----
const SUPABASE_URL = "https://fwgdilklpeoosiolrnvl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3Z2RpbGtscGVvb3Npb2xybnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI5MjQsImV4cCI6MjEwMTM3ODkyNH0.fTQ8y-zFmF_AAW51Zlj7ukE93uhunI0abBfLSeXj2lk";

// The backend (server.js) can live on a different origin than the static
// frontend (e.g. frontend on Netlify, backend on Render). Resolution order:
//   1. A URL the user saved earlier via the "can't reach backend" banner.
//   2. window.NEXUS_API_BASE, if the page defines it before script.js loads.
//   3. localhost:8787, but only when the page was opened as a local file.
//   4. Otherwise "" — same-origin requests (correct when server.js itself
//      is serving this page, e.g. http://localhost:8787/).
function resolveApiBase() {
  try {
    const saved = window.localStorage.getItem("NEXUS_API_BASE_OVERRIDE");
    if (saved) return saved.replace(/\/+$/, "");
  } catch (e) { /* localStorage unavailable (e.g. private mode) */ }
  return window.NEXUS_API_BASE || (window.location.protocol === "file:" ? "http://localhost:8787" : "");
}
let API_BASE = resolveApiBase();

function hasValidGeminiKey() { return true; }

// ---- Backend connectivity banner ----
// Pings server.js once on load. If it's unreachable, shows a banner the
// user can use to point the frontend at a different backend URL, instead
// of only discovering the problem after trying to fetch a video.
async function checkBackendConnection() {
  const banner = document.getElementById("backendBanner");
  if (!banner) return;

  try {
    const resp = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      banner.hidden = true;
      return;
    }
    showBackendBanner(`Backend responded but reported an error (HTTP ${resp.status}).`);
  } catch (e) {
    showBackendBanner("Can't reach the NEXUS backend (server.js).");
  }
}

function showBackendBanner(message) {
  const banner = document.getElementById("backendBanner");
  if (!banner) return;
  const msgEl = document.getElementById("backendBannerMsg");
  const inputEl = document.getElementById("backendBannerInput");
  if (msgEl) {
    msgEl.textContent = `${message} Run "node server.js" and open the address it prints — or, if the backend is hosted elsewhere, enter its URL below.`;
  }
  if (inputEl && !inputEl.value) {
    inputEl.value = API_BASE || `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  banner.hidden = false;
}

async function saveBackendBaseUrl() {
  const inputEl = document.getElementById("backendBannerInput");
  const statusEl = document.getElementById("backendBannerStatus");
  const raw = (inputEl.value || "").trim().replace(/\/+$/, "");
  if (!raw) return;

  if (statusEl) { statusEl.textContent = "Checking…"; statusEl.className = "backend-banner-status"; }

  try {
    const resp = await fetch(`${raw}/api/health`, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    try { window.localStorage.setItem("NEXUS_API_BASE_OVERRIDE", raw); } catch (e) { /* ignore */ }
    API_BASE = raw;
    if (statusEl) { statusEl.textContent = "Connected."; statusEl.className = "backend-banner-status ok"; }
    setTimeout(() => { document.getElementById("backendBanner").hidden = true; }, 700);
  } catch (e) {
    if (statusEl) { statusEl.textContent = "Still can't reach that URL — double-check it's running and publicly reachable over HTTPS."; statusEl.className = "backend-banner-status error"; }
  }
}

function dismissBackendBanner() {
  const banner = document.getElementById("backendBanner");
  if (banner) banner.hidden = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkBackendConnection);
} else {
  checkBackendConnection();
}

// ---- Supabase client ----
let sb = null;
try {
  if (typeof supabase === "undefined") {
    throw new Error("Supabase library failed to load from CDN.");
  }
  const { createClient } = supabase;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error(e);
}

// ---- Logo typewriter ----
(function(){
  const logoChars = Array.from("N-E-X-U-S-🌐");
  const logoEl = document.getElementById("logoText");
  const logoWrap = document.getElementById("logo");
  if (!logoEl || !logoWrap) return;

  let i = 0;
  function typeLogo(){
    if (i <= logoChars.length) {
      logoEl.textContent = logoChars.slice(0, i).join("");
      i++;
      setTimeout(typeLogo, 90);
    } else {
      setInterval(() => {
        logoWrap.classList.add("glitch");
        setTimeout(() => logoWrap.classList.remove("glitch"), 280);
      }, 3200);
    }
  }
  typeLogo();
})();

// ---- Shared UI helpers ----
let loaderSequenceTimer = null;

function showLoader(text){
  stopLoaderSequence();
  document.getElementById("loaderText").textContent = text || "Loading…";
  document.getElementById("loaderDots").style.display = "none";
  document.getElementById("loaderOverlay").classList.add("active");
}

// Cycles through a list of stage messages every ~1.7s while a longer task runs.
// The loader stays open until hideLoader() is called — the caller stops the
// cycle simply by calling hideLoader() as soon as the real result is ready.
function showLoaderSequence(stages, intervalMs){
  stopLoaderSequence();

  const textEl = document.getElementById("loaderText");
  const dotsEl = document.getElementById("loaderDots");
  const overlay = document.getElementById("loaderOverlay");

  let i = 0;
  textEl.style.opacity = "1";
  textEl.textContent = stages[0] || "Working…";
  dotsEl.style.display = "flex";
  overlay.classList.add("active");

  loaderSequenceTimer = setInterval(() => {
    i = (i + 1) % stages.length;
    textEl.style.opacity = "0";
    setTimeout(() => {
      textEl.textContent = stages[i];
      textEl.style.opacity = "1";
    }, 200);
  }, intervalMs || 1700);
}

function stopLoaderSequence(){
  if (loaderSequenceTimer) {
    clearInterval(loaderSequenceTimer);
    loaderSequenceTimer = null;
  }
}

function hideLoader(){
  stopLoaderSequence();
  document.getElementById("loaderDots").style.display = "none";
  document.getElementById("loaderOverlay").classList.remove("active");
}

function showPage(page){
  document.getElementById("page-landing").style.display = page === "landing" ? "block" : "none";
  document.getElementById("page-dashboard").style.display = page === "dashboard" ? "block" : "none";
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function showMsg(text, type){
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + type;
}

// ---- Hero animation ----
(function loopRig(){
  const doc = document.getElementById("rigDoc");
  const status = document.getElementById("rigStatus");
  if (!doc) return;

  const lines = doc.querySelectorAll(".ln");
  let step = 0;

  setInterval(() => {
    step = (step + 1) % 4;

    if (step === 0) {
      doc.classList.remove("scored");
      lines.forEach(line => line.classList.remove("done"));
      status.textContent = "in real time";
    } else {
      if (lines[step - 1]) lines[step - 1].classList.add("done");

      if (step === 3) {
        doc.classList.add("scored");
        status.textContent = "scored ✓";
      } else {
        status.textContent = "reading…";
      }
    }
  }, 900);
})();

// ---- Guest mode ----
let isGuestMode = false;
let currentUserId = null;
let bestScorePct = null;
let historyChart = null;
let confettiAnimationFrame = null;
let confettiResizeHandler = null;
let confettiPieces = [];

function continueAsGuest(){
  isGuestMode = true;
  currentUserId = "guest-" + Date.now();
  document.getElementById("whoami").textContent = "Guest mode";
  showPage("dashboard");
  loadStats();
}

async function loginWithGoogle(){
  if (!sb) {
    showMsg("Login isn't connected right now.", "error");
    return;
  }

  showLoader("Redirecting to Google…");
  const { error } = await sb.auth.signInWithOAuth({ provider: "google" });

  if (error) {
    hideLoader();
    showMsg(error.message, "error");
  }
}

async function logout(){
  isGuestMode = false;
  currentUserId = null;

  if (sb && sb.auth && sb.auth.signOut) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.log("No active Supabase session to sign out.");
    }
  }

  showPage("landing");
}

async function handleSubmit(){
  if (!sb) { showMsg("Login isn't connected right now.", "error"); return; }
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) { showMsg("Enter both an email and a password.", "error"); return; }

  const mode = document.getElementById("tabSignup").classList.contains("active") ? "signup" : "login";
  showLoader(mode === "signup" ? "Creating your account…" : "Logging in…");

  if (mode === "signup") {
    const { data, error } = await sb.auth.signUp({ email, password });
    hideLoader();
    if (error) { showMsg(error.message, "error"); return; }
    if (data.session) {
      currentUserId = data.session.user.id;
      document.getElementById("whoami").textContent = data.session.user.email;
      showPage("dashboard");
      loadStats();
    } else {
      showMsg("Account created! Check your email if confirmation is needed, then log in.", "ok");
    }
  } else {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    hideLoader();
    if (error) { showMsg(error.message, "error"); return; }
    currentUserId = data.session.user.id;
    document.getElementById("whoami").textContent = data.session.user.email;
    showPage("dashboard");
    loadStats();
  }
}

// ---- Dashboard / Quiz Engine ----
let extractedText = "";
let currentFileName = "";
let currentFileMeta = "";
let inputMode = "file";
let quizCount = 5;
let quizDifficulty = "medium";
let selectedTypes = ["mcq"];
let sessionName = "";
let quiz = [];
let answers = [];
let curQ = 0;
let isFocusQuiz = false;

// ---- Summary cache (keyed by document text, avoids re-calling the model
// when the same document is used again for a regenerated quiz) ----
let summaryCache = {};

// timing
let quizStartTime = null;
let questionTimes = [];
let qEnterTime = null;

// ---- Input mode tabs ----
const INPUT_TABS = ["file", "paste", "url", "youtube"];

function switchInputTab(tab){
  inputMode = tab;
  INPUT_TABS.forEach(t => {
    const tabBtn = document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1));
    const paneEl = document.getElementById("pane" + t.charAt(0).toUpperCase() + t.slice(1));
    if (tabBtn) tabBtn.classList.toggle("active", t === tab);
    if (paneEl) paneEl.classList.toggle("active", t === tab);
  });
  document.getElementById("uploadMsg").style.display = "none";
}

function formatBytes(bytes){
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function estimatePages(wordCount){
  return Math.max(1, Math.round(wordCount / 275));
}

function showFilePreview(name, sizeLabel, pagesLabel, kindLabel){
  document.getElementById("fpIcon").textContent = kindLabel || "DOC";
  document.getElementById("fpName").textContent = name;
  document.getElementById("fpMeta").textContent = [sizeLabel, pagesLabel].filter(Boolean).join(" · ");
  document.getElementById("filePreview").classList.add("active");
}

// ---- Recent uploads ----
const RECENT_KEY = "nexus_recent_docs_v1";

function loadRecentUploads(){
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveRecentUpload(entry){
  try {
    let list = loadRecentUploads();
    list = list.filter(x => x.name !== entry.name);
    list.unshift(entry);
    list = list.slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    renderRecentUploads();
  } catch (e) {
    // non-fatal
  }
}

function renderRecentUploads(){
  // Only show recent uploads on the results page — not during the upload step
  const list = loadRecentUploads();
  const wrap = document.getElementById("recentUploads");
  const ul = document.getElementById("ruList");
  if (!wrap || !ul) return;
  if (!list.length) { wrap.style.display = "none"; return; }

  wrap.style.display = "block";
  ul.innerHTML = "";

  // Vertical top-to-bottom list (newest first)
  list.forEach((entry, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ru-item";
    const when = new Date(entry.ts);
    const ext = (entry.name || "").split(".").pop().toUpperCase().slice(0, 4) || "DOC";
    const formattedDate = when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const formattedTime = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    row.innerHTML = `
      <span class="ru-icon-sm">${ext}</span>
      <span class="ru-info">
        <span class="ru-name">${entry.name}</span>
        <span class="ru-meta">${formattedDate} · ${formattedTime}</span>
      </span>
    `;
    row.onclick = () => {
      document.querySelectorAll(".ru-item").forEach(el => el.classList.remove("active"));
      row.classList.add("active");
      openUploadPreview(idx);
    };
    ul.appendChild(row);
  });
}

function selectRecent(idx){
  const list = loadRecentUploads();
  const entry = list[idx];
  if (!entry) return;
  proceedWithText(entry.text, entry.name, entry.meta || "");
}

function openUploadPreview(idx){
  const list = loadRecentUploads();
  const entry = list[idx];
  if (!entry) return;

  const modal = document.getElementById("uploadPreviewModal");
  const title = document.getElementById("uploadPreviewTitle");
  const modalIcon = document.getElementById("modalIcon");
  const words = document.getElementById("modalWords");
  const pages = document.getElementById("modalPages");
  const updated = document.getElementById("modalUpdated");
  const box = document.getElementById("modalPreviewBox");
  const downloadBtn = document.getElementById("downloadPreviewBtn");
  const regenerateBtn = document.getElementById("regenerateQuizBtn");

  title.textContent = entry.name;
  modalIcon.textContent = (entry.name || "DOC").split(".").pop().toUpperCase().slice(0, 4) || "DOC";

  const count = Math.max(1, (entry.text || "").trim().split(/\s+/).filter(Boolean).length);
  const pageCount = Math.max(1, Math.ceil(count / 275));
  words.textContent = count.toLocaleString();
  pages.textContent = `${pageCount} page${pageCount > 1 ? "s" : ""}`;
  const previewDate = new Date(entry.ts);
  updated.textContent = `${previewDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${previewDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  const snippet = (entry.text || "").replace(/\s+/g, " ").trim().slice(0, 260);
  box.textContent = snippet || "This document has no readable text preview available.";

  const blob = new Blob([entry.text || ""], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  downloadBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = entry.name || "NEXUS-document.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  regenerateBtn.onclick = () => {
    closeUploadPreview();
    proceedWithText(entry.text || "", entry.name || "Recent upload", entry.meta || "");
  };

  const panel = modal.querySelector(".upload-preview-panel");
  modal.classList.remove("active");
  if (panel) {
    panel.classList.remove("replay");
    void panel.offsetWidth;
  }

  requestAnimationFrame(() => {
    if (panel) {
      panel.classList.add("replay");
      void panel.offsetWidth;
    }
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  });
}

function closeUploadPreview(){
  const modal = document.getElementById("uploadPreviewModal");
  if (!modal) return;
  const panel = modal.querySelector(".upload-preview-panel");
  if (panel) {
    panel.classList.remove("replay");
    void panel.offsetWidth;
  }
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

// ---- Shared text proceed ----
function proceedWithText(text, name, meta){
  extractedText = text;
  currentFileName = name;
  currentFileMeta = meta || "";

  const msgEl = document.getElementById("uploadMsg");
  if (!extractedText || extractedText.trim().length < 30) {
    msgEl.textContent = "Couldn't find enough readable text there. Try a different file, paste more text, or a different link.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    return;
  }

  const wordCount = extractedText.trim().split(/\s+/).length;
  msgEl.textContent = `Read ${wordCount} words from "${name}". Ready to configure your quiz.`;
  msgEl.className = "msg ok";
  msgEl.style.display = "block";

  setCount(quizCount);
  setDifficulty(quizDifficulty);

  document.getElementById("stepConfigure").style.display = "none";
  showSummaryStep(text);
}

// ---- Quick overview (summary + key points) ----
function textCacheKey(text){
  // Cheap, dependency-free fingerprint: length + a few sampled characters.
  const t = text || "";
  const sample = t.slice(0, 40) + "|" + t.slice(-40) + "|" + t.length;
  return sample;
}

function compactSource(text, maxChars){
  return (text || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function buildLocalSummary(text){
  const source = compactSource(text, 8000);
  const sentences = source.match(/[^.!?]+[.!?]+/g) || [source];
  const useful = sentences.map(sentence => sentence.trim()).filter(sentence => sentence.length > 25);
  const summarySentences = useful.slice(0, 2);
  const keyPoints = useful.slice(0, 6);

  return {
    summary: summarySentences.join(" ") || source.slice(0, 360),
    keyPoints: keyPoints.length ? keyPoints : [source.slice(0, 240)]
  };
}

function showSummaryStep(text){
  const step = document.getElementById("stepSummary");
  const statusEl = document.getElementById("summaryStatus");
  const bodyEl = document.getElementById("summaryBody");
  const textEl = document.getElementById("summaryText");
  const pointsEl = document.getElementById("summaryPoints");

  step.style.display = "block";
  step.scrollIntoView({ behavior: "smooth", block: "nearest" });
  bodyEl.style.display = "none";
  statusEl.textContent = "Reading your document…";

  const key = textCacheKey(text);
  const cached = summaryCache[key];

  if (cached) {
    renderSummary(cached);
    return;
  }

  if (!hasValidGeminiKey()) {
    statusEl.textContent = "Overview unavailable — API key missing.";
    return;
  }

  const prompt = `Read only the source text below and reply ONLY with valid JSON, no markdown. Do not use outside knowledge or invent facts. If the source does not support a point, leave it out:
{"summary":"a plain-language overview in 2-3 sentences","keyPoints":["point 1","point 2","point 3","point 4"]}
Provide 4 to 6 short keyPoints, each a single important point from the text.

Text:
"""${compactSource(text, 8000)}"""`;

  callGeminiWithFallback(prompt, null)
    .then(data => {
      let raw = geminiText(data);
      raw = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(raw);

      const result = {
        summary: parsed.summary || "",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 6) : []
      };
      summaryCache[key] = result;

      // Only render if the user is still looking at this document's summary step.
      if (extractedText === text) renderSummary(result);
    })
    .catch(e => {
      console.error("Summary generation failed:", e);
      if (extractedText === text) {
        const fallback = buildLocalSummary(text);
        summaryCache[key] = fallback;
        renderSummary(fallback);
        statusEl.textContent = "Local overview";
      }
    });
}

function renderSummary(result){
  const statusEl = document.getElementById("summaryStatus");
  const bodyEl = document.getElementById("summaryBody");
  const textEl = document.getElementById("summaryText");
  const pointsEl = document.getElementById("summaryPoints");

  statusEl.textContent = "Ready";
  textEl.textContent = result.summary || "";
  pointsEl.innerHTML = "";
  (result.keyPoints || []).forEach(point => {
    const li = document.createElement("li");
    li.textContent = point;
    pointsEl.appendChild(li);
  });

  bodyEl.style.display = "block";
}

function dismissSummary(){
  document.getElementById("stepSummary").style.display = "none";
  document.getElementById("stepConfigure").style.display = "block";
  document.getElementById("stepConfigure").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- File upload ----
async function handleFile(event){
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById("fileDropLabel").textContent = file.name;
  const msgEl = document.getElementById("uploadMsg");
  msgEl.className = "msg";
  msgEl.style.display = "none";

  showLoader("Reading your document…");

  try {
    let text, pagesLabel, kind;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const res = await extractPdfText(file);
      text = res.text;
      pagesLabel = res.pages + (res.pages === 1 ? " page" : " pages");
      kind = "PDF";
    } else if (file.name.toLowerCase().endsWith(".docx")) {
      text = await extractDocxText(file);
      pagesLabel = "~" + estimatePages(text.trim().split(/\s+/).length) + " pages";
      kind = "DOCX";
    } else {
      text = await file.text();
      pagesLabel = "~" + estimatePages(text.trim().split(/\s+/).length) + " pages";
      kind = "TXT";
    }

    const sizeLabel = formatBytes(file.size);
    showFilePreview(file.name, sizeLabel, pagesLabel, kind);

    const meta = [sizeLabel, pagesLabel].filter(Boolean).join(" · ");
    saveRecentUpload({ name: file.name, text, meta, ts: Date.now() });
    proceedWithText(text, file.name, meta);
  } catch (e) {
    console.error(e);
    msgEl.textContent = "Couldn't read that file: " + e.message;
    msgEl.className = "msg error";
    msgEl.style.display = "block";
  } finally {
    hideLoader();
  }
}

// ---- Paste text ----
function usePastedText(){
  const text = document.getElementById("pasteText").value;
  const msgEl = document.getElementById("uploadMsg");

  if (!text || text.trim().length < 30) {
    msgEl.textContent = "Paste at least a short paragraph of text.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    return;
  }

  const wordCount = text.trim().split(/\s+/).length;
  const meta = "~" + estimatePages(wordCount) + " pages (pasted text)";
  saveRecentUpload({ name: "Pasted text — " + new Date().toLocaleTimeString(), text, meta, ts: Date.now() });
  proceedWithText(text, "Pasted text", meta);
}

// ---- URL fetch ----
async function fetchFromUrl(){
  const urlVal = document.getElementById("urlInput").value.trim();
  const msgEl = document.getElementById("uploadMsg");
  msgEl.style.display = "none";

  if (!urlVal) return;

  let parsed;
  try {
    parsed = new URL(urlVal);
  } catch (e) {
    msgEl.textContent = "That doesn't look like a valid URL.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    return;
  }

  showLoader("Fetching the page…");

  try {
    let text, title;

    if (parsed.hostname.endsWith("wikipedia.org")) {
      const lang = parsed.hostname.split(".")[0] || "en";
      const pageTitle = decodeURIComponent(parsed.pathname.split("/wiki/")[1] || "");
      if (!pageTitle) throw new Error("Couldn't find an article title in that Wikipedia URL.");

      const api = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&titles=${encodeURIComponent(pageTitle)}`;
      const resp = await fetch(api);
      if (!resp.ok) throw new Error("Wikipedia request failed (" + resp.status + ").");

      const data = await resp.json();
      const pages = data.query && data.query.pages;
      const page = pages ? Object.values(pages)[0] : null;
      if (!page || !page.extract) throw new Error("Couldn't find that Wikipedia article.");

      text = page.extract;
      title = page.title || pageTitle.replace(/_/g, " ");
    } else {
      const resp = await fetch(urlVal, { mode: "cors" });
      if (!resp.ok) throw new Error("The site returned an error (" + resp.status + ").");

      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,nav,footer,header,noscript").forEach(el => el.remove());

      text = (doc.body ? doc.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
      title = doc.title || parsed.hostname;
    }

    const wordCount = text.trim().split(/\s+/).length;
    const meta = "~" + estimatePages(wordCount) + " pages (from web)";
    saveRecentUpload({ name: title, text, meta, ts: Date.now() });
    proceedWithText(text, title, meta);
  } catch (e) {
    console.error(e);
    msgEl.textContent = "Couldn't read that page directly — many sites block cross-site reading. Try the \"Paste text\" tab instead. (" + e.message + ")";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
  } finally {
    hideLoader();
  }
}

// ---- YouTube video (captions/transcript) ----
function parseYoutubeId(url){
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shortsMatch = u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[2];
    }
    return null;
  } catch (e) {
    return null;
  }
}

function stripXmlTags(xml){
  return xml
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFromYoutube(){
  const urlVal = document.getElementById("youtubeInput").value.trim();
  const msgEl = document.getElementById("uploadMsg");
  const preview = document.getElementById("ytPreview");
  msgEl.style.display = "none";
  preview.classList.remove("active");

  if (!urlVal) return;

  const videoId = parseYoutubeId(urlVal);
  if (!videoId) {
    msgEl.textContent = "That doesn't look like a valid YouTube link.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    return;
  }

  showLoader("Fetching video…");

  try {
    // Title + thumbnail via YouTube's public oEmbed endpoint (CORS-friendly).
    let title = "YouTube video";
    let author = "";
    try {
      const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`);
      if (oembedResp.ok) {
        const oembedData = await oembedResp.json();
        title = oembedData.title || title;
        author = oembedData.author_name || "";
        document.getElementById("ytThumb").src = oembedData.thumbnail_url || "";
        document.getElementById("ytTitle").textContent = title;
        document.getElementById("ytMeta").textContent = oembedData.author_name ? "by " + oembedData.author_name : "";
        preview.classList.add("active");
      }
    } catch (oembedErr) {
      console.warn("YouTube oEmbed lookup failed:", oembedErr);
    }

    const transcriptUrl = `${API_BASE}/api/youtube-transcript?id=${encodeURIComponent(videoId)}`;
    const transcriptResp = await fetch(transcriptUrl);
    const transcriptData = await transcriptResp.json().catch(() => ({}));
    if (!transcriptResp.ok) {
      const error = new Error(transcriptData.error || "Transcript request failed.");
      error.httpStatus = transcriptResp.status;
      throw error;
    }
    const text = (transcriptData.text || "").replace(/\s+/g, " ").trim();

    if (!text || text.trim().length < 30) {
      throw new Error("The captions on this video were too short to build a quiz from.");
    }

    const wordCount = text.trim().split(/\s+/).length;
    const meta = "~" + wordCount + " words (from YouTube captions)";
    saveRecentUpload({ name: title, text, meta, ts: Date.now() });
    proceedWithText(text, title, meta);
  } catch (e) {
    console.error(e);
    const backendMissing = e instanceof TypeError || e.httpStatus === 404 || e.httpStatus === 405 || /localhost|fetch|server|transcript service/i.test(e.message || "");
    msgEl.textContent = backendMissing
      ? "This deployment cannot reach server.js. Run the Node app server or set window.NEXUS_API_BASE to its public HTTPS URL."
      : /caption tracks|transcript text|captions/i.test(e.message || "")
        ? "YouTube lists caption tracks for this video, but didn't return readable text from any of them. This can happen with certain auto-generated captions, region-locked videos, or very recent live-stream replays that are still processing. Try again in a minute, try a different video, or paste the transcript text directly using the \"Paste text\" tab."
        : (e.message || "This video has no readable captions. Paste its transcript to continue.");
    msgEl.className = "msg error";
    msgEl.style.display = "block";
  } finally {
    hideLoader();
  }
}

function extractDocxText(file){
  return new Promise((resolve, reject) => {
    if (typeof mammoth === "undefined") {
      reject(new Error("Word-document reader didn't load (network restriction)."));
      return;
    }

    const reader = new FileReader();
    reader.onload = function(){
      mammoth.extractRawText({ arrayBuffer: this.result })
        .then(result => resolve(result.value))
        .catch(reject);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

function extractPdfText(file){
  return new Promise((resolve, reject) => {
    if (typeof pdfjsLib === "undefined") {
      reject(new Error("PDF reader library didn't load (network restriction)."));
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

    const reader = new FileReader();
    reader.onload = async function(){
      try {
        const typedArray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        let text = "";

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          text += content.items.map(it => it.str).join(" ") + "\n";
        }

        resolve({ text, pages: pdf.numPages });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ---- Quiz configuration ----
function setCount(n){
  quizCount = n;
  document.querySelectorAll("#countPills .pill").forEach(b => b.classList.toggle("active", Number(b.dataset.val) === n));
  const customEl = document.getElementById("customCount");
  if (customEl) customEl.value = "";
}

function setCustomCount(val){
  let n = parseInt(val, 10);
  if (!n || n < 1) return;
  if (n > 60) {
    n = 60;
    document.getElementById("customCount").value = 60;
  }

  quizCount = n;
  document.querySelectorAll("#countPills .pill").forEach(b => b.classList.remove("active"));
}

function setDifficulty(d){
  quizDifficulty = d;
  document.querySelectorAll("#diffPills .pill").forEach(b => b.classList.toggle("active", b.dataset.val === d));
}

function toggleType(type, checked){
  const wrapIds = { mcq: "typeWrapMcq", true_false: "typeWrapTf", short_answer: "typeWrapShort" };

  if (checked) {
    if (!selectedTypes.includes(type)) selectedTypes.push(type);
  } else {
    selectedTypes = selectedTypes.filter(t => t !== type);
    if (selectedTypes.length === 0) {
      selectedTypes = [type];
      checked = true;
      document.querySelector(`#${wrapIds[type]} input`).checked = true;
    }
  }

  Object.entries(wrapIds).forEach(([t, id]) => {
    document.getElementById(id).classList.toggle("checked", selectedTypes.includes(t));
  });
}

const TYPE_LABEL = { mcq: "Multiple choice", true_false: "True / False", short_answer: "Short answer" };

function parseQuizQuestions(raw){
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("The quiz response was not valid. Please try again.");
  }

  const questions = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  const validQuestions = questions.filter(question => {
    if (!question || typeof question.question !== "string" || !question.question.trim()) return false;
    if (!["mcq", "true_false", "short_answer"].includes(question.type)) return false;
    if (question.type !== "short_answer" && (!Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(question.correctIndex))) return false;
    if (question.type === "short_answer" && typeof question.correctAnswer !== "string") return false;
    return true;
  });

  if (!validQuestions.length) {
    throw new Error("The quiz response did not contain usable questions. Please try again.");
  }
  return validQuestions.map(question => ({ type: question.type, topic: question.topic || "General", ...question }));
}

function buildLocalQuiz(text, count, types){
  const source = (text || "").replace(/\s+/g, " ").trim();
  const sentences = (source.match(/[^.!?]+[.!?]+/g) || [source])
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 25);
  if (!sentences.length) return [];

  const stems = [
    sentence => {
      const cue = sentence.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ") || "the main point";
      return `Which statement accurately reflects the document's description of "${cue}"?`;
    },
    sentence => {
      const cue = sentence.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 7).join(" ") || "this issue";
      return `According to the document, which option correctly explains "${cue}"?`;
    },
    sentence => {
      const cue = sentence.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ") || "the key finding";
      return `Which answer best matches the document's explanation of "${cue}"?`;
    }
  ];

  const questions = [];
  for (let index = 0; index < count; index++) {
    const sourceSentence = sentences[index % sentences.length];
    const type = types[index % types.length] || "mcq";
    const cleanTopic = sourceSentence.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || "Key point";
    const topic = cleanTopic.trim();

    if (type === "short_answer") {
      questions.push({
        type,
        topic,
        question: `Summarize the document's point about "${cleanTopic}" in one precise sentence.`,
        correctAnswer: sourceSentence,
        acceptableAnswers: [sourceSentence, sourceSentence.slice(0, Math.max(24, Math.floor(sourceSentence.length * 0.7)))],
        explanation: "This answer comes directly from the document and states the key fact in context."
      });
      continue;
    }

    if (type === "true_false") {
      questions.push({
        type,
        topic,
        question: `Is this statement supported by the document: "${sourceSentence.slice(0, 180)}"?`,
        options: ["True", "False"],
        correctIndex: 0,
        explanation: "The statement matches the document's factual content and is supported by the source text."
      });
      continue;
    }

    const options = [sourceSentence];
    for (let offset = 1; options.length < 4; offset++) {
      const distractor = sentences[(index + offset) % sentences.length];
      if (!options.includes(distractor) && distractor && distractor !== sourceSentence) options.push(distractor);
      if (offset > sentences.length + 2) break;
    }
    while (options.length < 4) {
      const fallback = `A related detail from the document that does not match the correct statement.`;
      if (!options.includes(fallback)) options.push(fallback);
      else options.push(`Another factual detail from the document that is not the correct answer.`);
    }

    questions.push({
      type: "mcq",
      topic,
      question: stems[index % stems.length](sourceSentence),
      options,
      correctIndex: 0,
      explanation: "The correct answer is the statement directly supported by the source text."
    });
  }
  return questions;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function listAvailableGeminiModels(){
  try {
    const resp = await fetch(`${API_BASE}/api/gemini-models`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch (error) {
    console.warn("Could not load Gemini model list:", error);
    return [];
  }
}

function geminiText(data){
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts)) throw new Error("The model returned no usable content.");
  const text = parts.map(part => typeof part.text === "string" ? part.text : "").join("\n").trim();
  if (!text) throw new Error("The model returned no usable content.");
  return text;
}

async function callGeminiOnce(model, prompt){
  const isSummaryRequest = prompt.includes('"summary"');
  const resp = await fetch(`${API_BASE}/api/gemini-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: isSummaryRequest ? 1024 : 8192,
        responseMimeType: "application/json"
      }
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let message = errText.slice(0, 300);

    try {
      const parsed = JSON.parse(errText);
      if (parsed && parsed.error && parsed.error.message) {
        message = parsed.error.message;
      }
    } catch (_) {}

    const err = new Error(`Gemini API error: ${message}`);
    err.status = resp.status;
    throw err;
  }

  return resp.json();
}

async function callGeminiWithFallback(prompt, msgEl){
  let lastErr;
  // Avoid an extra models-list request on every summary and quiz generation.
  const orderedModels = GEMINI_MODELS;

  for (let m = 0; m < orderedModels.length; m++) {
    const model = orderedModels[m];

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callGeminiOnce(model, prompt);
      } catch (e) {
        lastErr = e;
        const overloaded = e.status === 502 || e.status === 503 || e.status === 429;
        if (!overloaded) {
          if (msgEl) {
            msgEl.textContent = "Trying another AI model…";
            msgEl.className = "msg";
            msgEl.style.display = "block";
          }
          continue;
        }

        if (msgEl) {
          msgEl.textContent = `AI model busy — retrying quickly…`;
          msgEl.className = "msg";
          msgEl.style.display = "block";
        }

        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw lastErr;
}

async function generateQuiz(){
  const btn = document.getElementById("generateBtn");
  const msgEl = document.getElementById("configMsg");

  sessionName = (document.getElementById("sessionNameInput").value || "").trim();

  if (!hasValidGeminiKey()) {
    msgEl.textContent = "Gemini API key is missing or invalid. Add your real Google AI Studio API key in script.js and then retry.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    return;
  }

  btn.disabled = true;
  showLoaderSequence([
    "Reading document…",
    "Extracting key concepts…",
    "Writing questions…",
    "Finalising quiz…"
  ]);
  msgEl.style.display = "none";

  const diffInstruction = quizDifficulty === "mixed"
    ? "mix of easy/medium/hard"
    : quizDifficulty;

  const typeNames = selectedTypes.map(t => TYPE_LABEL[t]).join(", ");
  const typeInstruction = selectedTypes.length > 1
    ? `Mix types evenly: ${typeNames}.`
    : `All questions: ${typeNames}.`;

  const prompt = `Generate exactly ${quizCount} distinct quiz questions (${diffInstruction}) using ONLY the source text below. ${typeInstruction} Follow every constraint exactly.

Rules:
- Each question must have a specific, clear stem that asks about one concrete fact or idea from the source document.
- Do not use generic stems like "Which statement is supported by the document?" or "What is the correct answer?"
- Every option must be a complete factual statement directly supported by the document or a plausible but objectively incorrect statement based on the document.
- Do not use placeholders, brackets, ellipses, or vague summaries such as [mention key points], [insert fact], or "another detail from the document".
- Wrong answers must be realistic and clearly wrong based on the source text, not random or unrelated.
- Every question and answer must be grounded in the provided document only.
- Each question must include a short topic label (2-4 words) naming the concept it covers.
- Return valid JSON only, no markdown fences and no extra text.

Expected JSON shape:
{"questions":[
  {"type":"mcq","question":"A specific question about a real fact from the document","options":["A factual statement from the document","A plausible but incorrect statement","Another plausible but incorrect statement","A fourth factual statement that is not the correct answer"],"correctIndex":0,"explanation":"Why this answer is correct based on the source text.","topic":"2-4 word topic"},
  {"type":"true_false","question":"A concrete true/false statement from the document","options":["True","False"],"correctIndex":0,"explanation":"Why the answer is correct.","topic":"2-4 word topic"},
  {"type":"short_answer","question":"A precise question asking for a document-based fact","correctAnswer":"A direct sentence or fact from the source text","acceptableAnswers":["Equivalent wording from the text"],"explanation":"Why this response is correct.","topic":"2-4 word topic"}
]}

mcq = 4 options, true_false options must be ["True","False"], short_answer has no options or correctIndex.

Text:
"""${compactSource(extractedText, 12000)}"""`;

  try {
    const data = await callGeminiWithFallback(prompt, msgEl);
    let raw = geminiText(data);
    raw = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    quiz = parseQuizQuestions(raw);
    answers = new Array(quiz.length).fill(null);
    curQ = 0;
    isFocusQuiz = false;
    startQuiz();
  } catch (e) {
    console.error(e);
    quiz = buildLocalQuiz(extractedText, quizCount, selectedTypes);
    if (quiz.length) {
      answers = new Array(quiz.length).fill(null);
      curQ = 0;
      isFocusQuiz = false;
      msgEl.textContent = "AI is unavailable, so NEXUS created a document-based quiz locally.";
      msgEl.className = "msg ok";
      msgEl.style.display = "block";
      startQuiz();
      return;
    }
    msgEl.textContent = e.message || "We couldn't create the quiz right now. Please try again.";
    msgEl.className = "msg error";
    msgEl.style.display = "block";
    msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    btn.disabled = false;
    hideLoader();
  }
}

// ---- Quiz gameplay ----
function startQuiz(){
  document.getElementById("stepUpload").style.display = "none";
  document.getElementById("stepConfigure").style.display = "none";
  document.getElementById("stepQuiz").style.display = "block";

  quizStartTime = Date.now();
  questionTimes = new Array(quiz.length).fill(0);
  qEnterTime = Date.now();

  renderQNav();
  renderQuestion();
}

function markTimeSpent(){
  if (qEnterTime === null) return;
  questionTimes[curQ] += Date.now() - qEnterTime;
  qEnterTime = Date.now();
}

function renderQNav(){
  const nav = document.getElementById("qNav");
  nav.innerHTML = "";

  quiz.forEach((_, idx) => {
    const b = document.createElement("button");
    b.className = "q-num" + (idx === curQ ? " current" : "") + (answers[idx] !== null && answers[idx] !== "" ? " answered" : "");
    b.textContent = idx + 1;
    b.onclick = () => { markTimeSpent(); curQ = idx; renderQuestion(); renderQNav(); };
    nav.appendChild(b);
  });
}

function renderQuestion(){
  const q = quiz[curQ];
  document.getElementById("qProgress").textContent = `Question ${curQ + 1} of ${quiz.length}`;
  document.getElementById("qTypeTag").textContent = TYPE_LABEL[q.type] || "";
  document.getElementById("qText").textContent = q.question;

  const opts = document.getElementById("qOptions");
  opts.innerHTML = "";

  if (q.type === "short_answer") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type your answer…";
    input.value = answers[curQ] || "";
    input.oninput = () => { answers[curQ] = input.value; renderQNav(); };
    opts.appendChild(input);
  } else {
    (q.options || []).forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "q-opt" + (answers[curQ] === i ? " selected" : "");
      b.textContent = opt;
      b.onclick = () => { answers[curQ] = i; renderQuestion(); renderQNav(); };
      opts.appendChild(b);
    });
  }

  document.getElementById("prevBtn").style.visibility = curQ === 0 ? "hidden" : "visible";
  document.getElementById("nextBtn").textContent = curQ === quiz.length - 1 ? "See Your Results" : "Next";
}

function prevQ(){
  if (curQ > 0) {
    markTimeSpent();
    curQ--;
    renderQuestion();
    renderQNav();
  }
}

function nextQ(){
  markTimeSpent();

  if (curQ < quiz.length - 1) {
    curQ++;
    renderQuestion();
    renderQNav();
  } else {
    finishQuiz();
  }
}

function normalizeAnswer(s){
  return (s || "").toString().toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function isShortAnswerCorrect(q, given){
  const norm = normalizeAnswer(given);
  if (!norm) return false;

  const candidates = [q.correctAnswer, ...(q.acceptableAnswers || [])].filter(Boolean).map(normalizeAnswer);
  return candidates.some(c => c && (c === norm || norm.includes(c) || c.includes(norm)));
}

function isCorrect(q, given){
  if (q.type === "short_answer") return isShortAnswerCorrect(q, given);
  return given === q.correctIndex;
}

function correctAnswerLabel(q){
  if (q.type === "short_answer") return q.correctAnswer || "(not provided)";
  return (q.options || [])[q.correctIndex] || "(not provided)";
}

function yourAnswerLabel(q, given){
  if (given === null || given === undefined || given === "") return "(no answer)";
  if (q.type === "short_answer") return given;
  return (q.options || [])[given] || "(no answer)";
}

function formatDuration(ms){
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---- Results ----
// ---- Document mastery ----
// Tracks a personal-best score per document (by content fingerprint) in
// localStorage, so it works for guests too. Scores only ever go up here —
// framed as "protecting" a best, never as losing progress.
const MASTERY_KEY = "nexus_mastery_v1";

function loadMasteryMap(){
  try {
    return JSON.parse(localStorage.getItem(MASTERY_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveMasteryMap(map){
  try {
    localStorage.setItem(MASTERY_KEY, JSON.stringify(map));
  } catch (e) {
    // non-fatal — mastery tracking is a nice-to-have, not required for the quiz itself
  }
}

function docMasteryKey(text, name){
  return (name || "") + "::" + textCacheKey(text || "");
}

function updateMastery(docKey, scorePct, label){
  const map = loadMasteryMap();
  const existing = map[docKey] || { bestScore: 0, attempts: 0, sessionName: "" };

  const improved = scorePct > existing.bestScore;
  const updated = {
    bestScore: Math.max(existing.bestScore, scorePct),
    attempts: existing.attempts + 1,
    sessionName: label || existing.sessionName || "",
    lastUpdated: Date.now()
  };

  map[docKey] = updated;
  saveMasteryMap(map);
  return { ...updated, improved };
}

function renderMasteryBox(entry, docLabel){
  const box = document.getElementById("masteryBox");
  const labelEl = document.getElementById("masteryLabel");
  const pctEl = document.getElementById("masteryPct");
  const fillEl = document.getElementById("masteryBarFill");
  const subEl = document.getElementById("masterySub");

  const niceName = entry.sessionName ? entry.sessionName : docLabel;
  labelEl.textContent = entry.sessionName ? `"${niceName}"` : "Your progress on this document";
  pctEl.textContent = entry.bestScore + "%";
  fillEl.style.width = entry.bestScore + "%";

  if (entry.improved) {
    subEl.textContent = `New personal best — up from ${entry.attempts > 1 ? "your last attempt" : "0%"}. This best is saved on this device.`;
  } else {
    subEl.textContent = `You're holding a personal best of ${entry.bestScore}% on this document across ${entry.attempts} attempt${entry.attempts === 1 ? "" : "s"}.`;
  }

  box.style.display = "block";
}

// ---- Immediate next action after the score ----
function renderNextAction(pct, missedTopics){
  const el = document.getElementById("resultNextAction");

  let text;
  if (missedTopics.length > 0) {
    text = `Next: review "${missedTopics[0]}"${missedTopics.length > 1 ? ` and ${missedTopics.length - 1} other topic${missedTopics.length > 2 ? "s" : ""}` : ""} — or tap "Quiz me only on these topics" below.`;
  } else if (pct === 1) {
    text = "Next: try a harder difficulty on your next document to keep the challenge up.";
  } else {
    text = "Next: try another document to keep building your comprehension streak.";
  }

  el.textContent = text;
  el.classList.add("active");
}

async function finishQuiz(){
  let correct = 0;
  quiz.forEach((q, i) => { if (isCorrect(q, answers[i])) correct++; });

  const pct = correct / quiz.length;
  const scorePct = Math.round(pct * 100);
  const totalTimeMs = Date.now() - quizStartTime;
  const avgTimeMs = totalTimeMs / quiz.length;

  const resultsStep = document.getElementById("stepResults");
  resultsStep.classList.remove("is-visible");
  void resultsStep.offsetWidth;
  resultsStep.style.display = "block";
  resultsStep.classList.add("is-visible");

  document.getElementById("stepQuiz").style.display = "none";

  document.getElementById("resultPct").textContent = scorePct + "%";
  document.getElementById("resultFrac").textContent = `${correct} of ${quiz.length} correct`;

  let verdict, advice;
  if (pct >= 0.85) {
    verdict = "Excellent grasp of this material.";
    advice = "You clearly understood the content deeply — ready to move to something more advanced.";
  } else if (pct >= 0.6) {
    verdict = "Solid understanding, with some gaps.";
    advice = "Review the questions you missed — a second pass on those sections will lock it in.";
  } else {
    verdict = "This one needs another read-through.";
    advice = "Consider re-reading the document before moving on, focusing on the topics you missed.";
  }

  document.getElementById("resultLine").textContent = verdict;
  document.getElementById("resultDetail").textContent = advice;

  // Compute missed topics once — reused by the "next action" line, the mastery
  // box, and the "Topics to review" section below.
  const missedTopics = [];
  quiz.forEach((q, i) => {
    if (!isCorrect(q, answers[i])) {
      const topic = q.topic || "General";
      if (!missedTopics.includes(topic)) missedTopics.push(topic);
    }
  });
  missedTopicsForRequiz = missedTopics;

  renderNextAction(pct, missedTopics);

  // Document mastery —
  // only tracked once we actually have a document to key it against.
  if (extractedText) {
    const docKey = docMasteryKey(extractedText, currentFileName);
    const masteryEntry = updateMastery(docKey, scorePct, sessionName);
    renderMasteryBox(masteryEntry, currentFileName);
  }

  if (scorePct === 100) {
    showSuccessCelebration();
  }

  document.getElementById("paceTotal").textContent = formatDuration(totalTimeMs);
  document.getElementById("paceAvg").textContent = formatDuration(avgTimeMs);

  const badgeRow = document.getElementById("badgeRow");
  badgeRow.innerHTML = "";
  const badges = [];

  if (pct === 1) badges.push({ text: "🏆 Perfect score", cls: "" });
  else if (pct >= 0.9) badges.push({ text: "⭐ High scorer", cls: "" });

  if (bestScorePct === null || scorePct > bestScorePct) {
    badges.push({ text: "🔥 Personal best!", cls: "best" });
  }

  badges.forEach(b => {
    const el = document.createElement("span");
    el.className = "badge" + (b.cls ? " " + b.cls : "");
    el.textContent = b.text;
    badgeRow.appendChild(el);
  });

  if (bestScorePct === null || scorePct > bestScorePct) bestScorePct = scorePct;

  const bqList = document.getElementById("bqList");
  bqList.innerHTML = "";
  quiz.forEach((q, i) => {
    const ok = isCorrect(q, answers[i]);
    const item = document.createElement("div");
    item.className = "bq-item " + (ok ? "correct" : "wrong");
    item.innerHTML = `
      <div class="bq-q"><span class="bq-mark">${ok ? "✓" : "✗"}</span><span>${i + 1}. ${q.question}</span></div>
      <div class="bq-your">Your answer: <b>${yourAnswerLabel(q, answers[i])}</b></div>
      <div class="bq-correct">Correct answer: <b>${correctAnswerLabel(q)}</b></div>
      ${!ok ? `<div class="bq-explain">${q.explanation || ""}</div>` : ""}
    `;
    bqList.appendChild(item);
  });

  document.getElementById("revealBtn").textContent = "🎮 Reveal all answers";
  document.getElementById("revealBtn").disabled = false;

  renderReviewTopics();

  await saveAttempt(correct, quiz.length, scorePct);
  loadStats();
  // Show recent uploads only after completing a quiz
  renderRecentUploads();
}

// ---- Weak-area highlights + focus re-quiz ----
let missedTopicsForRequiz = [];

function renderReviewTopics(){
  const wrap = document.getElementById("reviewTopics");
  const list = document.getElementById("reviewTopicList");
  const btn = document.getElementById("requizBtn");

  const missedTopics = missedTopicsForRequiz;

  if (missedTopics.length === 0 || (isFocusQuiz && quiz.length <= 2)) {
    // Nothing missed, or this is already a small focus re-quiz — no need to offer it again.
    wrap.style.display = "none";
    return;
  }

  list.innerHTML = "";
  missedTopics.forEach(topic => {
    const chip = document.createElement("span");
    chip.className = "review-topic-chip";
    chip.textContent = topic;
    list.appendChild(chip);
  });

  btn.disabled = false;
  btn.textContent = "Quiz me only on these topics";
  wrap.style.display = "block";
}

async function startFocusRequiz(){
  const btn = document.getElementById("requizBtn");
  if (!missedTopicsForRequiz.length || !extractedText) return;

  if (!hasValidGeminiKey()) {
    btn.textContent = "Overview unavailable — API key missing.";
    return;
  }

  btn.disabled = true;
  showLoaderSequence([
    "Reading document…",
    "Extracting key concepts…",
    "Writing questions…",
    "Finalising quiz…"
  ]);

  const focusCount = Math.min(quiz.length, Math.max(3, missedTopicsForRequiz.length * 2));
  const topicsList = missedTopicsForRequiz.join(", ");

  const prompt = `Generate exactly ${focusCount} new quiz questions from the source text only, focused ONLY on these missed topics: ${topicsList}.
Do not repeat the exact same questions as before — write fresh questions that still test the same topics.
Do not use outside knowledge or invent facts; every answer and explanation must be supported by the source text.

Rules:
- Each question must have a specific, concrete stem tied to one missed topic.
- Avoid generic wording and do not use placeholders or bracketed text like [missing fact].
- Every option must be a factual statement directly drawn from or strictly relevant to the source document.
- Distactors must be plausible but objectively incorrect based on the document text.
- Return valid JSON only with this structure:
{"questions":[{"type":"mcq","question":"Specific question about a concrete fact","options":["Correct factual statement","Plausible incorrect statement","Plausible incorrect statement","Plausible incorrect statement"],"correctIndex":0,"explanation":"Why the correct answer is right based on the document.","topic":"${topicsList.split(",")[0].trim()}"}]}

mcq=4 options only for this focused re-quiz.

Text:
"""${compactSource(extractedText, 12000)}"""`;

  try {
    const data = await callGeminiWithFallback(prompt, null);
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error("The model returned no usable content.");
    }

    let raw = data.candidates[0].content.parts[0].text.trim();
    raw = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    quiz = parseQuizQuestions(raw);
    answers = new Array(quiz.length).fill(null);
    curQ = 0;
    isFocusQuiz = true;
    startQuiz();
  } catch (e) {
    console.error("Focus re-quiz failed:", e);
    btn.textContent = "Couldn't build a focus quiz — try again";
    btn.disabled = false;
  } finally {
    hideLoader();
  }
}

function revealAll(){
  document.querySelectorAll("#bqList .bq-item").forEach((el, i) => {
    setTimeout(() => el.classList.add("revealed"), i * 90);
  });

  document.getElementById("revealBtn").textContent = "✓ Answers revealed";
  document.getElementById("revealBtn").disabled = true;
}

function resetToUpload(){
  extractedText = "";
  currentFileName = "";
  quiz = [];
  answers = [];
  curQ = 0;
  sessionName = "";

  document.getElementById("fileDropLabel").textContent = "Tap to choose a file — .txt, .pdf, or .docx";
  document.getElementById("fileInput").value = "";
  document.getElementById("filePreview").classList.remove("active");
  document.getElementById("pasteText").value = "";
  document.getElementById("urlInput").value = "";
  document.getElementById("youtubeInput").value = "";
  document.getElementById("ytPreview").classList.remove("active");
  document.getElementById("sessionNameInput").value = "";

  document.getElementById("stepResults").style.display = "none";
  document.getElementById("stepSummary").style.display = "none";
  document.getElementById("stepConfigure").style.display = "none";
  document.getElementById("stepUpload").style.display = "block";

  isFocusQuiz = false;
  document.getElementById("reviewTopics").style.display = "none";
  document.getElementById("resultNextAction").classList.remove("active");
  document.getElementById("masteryBox").style.display = "none";

  switchInputTab("file");
}

function triggerTone(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const audioCtx = new AudioCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 520;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.18);
  setTimeout(() => audioCtx.close(), 220);
}

function showSuccessCelebration(){
  const overlay = document.getElementById("successCelebration");
  if (!overlay) return;

  if (confettiAnimationFrame) cancelAnimationFrame(confettiAnimationFrame);
  if (confettiResizeHandler) window.removeEventListener("resize", confettiResizeHandler);

  const modal = overlay.querySelector(".success-modal");
  const badge = overlay.querySelector(".success-badge");
  const burst = overlay.querySelector(".spark-burst");

  overlay.classList.remove("active");
  modal.classList.remove("replay");
  badge.classList.remove("replay");
  burst.classList.remove("replay");
  void overlay.offsetWidth;

  overlay.classList.add("active");
  modal.classList.add("replay");
  badge.classList.add("replay");
  burst.classList.add("replay");
  overlay.setAttribute("aria-hidden", "false");
  triggerTone();

  const canvas = document.getElementById("confettiCanvas");
  const ctx = canvas.getContext("2d");
  confettiPieces = [];
  const colors = ["#E8B33D", "#7C9A78", "#D96B4C", "#9ec3ff", "#f080c8", "#6ae7d6"];

  function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();
  confettiResizeHandler = resizeCanvas;
  window.addEventListener("resize", confettiResizeHandler);

  for (let i = 0; i < 160; i++) {
    confettiPieces.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 40,
      r: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 10,
      vy: -8 - Math.random() * 12,
      gravity: 0.09 + Math.random() * 0.18,
      alpha: 1,
      spin: (Math.random() - 0.5) * 0.25
    });
  }

  function drawConfetti(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiPieces.forEach(piece => {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.spin);
      ctx.globalAlpha = piece.alpha;
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.r / 2, -piece.r / 2, piece.r, piece.r * 2.2);
      ctx.restore();

      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += piece.gravity;
      piece.spin += 0.05;
      piece.alpha -= 0.0038;
    });

    if (confettiPieces.some(piece => piece.alpha > 0)) {
      confettiAnimationFrame = requestAnimationFrame(drawConfetti);
    } else {
      confettiAnimationFrame = null;
    }
  }

  confettiAnimationFrame = requestAnimationFrame(drawConfetti);
}

function dismissSuccessCelebration(){
  const overlay = document.getElementById("successCelebration");
  if (!overlay) return;
  if (confettiAnimationFrame) cancelAnimationFrame(confettiAnimationFrame);
  confettiAnimationFrame = null;
  if (confettiResizeHandler) {
    window.removeEventListener("resize", confettiResizeHandler);
    confettiResizeHandler = null;
  }

  const modal = overlay.querySelector(".success-modal");
  const badge = overlay.querySelector(".success-badge");
  const burst = overlay.querySelector(".spark-burst");

  modal.classList.remove("replay");
  badge.classList.remove("replay");
  burst.classList.remove("replay");
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}

// ---- Supabase save/load activity ----
async function saveAttempt(correct, total, scorePct){
  if (isGuestMode) return;
  if (!sb || !currentUserId) return;

  try {
    await sb.from("quiz_attempts").insert({
      user_id: currentUserId,
      document_name: currentFileName,
      total_questions: total,
      correct_answers: correct,
      difficulty: quizDifficulty,
      score: scorePct
    });
  } catch (e) {
    console.error("Couldn't save attempt:", e);
  }
}

async function loadStats(){
  if (isGuestMode) {
    document.getElementById("statActiveDays").textContent = "0";
    document.getElementById("statAttempts").textContent = "0";
    document.getElementById("statBest").textContent = "–";
    renderHistoryChart([]);
    return;
  }

  if (!sb || !currentUserId) return;

  try {
    const { data, error } = await sb.from("quiz_attempts").select("*").eq("user_id", currentUserId);
    if (error) throw error;

    if (!data || data.length === 0) {
      document.getElementById("statActiveDays").textContent = "0";
      document.getElementById("statAttempts").textContent = "0";
      document.getElementById("statBest").textContent = "–";
      renderHistoryChart([]);
      return;
    }

    const days = new Set(data.map(r => new Date(r.created_at).toDateString()));
    const best = Math.max(...data.map(r => r.score));
    bestScorePct = best;

    document.getElementById("statActiveDays").textContent = days.size;
    document.getElementById("statAttempts").textContent = data.length;
    document.getElementById("statBest").textContent = best + "%";

    const sorted = data.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-10);
    renderHistoryChart(sorted);
  } catch (e) {
    console.error("Stats unavailable:", e);
  }
}

function renderHistoryChart(rows){
  const canvas = document.getElementById("historyChart");
  const emptyEl = document.getElementById("chartEmpty");

  if (historyChart) {
    historyChart.destroy();
    historyChart = null;
  }

  if (!rows || rows.length === 0) {
    canvas.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  canvas.style.display = "block";
  emptyEl.style.display = "none";

  if (typeof Chart === "undefined") return;

  const labels = rows.map(r => new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  const scores = rows.map(r => r.score);

  const rootStyles = getComputedStyle(document.documentElement);
  const sage = rootStyles.getPropertyValue("--sage").trim() || "#7C9A78";
  const paper = rootStyles.getPropertyValue("--paper").trim() || "#F3EFE4";

  historyChart = new Chart(canvas, {
    type: rows.length === 1 ? "bar" : "line",
    data: {
      labels,
      datasets: [{
        label: "Score %",
        data: scores,
        borderColor: sage,
        backgroundColor: rows.length === 1 ? sage : "rgba(124,154,120,0.18)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: sage
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, ticks: { color: paper, stepSize: 25 }, grid: { color: "rgba(243,239,228,0.08)" } },
        x: { ticks: { color: paper }, grid: { display: false } }
      }
    }
  });
}

// ---- App init ----
async function initApp(){

  if (!sb) {
    showMsg("Login couldn't connect (likely a network block in this preview).", "error");
    showPage("landing");
    return;
  }

  // Detect if we're returning from a Google OAuth redirect (URL has access_token hash)
  const isOAuthReturn = window.location.hash.includes("access_token") ||
                        window.location.hash.includes("type=recovery") ||
                        new URLSearchParams(window.location.search).has("code");

  const { data } = await sb.auth.getSession();
  const hasSession = !!(data && data.session);

  // If user is already logged in or just came back from Google, skip intro animation
  const intro = document.getElementById("introOverlay");
  if (isOAuthReturn || hasSession) {
    if (intro) { intro.classList.add("hidden"); intro.style.display = "none"; }
  } else {
    // Normal load: play intro animation, then show landing
    playIntroAudio();
    if (intro) {
      setTimeout(() => {
        intro.classList.add("hidden");
        setTimeout(() => { intro.style.display = "none"; }, 400);
      }, 1300);
    }
  }

  if (hasSession) {
    currentUserId = data.session.user.id;
    document.getElementById("whoami").textContent = data.session.user.email;
    showPage("dashboard");
    loadStats();
  } else {
    showPage("landing");
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (session && event === "SIGNED_IN" && !currentUserId) {
      // Dismiss any lingering intro overlay immediately
      const intro = document.getElementById("introOverlay");
      if (intro) { intro.classList.add("hidden"); intro.style.display = "none"; }

      currentUserId = session.user.id;
      document.getElementById("whoami").textContent = session.user.email;
      showPage("dashboard");
      loadStats();
    }
    if (event === "SIGNED_OUT") {
      currentUserId = null;
      showPage("landing");
    }
  });
}

function playIntroAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);
    setTimeout(() => audioCtx.close(), 800);
  } catch (err) {
    console.log("Intro audio skipped:", err);
  }
}

initApp();