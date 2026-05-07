# Mirai Bot V3 Unofficial

A Facebook Messenger chatbot built with Node.js that listens for messages and responds to commands and events via the Facebook Chat API.

## Run & Operate
- **Start**: `node index.js`
- **npm script**: `npm start`
- **Required credentials**: `appstate.json` (Facebook app state array) OR `cookie.txt` (Facebook cookies) must be present in the project root before the bot can log in.

## Stack
- Runtime: Node.js 20
- Facebook API: `stfca` + `@dongdev/fca-unofficial`
- Database: SQLite via Sequelize (file: `Fca_Database/database.sqlite` / `includes/data.sqlite`)
- Image processing: `jimp` (pure JS — canvas npm unavailable due to missing libuuid.so.1)
- AI image generation: Pollinations AI (`https://image.pollinations.ai`) — free, no key
- Music: `msedge-tts` (Microsoft TTS Tagalog voices), `play-dl` (SoundCloud streaming), `fluent-ffmpeg`
- Scheduling: `node-cron`

## Where things live
- `index.js` — entry point, auto-restarts `mirai.js` on crash
- `mirai.js` — main bot logic: login, load modules, connect MQTT
- `config.json` — bot settings (prefix, admin IDs, feature flags)
- `fca-config.json` — Facebook API MQTT + browser header options (anti-detect)
- `utils/protection.js` — **16-layer** anti-detect PRO v3.0 system
- `modules/commands/` — 50 bot commands
- `modules/events/` — event handlers (broadcast, join/leave)
- `includes/` — database setup, controllers, event/command handlers
- `languages/` — `en.lang`, `vi.lang`
- `utils/` — logging, utilities, runtime data
- `utils/data/appstate_backups/` — last 3 good appstate backups (auto-managed)

## Commands (50 total)
| Command | Description |
|---|---|
| `!eval` / `!exec` | Owner: Execute JavaScript code live |
| `!countdown [sec] [label]` | Live countdown timer with progress bar |
| `!imgsearch [query] [-n]` | Free image search via DuckDuckGo, sends image(s) |
| `!canva news [title]` | Generate STARTCOPE NEWS image (AI-designed, free) |
| `!canva design [prompt]` | Generate custom AI design poster |
| `!canva logo [text]` | Generate professional logo with star icon |
| `!pdf [your prompt]` | Generate custom PDF from ANY text — free for all users |
| `!pdf school/enrollment/clearance/permit/letter [name]` | Generate printable school PDF form |
| `!faceswap` | AI face swap — reply to image + attach face photo (free, HuggingFace AI) |
| `!weather [location]` | Real-time weather image + text + **Tagalog voice** |
| `!weather video [location]` | **59-second** weather video with Tagalog voice + music |
| `!weather typhoon / bagyo` | Philippines typhoon/LPA tracker via PAGASA |
| `!weather female [location]` | Female Tagalog voice (BlessicaNeural) |
| `!news [keyword]` | Search PH news → **59-second video** with Tagalog voice + music |
| `!news latest` | Latest Philippine news video |
| `!autofriend on/off/pending` | Admin: auto-accept all Facebook friend requests |
| `!autopost on/off` | Admin: auto-post every 51 min to GC, 24/7 |
| `!automor on/off` | Admin: dual-cycle — news+image every 10min, video every 4min → **Facebook WALL** |
| `!autoweather on/off/status` | Admin: auto-post **59s weather video** every 3 min to **ALL GCs** — 100+ PH cities |
| `!autovideo on/off/status` | Admin: auto-post **2-HOUR full news broadcast VIDEO** every 5 min to **Facebook WALL** — animated anchor, scrolling ticker, Tagalog voice |
| `!broadcast` | Event: auto Jesus messages to all GCs every ~1 hour |
| `!prefix` | Show bot prefix with **beautiful AI robot image** (Pollinations AI) |
| `!radio [station/freq]` | Search PH radio stations → streams live 30-sec clip |
| `!spotify [song]` | Search SoundCloud → sends MP3 audio |
| `!createmusic [theme]` | AI generates full song + mood-matched music + voice |
| `!jingle [script]` | MS Neural TTS jingle with echo/reverb |
| `!prayer` | AI-written personal prayer |
| `!verse` | Random Bible verse with reflection |
| `!poem` | AI-written Filipino/English poem |
| `!story` | AI short story |
| `!quote` | Inspirational quote |
| `!motivate` | Motivational speech |
| `!lost` | Message for grieving |
| `!help`, `!ping`, `!uid`, `!admin`, etc. | Standard bot controls |

