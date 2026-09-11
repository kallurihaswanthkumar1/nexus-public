const http = require("http");
const fs = require("fs");
const path = require("path");

loadLocalEnv();
const port = Number(process.env.PORT || 8787);
const transcriptCache = new Map();
const geminiResponseCache = new Map();
const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function validVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(value || "");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<");
}

function extractJsonArrayAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = source.indexOf("[", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "[") depth++;
    else if (character === "]") {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function extractScriptObjectAfter(source, varName) {
  const marker = `var ${varName} = `;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = markerIndex + marker.length;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function stripVttNoise(value) {
  return value
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^WEBVTT/i.test(trimmed)) return false;
      if (/^\d+$/.test(trimmed)) return false; // bare cue index
      if (/-->/.test(trimmed)) return false; // timing line
      if (/^(Kind|Language):/i.test(trimmed)) return false;
      return true;
    })
    .join(" ");
}

function cleanTranscriptText(value) {
  return decodeHtml(String(value || ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\uFFFD/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!:;])/g, "$1")
    .replace(/([,.?!:;])(?=\S)/g, "$1 ")
    .trim();
}

function parseJsonTimedtext(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed[0] !== "{") return "";

  try {
    const data = JSON.parse(trimmed);
    const segments = [];

    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (Array.isArray(node.events)) {
        for (const event of node.events) {
          if (Array.isArray(event.segs)) {
            for (const seg of event.segs) {
              if (typeof seg.utf8 === "string" && seg.utf8.trim()) {
                segments.push(seg.utf8.trim());
              }
            }
          }
        }
      }
      if (Array.isArray(node.actions)) {
        for (const action of node.actions) visit(action);
      }
      if (typeof node.utf8 === "string" && node.utf8.trim()) {
        segments.push(node.utf8.trim());
      }
      for (const child of Object.values(node)) visit(child);
    };

    visit(data);
    return cleanTranscriptText(segments.join(" "));
  } catch (error) {
    return "";
  }
}

function parseXmlTimedtext(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || !/<\s*text\b/i.test(trimmed)) return "";

  const textMatches = [...trimmed.matchAll(/<\s*text\b[^>]*>([\s\S]*?)<\/\s*text\s*>/gi)];
  if (!textMatches.length) {
    return cleanTranscriptText(trimmed.replace(/<[^>]*>/g, " "));
  }

  const extracted = textMatches
    .map(match => match[1] || "")
    .map(chunk => cleanTranscriptText(chunk))
    .filter(Boolean)
    .join(" ");

  return cleanTranscriptText(extracted);
}

function captionTextFromResponse(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const jsonText = parseJsonTimedtext(trimmed);
  if (jsonText) return jsonText;

  const xmlText = parseXmlTimedtext(trimmed);
  if (xmlText) return xmlText;

  if (/^WEBVTT/i.test(trimmed)) {
    return cleanTranscriptText(stripVttNoise(trimmed).replace(/<[^>]*>/g, " "));
  }

  return cleanTranscriptText(trimmed);
}

const CAPTION_FORMATS = [
  "&fmt=srv3",
  "&fmt=vtt",
  "&fmt=json3",
  "&fmt=ttml",
  "&type=track&fmt=srv3",
  "&type=track&fmt=vtt",
  "&type=track&fmt=json3"
];

const YOUTUBE_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.youtube.com/"
};

async function fetchYouTubeWithHeaders(url, extraHeaders = {}) {
  return fetch(url, {
    headers: {
      ...YOUTUBE_REQUEST_HEADERS,
      ...extraHeaders
    },
    signal: AbortSignal.timeout(30000)
  });
}

function normalizeTrackUrl(url) {
  return decodeHtml(String(url || "")).replace(/\\u0026/g, "&").replace(/&amp;/g, "&").trim();
}

