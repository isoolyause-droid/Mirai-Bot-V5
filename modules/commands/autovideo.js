/**
 * !autovideo — Auto-posts 2-HOUR Philippines news VIDEO to Facebook WALL
 * Every 5 minutes · 24/7 walang tigil · FREE, no API key
 * KAIBA sa AutoMOR: AutoMOR → text+image news. AutoVideo → PURE 2-HOUR VIDEO NEWS
 * Uses: background (ibb.co), animated news anchor, scrolling ticker, Tagalog voice
 *
 * !automor  → text posts + short video clips (alternating)
 * !autovideo → PURE VIDEO: 2-hour full broadcast news, every 5 min
 */

const axios           = require('axios');
const fs              = require('fs-extra');
const path            = require('path');
const { exec }        = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const bold            = require('../../utils/bold');

const VERSION       = '1.0.0';
const TEAM          = 'TEAM STARTCOPE BETA';
const INTERVAL_MS   = 5 * 60 * 1000; // 5 minutes
const BASE_SECS     = 300;            // 5-minute base segment (encoded once)
const FULL_SECS     = 7200;          // 2-hour final video (stream-looped)

const DATA_DIR    = path.join(process.cwd(), 'utils/data');
const STATE_FILE  = path.join(DATA_DIR, 'autovideo_state.json');
const SEEN_FILE   = path.join(DATA_DIR, 'autovideo_seen.json');
const TEMP_DIR    = path.join(DATA_DIR, 'autovideo_temp');
const BG_FILE     = path.join(DATA_DIR, 'news_bg.jpg');
const ANCHOR_FILE = path.join(DATA_DIR, 'news_anchor.png');
const BG_URL      = 'https://i.ibb.co/d45thbPK/1778133839564.jpg';
const ANCHOR_SEED = 777;
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(TEMP_DIR);

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const pick    = a => a[Math.floor(Math.random() * a.length)];
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const cleanup = fp => setTimeout(() => fs.remove(fp).catch(() => {}), 600000);

function runCmd(cmd, ms = 120000) {
  return new Promise((res, rej) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 400, timeout: ms }, (e, _, se) =>
      e ? rej(new Error(se?.slice(0, 400) || e.message)) : res()
    )
  );
}