## Architecture decisions
- `index.js` wraps `mirai.js` in a child process with up to 5 auto-restarts on crash
- Login supports both `appstate.json` (preferred) and `cookie.txt` (fallback)
- SQLite is used for user/thread/currency persistence — no external DB required
- Commands and events are dynamically loaded from `modules/` at startup
- `!spotify` uses SoundCloud via play-dl (YouTube is blocked by Meta bot detection)
- `!createmusic` detects mood (love/sad/happy/gospel/upbeat) from the theme and generates a matching chord-based background using ffmpeg synth
- Broadcast uses jitter scheduling (±5 min) to avoid Meta pattern detection
- `!automor` has TWO independent timers: newsTimer (10 min) and videoTimer (4 min) — posts to **Facebook WALL**
- `!autoweather` posts **59-second weather videos** to **ALL GROUP CHATS** every 3 min — 100+ Philippine cities
- `!autovideo` posts **2-HOUR full Philippines news broadcast videos** to **Facebook WALL** every 5 min — animated anchor person, scrolling news ticker, Tagalog voice, custom ibb.co background
- `!canva` uses Pollinations AI for image generation (canvas npm unavailable — needs libuuid.so.1)
- `!imgsearch` uses DuckDuckGo unofficial image API (free, no key — VQD token flow)
- `!weather` / `!news` voice: **Tagalog only** — `fil-PH-AngeloNeural` (male), `fil-PH-BlessicaNeural` (female)
- Weather image: wttr.in PNG with PNG header validation + Pollinations AI fallback if wttr.in fails
- All weather/news videos are exactly **59 seconds** (ffmpeg `apad=whole_dur=59` + `-t 59`)
- `!prefix` generates Pollinations AI image: AI robot + cyberpunk theme + prefix symbol

## Anti-Detect Protection PRO v3.0 (utils/protection.js)
- **Keep-alive**: pings Facebook API every ~9 min ± 3.5 min deep jitter, **6 rotating strategies** (2 are passive/no-API-call to reduce frequency)
- **Friend request guard**: auto-declines strangers with 2–6 sec human delay (not instant)
- **Suspicious event handler**: marks notifications read, handles unknown event types
- **Checkpoint recovery**: `clearCheckpoint()` clears Facebook scraping warnings
- **"Automated behaviour" handler**: NEW — specifically catches Meta's "We suspect automated behaviour" warning → enters **stealth mode (15–25 min pause)** before reconnecting
- **Restriction detection**: autopost/automor detect restriction → 30 min backoff + auto-recover
- **Exponential backoff**: up to 45 min on errors
- **Appstate refresh**: every **3 ticks** (more frequent than before) + after every post
- **Appstate backup**: keeps **last 3 good sessions** in `utils/data/appstate_backups/` as rollback
- **Typing simulation**: `simulateTyping()` sends typing indicator before every message (variable duration based on text length)
- **Behavior randomizer**: 4–12 min cycles (wider window) — reads threads, views profiles, marks as read
- **Session fingerprint**: per-session stable UA + screen/timezone/language fingerprint
- **User-agent rotation**: **20 real** Chrome/Firefox/Safari/Edge/Mobile UA strings
- **Rate limiter**: max **6 sends/minute** (reduced from 8 — stays under Meta radar)
- **Per-thread cooldown**: 1.5–3 sec gap between consecutive messages to the same chat
- **Jitter scheduling**: autopost ±8–15 min, automor news ±60–90 sec, video ±30–60 sec
- **Browser headers**: 14 Sec-Fetch/Sec-CH-UA/DNT/Connection + X-FB-LSD headers matching real Chrome 124
- **MQTT "automated behaviour" recovery** in `mirai.js`: catches "prevent your account / temporarily restricted / terms of use" MQTT errors → triggers stealth mode + checkpoint clear + 15–25 min reconnect delay

