const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs-extra");
const path = require("path");
const url = require("url");
const logger = require("./utils/log");

const PORT = process.env.PORT || 5000;
const WEB_DIR = path.join(__dirname, "web");

// ── Generate GOMO PWA icons on startup ───────────────────────────────────────
try {
  const { generateAllIcons } = require("./utils/generateIcons");
  generateAllIcons();
} catch (e) {
  console.warn("[GOMO Icons] Skipped:", e.message?.slice(0, 60));
}

// ── Detect serverless platforms (can only serve web, not run bot) ─────────────
const IS_VERCEL   = !!process.env.VERCEL;
const IS_NETLIFY  = !!process.env.NETLIFY;
const IS_SERVERLESS = IS_VERCEL || IS_NETLIFY;

// ── SoundCloud client_id — initialized once, shared across all requests ───────
let scReady = false;
async function ensureSC() {
  if (scReady) return;
  try {
    const play = require("play-dl");
    const id = await play.getFreeClientID();
    await play.setToken({ soundcloud: { client_id: id } });
    scReady = true;
    console.log("[SC] SoundCloud client_id initialized:", id.slice(0, 8) + "...");
  } catch (e) {
    console.error("[SC] Failed to get client_id:", e.message);
  }
}
// Pre-initialize on startup so first search is fast
ensureSC();

// ── APPSTATE from environment variable (for cloud hosting) ───────────────────
// On Render/Railway/etc set env var APPSTATE = <contents of appstate.json>
function writeAppstateFromEnv() {
  const raw = process.env.APPSTATE;
  if (!raw) return;
  const dest = path.join(__dirname, "appstate.json");
  if (fs.existsSync(dest)) return; // already present, don't overwrite
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("APPSTATE must be a JSON array");
    fs.writeFileSync(dest, JSON.stringify(parsed, null, 2));
    console.log("[APPSTATE] Written from environment variable ✅");
  } catch (e) {
    console.error("[APPSTATE] Invalid APPSTATE env var:", e.message);
  }
}
writeAppstateFromEnv();

// ── Web request handler ───────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // ── GET / → GOMO music app UI ─────────────────────────────────────────────
  if (pathname === "/" || pathname === "/index.html") {
    try {
      const html = fs.readFileSync(path.join(WEB_DIR, "index.html"), "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      return res.end(html);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
  }

  // ── GET /manifest.json → PWA manifest ─────────────────────────────────────
  if (pathname === "/manifest.json") {
    try {
      const data = fs.readFileSync(path.join(WEB_DIR, "manifest.json"), "utf8");
      res.writeHead(200, { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" });
      return res.end(data);
    } catch {
      res.writeHead(404); return res.end("Not found");
    }
  }

  // ── GET /sw.js → Service Worker ───────────────────────────────────────────
  if (pathname === "/sw.js") {
    try {
      const data = fs.readFileSync(path.join(WEB_DIR, "sw.js"), "utf8");
      res.writeHead(200, { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" });
      return res.end(data);
    } catch {
      res.writeHead(404); return res.end("Not found");
    }
  }

  // ── GET /icon-*.png → PWA icons ───────────────────────────────────────────
  const iconMatch = pathname.match(/^\/icon-(\d+)\.png$/);
  if (iconMatch) {
    const iconPath = path.join(WEB_DIR, `icon-${iconMatch[1]}.png`);
    if (fs.existsSync(iconPath)) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" });
      return fs.createReadStream(iconPath).pipe(res);
    }
    res.writeHead(404); return res.end("Not found");
  }

  // ── GET /api/search?q=... → SoundCloud search ──────────────────────────────
  if (pathname === "/api/search") {
    const q = query.q;
    if (!q) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing query parameter q" }));
    }
    try {
      await ensureSC();
      const play = require("play-dl");
      const results = await play.search(q, {
        source: { soundcloud: "tracks" },
        limit: 10,
      });
      const mapped = results.map((r) => ({
        title:     r.name || r.title || "Unknown",
        url:       r.url,
        duration:  r.durationInSec || 0,
        thumbnail: r.thumbnails?.[0]?.url || r.thumbnail?.url || r.thumbnails?.[0] || "",
        artist:    r.user?.name || r.publisher?.name || r.channel?.name || "Unknown Artist",
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ results: mapped }));
    } catch (e) {
      console.error("[Search API]", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── GET /api/download?url=...&title=... → stream MP3 ──────────────────────
  if (pathname === "/api/download") {
    const trackUrl = query.url;
    const title = (query.title || "audio").replace(/[^\w\s\-]/g, "").trim();
    if (!trackUrl) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("Missing url");
    }
    try {
      await ensureSC();
      const play = require("play-dl");
      const info = await play.stream(trackUrl);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${title}.mp3"`,
        "Transfer-Encoding": "chunked",
      });
      info.stream.pipe(res);
      req.on("close", () => { try { info.stream.destroy(); } catch {} });
    } catch (e) {
      console.error("[Download API]", e.message);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
    return;
  }

  // ── GET /health → status JSON ──────────────────────────────────────────────
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status:   "online",
      bot:      "Mirai Bot V3",
      version:  "3.0.0",
      team:     "TEAM STARTCOPE BETA",
      platform: IS_SERVERLESS ? (IS_VERCEL ? "vercel" : "netlify") : "persistent",
      botMode:  IS_SERVERLESS ? "web-only" : "bot+web",
      uptime:   process.uptime(),
    }));
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger(`Port ${PORT} already in use`, "[ SERVER ]");
  } else {
    logger(`Server error: ${err.message}`, "[ SERVER ]");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  logger(`Web UI running on port ${PORT}`, "[ SERVER ]");
  if (IS_SERVERLESS) {
    logger(`Serverless mode — web UI only (no bot)`, "[ SERVER ]");
  }
});

// ── Bot process — only on persistent platforms (not Vercel/Netlify) ──────────
function startBot(message) {
  if (message) logger(message, "[ Starting ]");
  const child = spawn(
    "node",
    ["--trace-warnings", "--async-stack-traces", "mirai.js"],
    { cwd: __dirname, stdio: "inherit", shell: true }
  );
  child.on("close", (codeExit) => {
    if (codeExit !== 0 || (global.countRestart && global.countRestart < 5)) {
      global.countRestart = (global.countRestart || 0) + 1;
      startBot("Restarting...");
    }
  });
  child.on("error", (error) => {
    logger("An error occurred: " + JSON.stringify(error), "[ Starting ]");
  });
}

if (!IS_SERVERLESS) {
  startBot();
} else {
  logger("Serverless platform detected — bot messaging disabled. Web UI active.", "[ INFO ]");
}