// ── Asset: background image ───────────────────────────────────────────────────
async function ensureBackground() {
  if (fs.existsSync(BG_FILE) && fs.statSync(BG_FILE).size > 10000) return BG_FILE;
  console.log('[AutoVideo] Downloading background...');
  const { data } = await axios.get(BG_URL, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
  fs.writeFileSync(BG_FILE, Buffer.from(data));
  return BG_FILE;
}

// ── Asset: anchor person image ────────────────────────────────────────────────
async function ensureAnchor() {
  if (fs.existsSync(ANCHOR_FILE) && fs.statSync(ANCHOR_FILE).size > 10000) return ANCHOR_FILE;
  console.log('[AutoVideo] Generating anchor image...');
  const prompt = encodeURIComponent(
    'Filipino male TV news anchor, formal dark suit red tie, full body standing, ' +
    'broadcast studio dark blue background, professional studio lighting, ' +
    'high contrast isolated portrait, broadcast quality, sharp'
  );
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=400&height=700&nologo=true&model=flux&seed=${ANCHOR_SEED}`;
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000 });
  if (!data || data.byteLength < 5000) throw new Error('Anchor image generation failed');
  fs.writeFileSync(ANCHOR_FILE, Buffer.from(data));
  return ANCHOR_FILE;
}

// ── State helpers ─────────────────────────────────────────────────────────────
function loadState()   { try { return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}; } catch { return {}; } }
function saveState(d)  { try { fs.writeFileSync(STATE_FILE, JSON.stringify(d, null, 2)); } catch {} }
function loadSeen()    { try { return fs.existsSync(SEEN_FILE)  ? JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))  : []; } catch { return []; } }
function saveSeen(arr) { try { fs.writeFileSync(SEEN_FILE, JSON.stringify(arr)); } catch {} }

let state = { enabled: false, count: 0, lastPostedAt: null };
let seenNews = new Set(loadSeen());

function loadPersistedState() {
  const s = loadState();
  if (s.enabled      !== undefined) state.enabled      = s.enabled;
  if (s.count        !== undefined) state.count        = s.count;
  if (s.lastPostedAt !== undefined) state.lastPostedAt = s.lastPostedAt;
}
function persist() { saveState(state); }

function markSeen(id) {
  seenNews.add(String(id));
  if (seenNews.size > 800) {
    const arr = [...seenNews];
    seenNews = new Set(arr.slice(arr.length - 500));
  }
  saveSeen([...seenNews]);
}

let videoTimer = null;
let globalApi  = null;

// ── RSS news feeds (same as automor/autopost) ─────────────────────────────────
const RSS_FEEDS = [
  { name: 'PhilStar',          emoji: '🚨', cat: 'Breaking',   url: 'https://www.philstar.com/rss/headlines' },
  { name: 'PhilStar Nation',   emoji: '🏛️', cat: 'Nation',     url: 'https://www.philstar.com/rss/nation' },
  { name: 'PhilStar Sports',   emoji: '⚽', cat: 'Sports',     url: 'https://www.philstar.com/rss/sports' },
  { name: 'PhilStar Business', emoji: '💼', cat: 'Business',   url: 'https://www.philstar.com/rss/business' },
  { name: 'Rappler',           emoji: '📡', cat: 'News',       url: 'https://www.rappler.com/rss/' },
  { name: 'Inquirer',          emoji: '📰', cat: 'Inquirer',   url: 'https://newsinfo.inquirer.net/feed' },
  { name: 'Inquirer Nation',   emoji: '🇵🇭', cat: 'Nation',    url: 'https://newsinfo.inquirer.net/category/nation/feed' },
  { name: 'CNN PH',            emoji: '📺', cat: 'CNN',        url: 'https://cnnphilippines.com/rss/rss.html' },
  { name: 'GMA News',          emoji: '📺', cat: 'GMA',        url: 'https://www.gmanetwork.com/news/rss/news.xml' },
  { name: 'USGS Earthquakes',  emoji: '🌋', cat: 'Earthquake', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.atom' },
];

function parseRSS(xml) {
  const items  = [];
  const blocks = xml.split(/<item|<entry/);
  for (let i = 1; i < blocks.length; i++) {
    const b   = blocks[i];
    const get = (tag) => {
      const cd = b.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
      if (cd) return cd[1].trim();
      const pl = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return pl ? pl[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const title   = get('title');
    const link    = get('link') || b.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
    const desc    = (get('description') || get('summary') || '').slice(0, 250);
    const pubDate = get('pubDate') || get('published') || '';
    if (title && title.length > 4) items.push({ title, link, desc: desc.replace(/<[^>]+>/g, '').trim(), pubDate });
  }
  return items;
}

async function fetchAllNews() {
  const all = [];
  await Promise.all(RSS_FEEDS.map(async (f) => {
    try {
      const { data } = await axios.get(f.url, { timeout: 10000, headers: { 'User-Agent': UA } });
      for (const item of parseRSS(data)) all.push({ ...item, source: f.name, emoji: f.emoji, cat: f.cat });
    } catch {}
  }));
  return all;
}

async function fetchEarthquakes() {
  try {
    const { data } = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { timeout: 10000, headers: { 'User-Agent': UA } });
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const PH = /Philippines|Mindanao|Luzon|Visayas|Davao|Cebu|Manila|Leyte|Samar|Palawan|Batangas|Bicol|Iloilo|Zamboanga|Cotabato/i;
    return (parsed.features || [])
      .filter(e => PH.test(e.properties.place || ''))
      .map(e => ({ title: `M${e.properties.mag} Lindol — ${e.properties.place}`, link: e.properties.url || '', desc: `Magnitude ${e.properties.mag}, lalim: ${Math.round(e.geometry?.coordinates?.[2] || 0)} km.`, pubDate: new Date(e.properties.time).toISOString(), source: 'USGS', emoji: '🌋', cat: 'Lindol', id: e.id }));
  } catch { return []; }
}

async function getNewsItems() {
  const [rss, quakes] = await Promise.all([fetchAllNews(), fetchEarthquakes()]);
  const all   = [...quakes, ...rss];
  const fresh = all.filter(n => !seenNews.has(String(n.id || n.link)));
  if (!fresh.length) { seenNews.clear(); saveSeen([]); return all.slice(0, 15); }
  return fresh.slice(0, 15);
}

// ── Tagalog news script (100% Tagalog, full broadcast) ────────────────────────
function buildFullBroadcastScript(articles) {
  const now = new Date().toLocaleString('fil-PH', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' });
  let script =
    `Magandang araw po sa inyong lahat! Ito ang TEAM STARTCOPE BETA Philippines News Broadcast, ika-${now}. ` +
    `Narito na po ang pinakabagong balita mula sa iba't ibang panig ng Pilipinas at mundo. ` +
    `Manatiling nakatuon. `;

  const tops = articles.slice(0, 12);
  tops.forEach((a, i) => {
    const num = ['Una', 'Pangalawa', 'Pangatlo', 'Pang-apat', 'Panlima',
                 'Pang-anim', 'Pampito', 'Pangwalo', 'Pansiyam', 'Pang-sampu',
                 'Pang-labing-isa', 'Pang-labindalawa'][i] || `Bilang ${i + 1}`;
    script += `${num} sa aming mga balita: ${a.title}. `;
    if (a.desc && a.desc.length > 15) {
      script += `${a.desc.slice(0, 200).replace(/\s+/g, ' ')}. `;
    }
    script += `Ayon sa ${a.source}. `;
    if (i < tops.length - 1) script += `Sunod na balita: `;
  });

  script +=
    `Iyan po ang lahat ng aming balita para ngayon. ` +
    `Ito ay TEAM STARTCOPE BETA Philippines News, ang inyong mapagkakatiwalaang pinagkukunan ng balita. ` +
    `Ang balitang ito ay awtomatikong na-broadcast ng aming news system. ` +
    `Manatiling updated, manatiling ligtas, at manatiling tapat sa batas. ` +
    `Hanggang sa muli, magandang araw po sa inyong lahat! Salamat po at mabuhay ang Pilipinas!`;

  return script;
}

// ── Tagalog TTS ───────────────────────────────────────────────────────────────
async function makeTagalogVoice(script) {
  const fp  = path.join(TEMP_DIR, `av_voice_${Date.now()}.mp3`);
  const tts = new MsEdgeTTS();
  await tts.setMetadata('fil-PH-AngeloNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(script, { rate: '-5%', pitch: '+0Hz' });
  await new Promise((res, rej) => {
    const chunks = [];
    audioStream.on('data',  d => chunks.push(d));
    audioStream.on('end',   () => { fs.writeFileSync(fp, Buffer.concat(chunks)); res(); });
    audioStream.on('error', rej);
    setTimeout(() => rej(new Error('TTS timeout')), 60000);
  });
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 500) throw new Error('TTS output empty');
  return fp;
}

// ── Background music (news broadcast chord) ───────────────────────────────────
const NEWS_CHORD =
  '(0.28*sin(2*PI*146*t)+0.22*sin(2*PI*293*t)+0.18*sin(2*PI*349*t)' +
  '+0.14*sin(2*PI*440*t)+0.10*sin(2*PI*587*t))*(1+0.55*sin(2*PI*1.2*t))';

async function makeAudioTrack(voiceFp) {
  const bgFp  = path.join(TEMP_DIR, `av_bg_${Date.now()}.mp3`);
  const mixFp = path.join(TEMP_DIR, `av_mix_${Date.now()}.mp3`);

  // Build background music looped to BASE_SECS + extra
  await runCmd([
    'ffmpeg -y',
    `-f lavfi -i "aevalsrc=${NEWS_CHORD}*0.40:s=44100:d=${BASE_SECS + 5}"`,
    `-filter_complex "[0:a]volume=0.80,aecho=0.8:0.6:180|360:0.28|0.12[out]"`,
    `-map "[out]" -ar 44100 -ac 1 -b:a 48k "${bgFp}"`,
  ].join(' '), 60000);

  // Mix voice (front) + bg music (soft) — pad voice to BASE_SECS with silence
  await runCmd([
    'ffmpeg -y',
    `-i "${voiceFp}" -i "${bgFp}"`,
    `-filter_complex`,
    `"[0:a]apad=whole_dur=${BASE_SECS}[vpad];`,
    `[1:a]volume=0.18[bg];`,
    `[vpad][bg]amix=inputs=2:duration=first:dropout_transition=3[out]"`,
    `-map "[out]" -ar 44100 -ac 1 -b:a 64k -t ${BASE_SECS} "${mixFp}"`,
  ].join(' '), 60000);

  try { fs.removeSync(bgFp); } catch {}
  if (!fs.existsSync(mixFp) || fs.statSync(mixFp).size < 5000) return voiceFp;
  return mixFp;
}

// ── Build 5-min base video then stream-loop to 2 hours ────────────────────────
async function makeFullNewsVideo(bgFp, anchorFp, audioFp, articles) {
  const baseFp = path.join(TEMP_DIR, `av_base_${Date.now()}.mp4`);
  const fullFp = path.join(TEMP_DIR, `av_full_${Date.now()}.mp4`);

  const headline  = (articles[0]?.title || 'BALITA NG PILIPINAS').replace(/['"\\:<>]/g, '').slice(0, 52);
  const source    = (articles[0]?.source || 'PhilStar').replace(/['"\\]/g, '').slice(0, 18);
  const tickerRaw = articles.slice(0, 8).map(a => `● ${a.title}`).join('  ').replace(/['"\\:<>]/g, '');
  const ticker    = tickerRaw.slice(0, 220);
  const now       = new Date().toLocaleString('fil-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).replace(/['"\\]/g, '').slice(0, 30);

  // ── STEP 1: Encode 5-minute base video (anchor + text overlays + audio) ────
  const vf = [
    // Scale background
    '[0:v]scale=640:360[bg]',
    // Scale anchor person
    '[1:v]scale=160:260[anchor]',
    // Overlay anchor in bottom-right with vertical bob animation (person moving)
    // y sine wave = person swaying while reporting
    '[bg][anchor]overlay=x=W-w-12:y=\'H-h-5+14*sin(2*PI*t/1.75)\'[wa]',
    // TOP: network branding bar
    '[wa]drawtext=text=\'📡 PHILIPPINES NEWS BROADCAST - TEAM STARTCOPE BETA\'' +
    ':fontsize=16:fontcolor=white:box=1:boxcolor=0x003399@0.94:boxborderw=8' +
    ':x=(w-tw)/2:y=6',
    // BREAKING NEWS badge (top-left, below branding)
    'drawtext=text=\'🔴 BREAKING NEWS\'' +
    ':fontsize=19:fontcolor=white:box=1:boxcolor=red@0.92:boxborderw=8' +
    ':x=10:y=34',
    // Timestamp (top-right)
    `drawtext=text='${now} PH'` +
    ':fontsize=13:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=5' +
    ':x=w-tw-10:y=38',
    // Headline (center, lower-middle area)
    `drawtext=text='${headline}'` +
    ':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=8' +
    ':x=(w-tw)/2:y=h/2-30',
    // Source label
    `drawtext=text='SOURCE\\: ${source}'` +
    ':fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=5' +
    ':x=(w-tw)/2:y=h/2+16',
    // Scrolling news ticker at the very bottom (left-to-right scroll)
    `drawtext=text='${ticker}'` +
    ':fontsize=13:fontcolor=white:box=1:boxcolor=0x001166@0.90:boxborderw=5' +
    `:x='w-mod(t*90\\,w+tw)':y=h-22`,
  ].join(',');

  const cmd1 =
    `ffmpeg -y ` +
    `-loop 1 -i "${bgFp}" ` +
    `-loop 1 -i "${anchorFp}" ` +
    `-i "${audioFp}" ` +
    `-filter_complex "${vf}" ` +
    `-map "[wa]" -map 2:a ` +
    `-c:v libx264 -preset ultrafast -crf 46 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 64k -ar 44100 -ac 1 ` +
    `-t ${BASE_SECS} "${baseFp}" 2>&1`;

  // Allow 8 minutes for base encoding
  await runCmd(cmd1, 8 * 60 * 1000);
  if (!fs.existsSync(baseFp) || fs.statSync(baseFp).size < 50000) throw new Error('Base video encoding failed');
  console.log(`[AutoVideo] ✅ Base segment ready: ${Math.round(fs.statSync(baseFp).size / 1024 / 1024)}MB`);

  // ── STEP 2: Stream-loop base to 2 hours (no re-encode — FAST!) ──────────────
  const cmd2 = `ffmpeg -y -stream_loop -1 -i "${baseFp}" -c copy -t ${FULL_SECS} "${fullFp}" 2>&1`;
  await runCmd(cmd2, 5 * 60 * 1000);
  if (!fs.existsSync(fullFp) || fs.statSync(fullFp).size < 100000) throw new Error('2-hour loop failed');

  const sizeMB = Math.round(fs.statSync(fullFp).size / 1024 / 1024);
  console.log(`[AutoVideo] ✅ 2-hour video ready: ${sizeMB}MB`);

  fs.removeSync(baseFp);
  return fullFp;
}

// ── Compose Facebook WALL post body ──────────────────────────────────────────
const DIVIDERS = [
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  '═══════════════════════',
  '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
];

function composePostBody(articles) {
  const now    = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const div    = pick(DIVIDERS);
  const top    = articles.slice(0, 6);
  const header = `📺 PHILIPPINES NEWS BROADCAST\n${div}\n\n`;
  const items  = top.map((a, i) =>
    `${['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣'][i]} ${a.emoji || '📰'} [${a.cat}] ${a.title}\n` +
    (a.desc ? `   ${a.desc.slice(0, 100)}\n` : '')
  ).join('\n');
  const footer = `\n${div}\n📅 ${now} PH | 🎬 2-HOUR Full Broadcast Video\n🎙️ Tagalog Voice | 🇵🇭 ${TEAM}`;
  return (header + items + footer).trim().slice(0, 1900);
}

// ── Save appstate ─────────────────────────────────────────────────────────────
function saveAppstate(api) {
  try {
    const a = api.getAppState();
    if (a && Array.isArray(a)) {
      fs.writeFileSync('./appstate.json', JSON.stringify(a, null, 2));
      fs.writeFileSync('./utils/data/fbstate.json', JSON.stringify(a, null, 2));
    }
  } catch {}
}

function doCreatePost(api, body, attachment) {
  return new Promise((res, rej) => {
    if (typeof api.createPost !== 'function') return rej(new Error('api.createPost not available'));
    const msg = attachment ? { body, attachment } : { body };
    api.createPost(msg, (err, url) => err ? rej(err) : res(url));
  });
}

// ── Error handler with backoff ────────────────────────────────────────────────
function handleError(e, cycleFn) {
  const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e).slice(0, 200));
  const msg    = errStr.toLowerCase();
  if (msg.includes('checkpoint') || msg.includes('restricted') || msg.includes('suspended')) {
    console.error(`[AutoVideo] 🔒 RESTRICTION — backing off 30 min:`, errStr.slice(0, 80));
    if (global.protection?.clearCheckpoint) global.protection.clearCheckpoint(globalApi);
    return setTimeout(cycleFn, 30 * 60 * 1000 + Math.random() * 5 * 60 * 1000);
  }
  console.error(`[AutoVideo] ❌ Error:`, errStr.slice(0, 150));
  state.errorCount = (state.errorCount || 0) + 1;
  const backoff = Math.min(state.errorCount * 2 * 60 * 1000, 20 * 60 * 1000);
  console.log(`[AutoVideo] ⏳ Backoff: ${Math.round(backoff / 60000)} min`);
  return setTimeout(cycleFn, backoff);
}

// ── Main video cycle ──────────────────────────────────────────────────────────
async function runVideoCycle() {
  if (!state.enabled || !globalApi) return;

  console.log(`[AutoVideo #${state.count + 1}] 🎬 Starting 2-hour news video build...`);
  let voiceFp = null, audioFp = null, videoFp = null;

  try {
    // Load assets + news in parallel
    const [bgRes, anchorRes, newsRes] = await Promise.allSettled([
      ensureBackground(),
      ensureAnchor(),
      getNewsItems(),
    ]);

    const bgFp      = bgRes.status === 'fulfilled'     ? bgRes.value     : null;
    const anchorFp  = anchorRes.status === 'fulfilled' ? anchorRes.value : null;
    const articles  = newsRes.status === 'fulfilled'   ? newsRes.value   : [];

    if (!bgFp)     throw new Error('Background image not available');
    if (!articles.length) throw new Error('No news articles fetched');

    // Mark news as seen
    articles.slice(0, 15).forEach(a => markSeen(a.id || a.link));

    // Build Tagalog broadcast script + TTS voice
    console.log(`[AutoVideo] 🎙️ Building Tagalog script for ${articles.length} articles...`);
    const script = buildFullBroadcastScript(articles);
    voiceFp = await makeTagalogVoice(script);

    // Mix voice + background music
    audioFp = await makeAudioTrack(voiceFp).catch(() => voiceFp);

    // Build 2-hour video (encode 5-min base, then stream-loop)
    const usedAnchor = anchorFp || bgFp; // fallback to bg if anchor not ready
    videoFp = await makeFullNewsVideo(bgFp, usedAnchor, audioFp, articles);

    // Compose Wall post text
    const body = composePostBody(articles);

    // Post to Facebook WALL
    console.log(`[AutoVideo] 📤 Uploading ${Math.round(fs.statSync(videoFp).size / 1024 / 1024)}MB 2-hour video to Facebook Wall...`);
    await doCreatePost(globalApi, body, fs.createReadStream(videoFp));

    state.count++;
    state.lastPostedAt = new Date().toISOString();
    state.errorCount   = 0;
    persist();
    saveAppstate(globalApi);
    if (global.protection?.clearCheckpoint) global.protection.clearCheckpoint(globalApi);
    console.log(`[AutoVideo #${state.count}] ✅ 2-hour video posted to Facebook Wall!`);

  } catch (e) {
    videoTimer = handleError(e, runVideoCycle);
    return;
  } finally {
    if (voiceFp && voiceFp !== audioFp) cleanup(voiceFp);
    if (audioFp) cleanup(audioFp);
    if (videoFp) cleanup(videoFp);
  }

  // Next run: 5 min ± 30–60 sec jitter
  const jitter = (Math.random() - 0.5) * 2 * (30000 + Math.random() * 30000);
  videoTimer = setTimeout(runVideoCycle, INTERVAL_MS + jitter);
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
function startAutoVideo(api) {
  globalApi     = api;
  state.enabled = true;
  persist();

  const firstDelay = 20000 + Math.random() * 20000;
  videoTimer = setTimeout(runVideoCycle, firstDelay);
  console.log(`[AutoVideo] ✅ Started — 2-hour news video every 5 min to Facebook Wall`);
  console.log(`[AutoVideo] ⏱️ First video in ${Math.round(firstDelay / 1000)}s`);

  // Pre-fetch assets in background
  Promise.allSettled([ensureBackground(), ensureAnchor()])
    .then(results => {
      const ok = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[AutoVideo] 📦 Assets ready: ${ok}/2`);
    });
}

function stopAutoVideo() {
  if (videoTimer) { clearTimeout(videoTimer); videoTimer = null; }
  state.enabled = false;
  persist();
  console.log('[AutoVideo] 🛑 Stopped');
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'autovideo',
  version:         VERSION,
  hasPermssion:    2,
  credits:         TEAM,
  description:     'Auto-posts 2-HOUR Philippines news broadcast VIDEO to Facebook WALL every 5 min. Tagalog voice, animated anchor, scrolling ticker, background music.',
  commandCategory: 'Admin',
  usages:          '[on | off | status]',
  cooldowns:       5,
};

module.exports.onLoad = function ({ api }) {
  loadPersistedState();
  if (state.enabled) {
    globalApi = api;
    console.log(`[AutoVideo] 🔄 Restored — resuming 2-hour news cycle...`);
    setTimeout(() => startAutoVideo(api), 15000);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P   = global.config?.PREFIX || '!';
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    return api.sendMessage(
      `╔═══════════════════════════════╗\n` +
      `║  🎬 ${bold('AUTOVIDEO v' + VERSION)}           ║\n` +
      `║  🏷️  ${bold(TEAM)}   ║\n` +
      `╚═══════════════════════════════╝\n\n` +
      `📺 ${bold('2-ORAS NA FULL NEWS BROADCAST — 24/7!')}\n` +
      `📹 ${bold('Nagpo-post ng 2-ORAS na news video sa Facebook WALL')}\n` +
      `🎙️ ${bold('Tagalog voice')} + background news music\n` +
      `👤 ${bold('Animated news anchor')} na gumagalaw habang nag-uulat\n` +
      `📊 ${bold('Scrolling news ticker')} sa ibaba ng screen\n` +
      `📡 ${bold('Sources:')} PhilStar, Rappler, Inquirer, CNN PH, GMA News, USGS\n\n` +
      `📋 ${bold('COMMANDS:')}\n${'─'.repeat(32)}\n` +
      `${P}autovideo on      — I-start (5-minuto interval)\n` +
      `${P}autovideo off     — I-stop\n` +
      `${P}autovideo status  — Status at stats\n\n` +
      `📊 ${bold('STATUS:')}\n` +
      `  • ${bold('State:')} ${state.enabled ? '🟢 ON' : '🔴 OFF'}\n` +
      `  • ${bold('Total posts:')} ${state.count}\n` +
      (state.lastPostedAt ? `  • ${bold('Huling post:')} ${new Date(state.lastPostedAt).toLocaleString('fil-PH', { timeZone: 'Asia/Manila' })}\n` : '') +
      `\n⚡ ${bold('KAIBA sa AutoMOR:')}\n` +
      `  AutoMOR → text + short clips\n` +
      `  AutoVideo → PURE 2-HOUR FULL VIDEO\n\n` +
      `🔒 ${bold('Admin only')} | Nagpo-post sa Facebook WALL`,
      threadID, messageID
    );
  }

  if (sub === 'on') {
    if (state.enabled) {
      return api.sendMessage(
        `⚠️ ${bold('Naka-ON na ang AutoVideo.')}\nI-stop: ${P}autovideo off`,
        threadID, messageID
      );
    }
    startAutoVideo(api);
    return api.sendMessage(
      `✅ ${bold('AUTOVIDEO — NAGSIMULA NA! 🎬📺')}\n\n` +
      `📹 ${bold('2-ORAS na news video bawat 5 minuto!')}\n` +
      `🎙️ ${bold('Tagalog voice')} + background music\n` +
      `👤 ${bold('Animated news anchor')} na gumagalaw\n` +
      `📊 ${bold('Scrolling news ticker')} sa screen\n` +
      `📤 ${bold('Nagpo-post sa FACEBOOK WALL')}\n\n` +
      `🕒 ${bold('Unang video sa loob ng 40 segundo...')}\n` +
      `⚠️ ${bold('PAALALA:')} Ang encoding ng 2-oras na video ay tumatagal ng\n` +
      `   ilang minuto. Hintayin lang at automatic na mag-po-post!\n\n` +
      `💡 I-stop: ${P}autovideo off\n🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  if (sub === 'off') {
    if (!state.enabled) {
      return api.sendMessage(
        `⚠️ ${bold('Hindi pa naka-ON ang AutoVideo.')}\nI-start: ${P}autovideo on`,
        threadID, messageID
      );
    }
    stopAutoVideo();
    return api.sendMessage(
      `🛑 ${bold('AUTOVIDEO — NATIGIL.')}\n\n` +
      `📊 ${bold('Kabuuang posts:')} ${state.count}\n` +
      (state.lastPostedAt ? `🕒 ${bold('Huling post:')} ${new Date(state.lastPostedAt).toLocaleString('fil-PH', { timeZone: 'Asia/Manila' })}\n` : '') +
      `\n💡 I-restart: ${P}autovideo on\n🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  if (sub === 'status') {
    return api.sendMessage(
      `📊 ${bold('AUTOVIDEO STATUS')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `  • ${bold('State:')} ${state.enabled ? '🟢 RUNNING' : '🔴 STOPPED'}\n` +
      `  • ${bold('Total posts:')} ${state.count}\n` +
      `  • ${bold('Interval:')} 5 minuto ± jitter\n` +
      `  • ${bold('Video duration:')} 2 oras (7,200 segundo)\n` +
      `  • ${bold('Destination:')} Facebook WALL\n` +
      `  • ${bold('Background:')} ${fs.existsSync(BG_FILE) ? '✅ Ready' : '⬇️ Will download'}\n` +
      `  • ${bold('Anchor image:')} ${fs.existsSync(ANCHOR_FILE) ? '✅ Ready' : '⬇️ Will generate'}\n` +
      (state.lastPostedAt ? `  • ${bold('Huling post:')} ${new Date(state.lastPostedAt).toLocaleString('fil-PH', { timeZone: 'Asia/Manila' })}\n` : '') +
      `\n🏷️ ${bold(TEAM)}`,
      threadID, messageID
    );
  }

  return api.sendMessage(
    `❌ Hindi kilala ang command.\n💡 Gamitin: ${P}autovideo on/off/status`,
    threadID, messageID
  );
};