## AutoWeather vs AutoMOR vs AutoVideo — Key Difference
| Feature | `!automor` | `!autoweather` | `!autovideo` |
|---|---|---|---|
| Posts to | **Facebook WALL** | **ALL GROUP CHATS** | **Facebook WALL** |
| Content | PH News text+image (10min) + short video (4min) | Weather VIDEO 59s (3 min) | **2-HOUR FULL NEWS VIDEO** (5 min) |
| Voice | — | Tagalog (fil-PH-AngeloNeural) | Tagalog (fil-PH-AngeloNeural) |
| Anchor | — | Weather card | **Animated person** (gumagalaw habang nagbabalita) |
| Background | — | wttr.in + Pollinations | **Custom ibb.co image** |
| Ticker | — | — | **Scrolling news ticker** at bottom |
| Text position | bottom | bottom | **TOP of screen** |
| Source | PhilStar, Rappler, USGS | wttr.in + Pollinations | PhilStar, Rappler, Inquirer, CNN PH, GMA, USGS |

## Product
- Responds to commands with a configurable prefix (default: `!`)
- Handles Facebook group events (join/leave notifications)
- Auto-broadcasts Jesus + remembrance messages to all GCs every ~1 hour
- Per-thread autopost toggle (admin): every 51 minutes, non-stop
- AutoMOR dual-cycle: news text+thumbnail every 10 min, video news every 4 min → Facebook WALL
- **AutoWeather**: 59-second weather videos with Tagalog voice every 3 min → all GCs, 100+ PH cities
- PH radio live streaming (30-sec clips), music creation, TTS jingles
- Economy system, user/thread banning, admin controls
- AI image design via Canva command (STARTCOPE NEWS, logos, custom designs)
- Free web image search via DuckDuckGo (no API key)
- **Prefix command**: sends AI-generated cyberpunk robot image with prefix info

## User preferences
- Deployment targets: Render.com (recommended), Netlify, Vercel
- `render.yaml`, `netlify.toml`, `vercel.json` config files are present
- replit.md must be kept updated whenever new commands are added

## Gotchas
- Bot will exit immediately if neither `appstate.json` nor `cookie.txt` is present
- `appstate.json` must be a valid JSON array (not a placeholder string)
- Render.com Worker is the best fit — Netlify/Vercel are serverless (not persistent MQTT)
- `appstate.json` and `cookie.txt` are in `.gitignore` — never commit credentials
- `!spotify` uses SoundCloud (not YouTube) — YouTube blocks server IPs
- Radio station streams may go offline; only Home Radio 95.1 and DZRH 666 AM confirmed live
- `canvas` npm package broken (libuuid.so.1 missing) — use `jimp` for all image work
- `!canva` uses Pollinations AI (90s timeout) — slow on first call but works reliably
- `!imgsearch` DuckDuckGo VQD flow can fail on cold start; has retry logic built in
- `!weather video` / `!news` / `!autoweather` require ffmpeg — installed via Nix system dependency
- wttr.in weather image: validated by PNG header bytes; falls back to Pollinations AI if invalid
- `!autoweather` posts to ALL threads in `global.data.allThreadID` — ensure threads are loaded first
- Weather/news voice is **Tagalog only** — `lang=tl` removed from wttr.in URLs (was breaking image download)

## Pointers
- Deployment configs: `render.yaml`, `netlify.toml`, `vercel.json`
- Language files: `languages/en.lang`, `languages/vi.lang`
- Protection module: `utils/protection.js` (v3.0 — 16 layers)
- Pollinations AI: `https://image.pollinations.ai/prompt/{prompt}?width=1080&height=1080&model=flux`
- Tagalog TTS male: `fil-PH-AngeloNeural` | female: `fil-PH-BlessicaNeural`
- Appstate backups: `utils/data/appstate_backups/` (last 3 auto-kept)
- AutoWeather state: `utils/data/autoweather_state.json`
- AutoMOR state: `utils/data/automor_state.json`
- AutoVideo state: `utils/data/autovideo_state.json`
- News background: `utils/data/news_bg.jpg` (from ibb.co — cached)
- News anchor person: `utils/data/news_anchor.png` (Pollinations AI — cached)
- AutoVideo base segment: 5-min encoded → stream-looped to 2 hours (no re-encode)