function extractTrackCandidatesFromPage(page) {
  const candidates = [];
  const addCandidate = (baseUrl, extra = {}) => {
    const normalized = normalizeTrackUrl(baseUrl);
    if (!normalized || !normalized.includes("timedtext")) return;
    if (!candidates.some(item => item.baseUrl === normalized)) {
      candidates.push({ baseUrl: normalized, ...extra });
    }
  };

  const pagePatterns = [
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"audioTracks"|,\s*"translationLanguages"|,\s*"defaultAudioTrack"|\}\s*[,}])/, 
    /"playerCaptionsTracklistRenderer"\s*:\s*\{\s*"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"audioTracks"|,\s*"translationLanguages"|\}\s*[,}])/, 
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*\}/
  ];

  for (const pattern of pagePatterns) {
    const match = page.match(pattern);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        for (const track of parsed) {
          if (track && track.baseUrl) addCandidate(track.baseUrl, track);
        }
      }
    } catch (error) {
      // keep testing other extraction patterns
    }
  }

  const captionJson = extractJsonArrayAfter(page, '"captionTracks":');
  if (captionJson) {
    try {
      const parsed = JSON.parse(captionJson);
      if (Array.isArray(parsed)) {
        for (const track of parsed) {
          if (track && track.baseUrl) addCandidate(track.baseUrl, track);
        }
      }
    } catch (error) {
      // continue
    }
  }

  const playerScript = extractScriptObjectAfter(page, "ytInitialPlayerResponse");
  if (playerScript) {
    try {
      const player = JSON.parse(playerScript);
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      for (const track of tracks) {
        if (track && track.baseUrl) addCandidate(track.baseUrl, track);
      }
    } catch (error) {
      // continue
    }
  }

  for (const match of page.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/api\/timedtext[^"'\s>]+/gi)) {
    addCandidate(match[0]);
  }

  return candidates;
}

async function fetchCaptionTrackText(track, pageCookies = "") {
  const baseCandidates = [];
  const baseUrl = normalizeTrackUrl(track?.baseUrl || "");
  if (baseUrl) baseCandidates.push(baseUrl);

  for (const fmtParam of CAPTION_FORMATS) {
    if (baseUrl && !baseUrl.includes("fmt=")) {
      baseCandidates.push(`${baseUrl}${fmtParam}`);
    }
  }

  const seen = new Set();
  for (const url of baseCandidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);

    let captionResponse;
    let attempts = 0;
    while (attempts < 3) {
      attempts += 1;
      try {
        captionResponse = await fetchYouTubeWithHeaders(url, {
          Accept: "*/*",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": "2.20260907.06.00",
          Cookie: pageCookies
        });
        if (captionResponse && (captionResponse.status === 429 || captionResponse.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, attempts * 500));
          continue;
        }
        break;
      } catch (error) {
        if (attempts >= 3) captionResponse = null;
        else await new Promise(resolve => setTimeout(resolve, attempts * 500));
      }
    }

    if (!captionResponse || !captionResponse.ok || captionResponse.status === 204) continue;

    try {
      const captionBody = await captionResponse.text();
      const text = captionTextFromResponse(captionBody);
      if (text && text.length >= 30) return text;
      if (captionBody && /"events"|<text|WEBVTT/i.test(captionBody)) {
        const fallbackText = captionTextFromResponse(captionBody);
        if (fallbackText && fallbackText.length >= 30) return fallbackText;
      }
    } catch (error) {
      continue;
    }
  }

  return "";
}

async function loadYoutubePage(videoId) {
  const pageResponse = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers: YOUTUBE_REQUEST_HEADERS,
    signal: AbortSignal.timeout(30000)
  });
  if (!pageResponse.ok) throw new Error("YouTube video page could not be loaded.");
  return {
    cookies: pageResponse.headers.get("set-cookie") || "",
    text: await pageResponse.text()
  };
}

async function fetchPlayerAccessToken(videoId) {
  const page = await loadYoutubePage(videoId);
  const apiKeyMatch = page.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersionMatch = page.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);
  if (!apiKeyMatch?.[1]) return null;

  const clientVersion = clientVersionMatch?.[1] || "2.20260907.06.00";
  const payload = {
    context: {
      client: {
        hl: "en",
        clientName: "WEB",
        clientVersion
      }
    },
    videoId
  };

  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKeyMatch[1])}`, {
    method: "POST",
    headers: {
      ...YOUTUBE_REQUEST_HEADERS,
      "Content-Type": "application/json",
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": clientVersion
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function fetchYoutubeTranscript(videoId) {
  const pageAttempts = [0, 1, 2];
  let pageText = "";
  let pageCookies = "";
  let trackCandidates = [];

  for (const attempt of pageAttempts) {
    try {
      const pageData = await loadYoutubePage(videoId);
      pageText = pageData.text;
      pageCookies = pageData.cookies;
      trackCandidates = extractTrackCandidatesFromPage(pageText);
      if (trackCandidates.length) break;
    } catch (error) {
      if (attempt === pageAttempts[pageAttempts.length - 1]) throw error;
    }
  }

  if (!trackCandidates.length) {
    try {
      const playerData = await fetchPlayerAccessToken(videoId);
      const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      for (const track of tracks) {
        if (track?.baseUrl) trackCandidates.push({ ...track, baseUrl: normalizeTrackUrl(track.baseUrl) });
      }
    } catch (error) {
      // fall through to generic timedtext URL below
    }
  }

  if (!trackCandidates.length) {
    const timedtextFallback = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en&fmt=json3`;
    trackCandidates = [{ baseUrl: timedtextFallback, languageCode: "en", kind: "asr" }];
  }

  const preferredTracks = [
    ...trackCandidates.filter(item => item.languageCode === "en" && item.kind === "asr"),
    ...trackCandidates.filter(item => item.languageCode === "en"),
    ...trackCandidates.filter(item => item.kind === "asr"),
    ...trackCandidates
  ];

  let lastError = null;
  for (const track of preferredTracks) {
    if (!track.baseUrl) continue;

    const textCandidates = [
      async () => fetchCaptionTrackText(track, pageCookies),
      async () => {
        if (!/fmt=/.test(track.baseUrl)) return "";
        return fetchCaptionTrackText({ baseUrl: track.baseUrl.replace(/&fmt=[^&]+/g, "") }, pageCookies);
      },
      async () => {
        const direct = normalizeTrackUrl(track.baseUrl);
        if (!direct.includes("timedtext")) return "";
        const directResponse = await fetchYouTubeWithHeaders(direct, {
          Accept: "*/*",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": "2.20260907.06.00",
          Cookie: pageCookies
        });
        if (!directResponse || !directResponse.ok || directResponse.status === 204) return "";
        return captionTextFromResponse(await directResponse.text());
      }
    ];

    for (const getText of textCandidates) {
      try {
        const text = await getText();
        const cleaned = cleanTranscriptText(text);
        if (cleaned.length >= 30) return cleaned;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw new Error(`YouTube transcript retrieval failed after all fallback attempts: ${lastError.message}`);
  }

  throw new Error("YouTube exposed caption tracks, but returned no transcript text. This video needs captions or a supplied transcript.");
}

function serveFile(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(__dirname, path.normalize(requested).replace(/^[/\\]+/, ""));
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 1000000) request.destroy(new Error("Request too large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

async function geminiRequest(endpoint, options = {}) {
  if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${encodeURIComponent(geminiApiKey)}`, {
    ...options,
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://localhost:${port}`);
  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, service: "nexus-server" });
    return;
  }

  if (url.pathname === "/api/youtube-transcript" && request.method === "GET") {
    const id = url.searchParams.get("id");
    if (!validVideoId(id)) {
      sendJson(response, 400, { error: "A valid YouTube video id is required." });
      return;
    }

    if (transcriptCache.has(id)) {
      sendJson(response, 200, { text: transcriptCache.get(id), cached: true });
      return;
    }

    try {
      const text = await fetchYoutubeTranscript(id);
      transcriptCache.set(id, text);
      sendJson(response, 200, { text });
    } catch (error) {
      sendJson(response, 502, { error: error.message || "YouTube transcript retrieval failed." });
    }
    return;
  }

  if (url.pathname === "/api/gemini-models" && request.method === "GET") {
    try {
      const data = await geminiRequest("models");
      const models = (data.models || [])
        .filter(model => (model.supportedGenerationMethods || []).includes("generateContent"))
        .map(model => (model.name || "").replace(/^models\//, ""));
      sendJson(response, 200, { models });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/gemini-generate" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const model = String(body.model || "gemini-2.5-flash").replace(/^models\//, "");
      const prompt = String(body.prompt || "");
      if (!prompt || prompt.length > 100000) throw new Error("A valid prompt is required.");
      const cacheKey = `${model}:${prompt}`;
      if (geminiResponseCache.has(cacheKey)) {
        sendJson(response, 200, geminiResponseCache.get(cacheKey));
        return;
      }
      const data = await geminiRequest(`models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: body.generationConfig || { temperature: 0.15, maxOutputTokens: 4096, responseMimeType: "application/json" }
        })
      });
      geminiResponseCache.set(cacheKey, data);
      if (geminiResponseCache.size > 50) geminiResponseCache.delete(geminiResponseCache.keys().next().value);
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, error.status || 502, { error: error.message });
    }
    return;
  }

  if (request.method === "GET") {
    serveFile(response, url.pathname);
    return;
  }

  if (url.pathname !== "/api/youtube-transcript") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }
});

function openInBrowser(url) {
  // Best-effort only — if this fails for any reason (headless machine,
  // unusual OS, sandboxed environment) the server keeps running normally
  // and the user can just open the URL manually.
  try {
    const { exec } = require("child_process");
    const platform = process.platform;
    const command =
      platform === "win32" ? `start "" "${url}"` :
      platform === "darwin" ? `open "${url}"` :
      `xdg-open "${url}"`;
    exec(command, () => {});
  } catch (error) {
    // ignore — not critical to the server actually working
  }
}

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`NEXUS is running: ${url}`);
  console.log("Keep this window open while using NEXUS. Close it to stop the server.");
  if (!process.env.NEXUS_NO_AUTO_OPEN) {
    openInBrowser(url);
  }
});
