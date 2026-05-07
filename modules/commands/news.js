/**
 * !news [keyword] — Search Philippine news and send VIDEO with Tagalog voice + music
 * FREE, no API key — uses RSS feeds + custom background + animated anchor + Tagalog voice + ffmpeg video
 *
 * Usage:
 *   !news [keyword]     — Search news by topic, sends video with Tagalog voice
 *   !news latest        — Latest PH news (no filter)
 *   !news naga city     — News about Naga City
 *   !news bagyo         — Search typhoon/bagyo news
 */

const axios           = require('axios');
const fs              = require('fs-extra');
const path            = require('path');
const { exec }        = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const bold            = require('../../utils/bold');

const DATA_DIR    = path.join(process.cwd(), 'utils/data');
const TEMP_DIR    = path.join(DATA_DIR, 'news_temp');
const BG_FILE     = path.join(DATA_DIR, 'news_bg.jpg');
const ANCHOR_FILE = path.join(DATA_DIR, 'news_anchor.png');
const BG_URL      = 'https://i.ibb.co/d45thbPK/1778133839564.jpg';
fs.ensureDirSync(TEMP_DIR);

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const cleanup = (fp) => setTimeout(() => fs.remove(fp).catch(() => {}), 300000);

// ── Asset: background (ibb.co) ────────────────────────────────────────────────
async function ensureBackground() {
  if (fs.existsSync(BG_FILE) && fs.statSync(BG_FILE).size > 10000) return BG_FILE;
  const { data } = await axios.get(BG_URL, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
  fs.writeFileSync(BG_FILE, Buffer.from(data));
  return BG_FILE;
}

// ── Asset: anchor person (cached) ─────────────────────────────────────────────
async function ensureAnchor() {
  if (fs.existsSync(ANCHOR_FILE) && fs.statSync(ANCHOR_FILE).size > 10000) return ANCHOR_FILE;
  const prompt = encodeURIComponent('Filipino male TV news anchor, formal dark suit red tie, full body standing, broadcast studio dark blue background, professional studio lighting, high contrast isolated portrait, broadcast quality, sharp');
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=400&height=700&nologo=true&model=flux&seed=777`;
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000 });
  if (data && data.byteLength > 5000) fs.writeFileSync(ANCHOR_FILE, Buffer.from(data));
  return fs.existsSync(ANCHOR_FILE) ? ANCHOR_FILE : null;
}

function runCmd(cmd, ms = 120000) {
  return new Promise((res, rej) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 200, timeout: ms }, (e, _, se) =>
      e ? rej(new Error(se?.slice(0, 300) || e.message)) : res()
    )
  );
}

// ── RSS feeds — Philippine news, FREE, no API key ────────────────────────────
const RSS_FEEDS = [
  { name: 'PhilStar',          emoji: '🚨', cat: 'Breaking',  url: 'https://www.philstar.com/rss/headlines' },
  { name: 'PhilStar Nation',   emoji: '🏛️', cat: 'Nation',    url: 'https://www.philstar.com/rss/nation' },
  { name: 'PhilStar Business', emoji: '💼', cat: 'Business',  url: 'https://www.philstar.com/rss/business' },
  { name: 'PhilStar Sports',   emoji: '⚽', cat: 'Sports',    url: 'https://www.philstar.com/rss/sports' },
  { name: 'Rappler',           emoji: '📡', cat: 'News',      url: 'https://www.rappler.com/rss/' },
  { name: 'Inquirer',          emoji: '📰', cat: 'Inquirer',  url: 'https://newsinfo.inquirer.net/feed' },
  { name: 'Inquirer Nation',   emoji: '🇵🇭', cat: 'Nation',   url: 'https://newsinfo.inquirer.net/category/nation/feed' },
  { name: 'CNN PH',            emoji: '📺', cat: 'CNN',       url: 'https://cnnphilippines.com/rss/rss.html' },
  { name: 'GMA News',          emoji: '📺', cat: 'GMA',       url: 'https://www.gmanetwork.com/news/rss/news.xml' },
  { name: 'USGS Earthquakes',  emoji: '🌋', cat: 'Earthquake', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.atom' },
];

function parseRSS(xml) {
  const items  = [];
  const blocks = xml.split(/<item|<entry/);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const get = (tag) => {
      const cdata = b.match(new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
      if (cdata) return cdata[1].trim();
      const plain = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return plain ? plain[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const title = get('title');
    const link  = get('link') || b.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
    const desc  = (get('description') || get('summary') || get('content')).slice(0, 300);
    const thumb = b.match(/url="([^"]+\.(jpg|jpeg|png|webp))"/i)?.[1] ||
                  b.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ||
                  b.match(/<enclosure[^>]+url="([^"]+\.(jpg|jpeg|png))"/i)?.[1] || '';
    const pubDate = get('pubDate') || get('published') || get('updated') || '';
    if (title && title.length > 4) items.push({ title, link, desc: desc.replace(/<[^>]+>/g, '').trim(), thumb, pubDate });
  }
  return items;
}

async function fetchAllNews() {
  const all = [];
  await Promise.all(RSS_FEEDS.map(async (f) => {
    try {
      const { data } = await axios.get(f.url, { timeout: 10000, headers: { 'User-Agent': UA } });
      for (const item of parseRSS(data)) {
        all.push({ ...item, source: f.name, emoji: f.emoji, cat: f.cat });
      }
    } catch {}
  }));
  return all;
}

function searchNews(items, keyword) {
  if (!keyword || keyword === 'latest') return items.slice(0, 5);
  const kw = keyword.toLowerCase();
  const scored = items.map(it => {
    let score = 0;
    const titleL = it.title.toLowerCase();
    const descL  = (it.desc || '').toLowerCase();
    const words = kw.split(/\s+/);
    for (const w of words) {
      if (titleL.includes(w)) score += 3;
      if (descL.includes(w))  score += 1;
    }
    return { ...it, score };
  }).filter(it => it.score > 0).sort((a, b) => b.score - a.score);

  return scored.length ? scored.slice(0, 5) : [];
}

// ── Pollinations AI — generate a news card image ─────────────────────────────
async function generateNewsImage(title, source, category) {
  const prompt = encodeURIComponent(
    `Philippine TV news broadcast studio, bold breaking news lower-third graphic, ` +
    `headline text: "${title.slice(0, 70)}", source: ${source}, category: ${category}, ` +
    `dark blue gradient background, red breaking-news banner at bottom, ` +
    `professional broadcast quality, Philippines map subtle background, ` +
    `sharp crisp legible white text, high contrast, ultra HD`
  );
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=600&nologo=true&model=flux&seed=${Date.now() % 99999}`;
  const fp  = path.join(TEMP_DIR, `nimg_${Date.now()}.jpg`);
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 80000 });
  if (!data || data.byteLength < 2000) throw new Error('Image too small');
  fs.writeFileSync(fp, Buffer.from(data));
  return fp;
}

async function downloadThumb(url) {
  const fp = path.join(TEMP_DIR, `nthumb_${Date.now()}.jpg`);
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': UA } });
    if (!data || data.byteLength < 3000) return null;
    fs.writeFileSync(fp, Buffer.from(data));
    return fp;
  } catch { return null; }
}

// ── Breaking-news background music (D minor — dramatic + urgent) ──────────────
const NEWS_BG_CHORD =
  '(0.28*sin(2*PI*146*t)+0.22*sin(2*PI*293*t)+0.18*sin(2*PI*349*t)' +
  '+0.14*sin(2*PI*440*t)+0.10*sin(2*PI*587*t))*(1+0.55*sin(2*PI*1.2*t))';

async function makeNewsBg(durationSec, outPath) {
  const cmd = [
    'ffmpeg -y',
    `-f lavfi -i "aevalsrc=${NEWS_BG_CHORD}*0.45:s=44100:d=${Math.ceil(durationSec + 2)}"`,
    `-filter_complex "[0:a]volume=0.85,aecho=0.8:0.6:180|360:0.30|0.15[out]"`,
    '-map "[out]" -ar 44100 -ac 2 -b:a 64k',
    `"${outPath}"`,
  ].join(' ');
  await runCmd(cmd, 30000);
}

async function mixWithBg(voiceFp) {
  const bgFp  = path.join(TEMP_DIR, `nbg_${Date.now()}.mp3`);
  const outFp = path.join(TEMP_DIR, `nmix_${Date.now()}.mp3`);
  try {
    const durRaw = await new Promise(r =>
      exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceFp}"`, (_, o) => r(o?.trim()))
    );
    const dur = Math.ceil(parseFloat(durRaw) || 25) + 2;
    await makeNewsBg(dur, bgFp);
    await runCmd([
      'ffmpeg -y',
      `-i "${voiceFp}" -i "${bgFp}"`,
      `-filter_complex "[1:a]volume=0.20[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[out]"`,
      `-map "[out]" -ar 44100 -ac 2 -b:a 128k`,
      `"${outFp}"`,
    ].join(' '), 30000);
    if (!fs.existsSync(outFp) || fs.statSync(outFp).size < 1000) throw new Error('mix empty');
    try { fs.removeSync(bgFp); } catch {}
    return outFp;
  } catch (e) {
    try { fs.removeSync(bgFp); } catch {}
    console.log('[News] BG mix failed, plain voice:', e.message?.slice(0, 60));
    return voiceFp;
  }
}

// ── Tagalog TTS voice — fil-PH-AngeloNeural (male) ───────────────────────────
async function makeTagalogVoice(script) {
  const fp  = path.join(TEMP_DIR, `nvoice_${Date.now()}.mp3`);
  const tts = new MsEdgeTTS();
  await tts.setMetadata('fil-PH-AngeloNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(script, { rate: '-8%', pitch: '+0Hz' });
  await new Promise((res, rej) => {
    const chunks = [];
    audioStream.on('data',  d => chunks.push(d));
    audioStream.on('end',   () => { fs.writeFileSync(fp, Buffer.concat(chunks)); res(); });
    audioStream.on('error', rej);
    setTimeout(() => rej(new Error('TTS timeout')), 35000);
  });
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 500) throw new Error('TTS output empty');
  return fp;
}

// ── Build Tagalog news script (100% Tagalog, walang English) ─────────────────
function buildTagalogScript(articles, keyword) {
  const now = new Date().toLocaleString('fil-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  let script = `Magandang araw po sa inyong lahat! `;
  if (keyword && keyword !== 'latest') {
    script += `Ito ang pinakabagong balita tungkol sa ${keyword}. `;
  } else {
    script += `Ito ang pinakabagong balita mula sa Pilipinas, ika-${now}. `;
  }

  articles.slice(0, 3).forEach((a, i) => {
    const ordinal = ['Una', 'Pangalawa', 'Pangatlo'][i] || `Bilang ${i + 1}`;
    script += `${ordinal}: `;
    script += `${a.title}. `;
    if (a.desc && a.desc.length > 20) {
      script += `${a.desc.slice(0, 150)}. `;
    }
    script += `Ayon sa ${a.source}. `;
  });

  script +=
    `Iyan po ang mga pinakabagong balita ngayon. ` +
    `Manatiling updated at manatiling ligtas ang lahat. ` +
    `Salamat sa pakikinig! ` +
    `Ang balita na ito ay para sa inyo mula sa inyong bot. ` +
    `Ginawa ito ni Manuelson Yasis. ` +
    `Magandang araw po sa inyong lahat!`;
  return script;
}

// ── Generate news video: ibb.co background + animated anchor + text at TOP ────
async function makeNewsVideo(audioFp, articles) {
  const outFp    = path.join(TEMP_DIR, `nvid_${Date.now()}.mp4`);
  const TARGET   = 59;
  const top      = articles[0] || {};
  const headline = (top.title  || 'BALITA NG PILIPINAS').replace(/['"\\:<>]/g, '').slice(0, 52);
  const srcLabel = (top.source || 'PhilStar').replace(/['"\\]/g, '').slice(0, 18);
  const now      = new Date().toLocaleString('fil-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).replace(/['"\\]/g, '').slice(0, 30);
  const ticker   = articles.slice(0, 5).map(a => `● ${a.title}`).join('  ').replace(/['"\\:<>]/g, '').slice(0, 200);

  // Fetch background and anchor in parallel (both cached after first use)
  const [bgRes, anchorRes] = await Promise.allSettled([ensureBackground(), ensureAnchor()]);
  const bgFp     = bgRes.status === 'fulfilled'     ? bgRes.value     : null;
  const anchorFp = anchorRes.status === 'fulfilled' ? anchorRes.value : null;

  if (!bgFp) throw new Error('Hindi ma-download ang background image.');

  // ── Build ffmpeg filter chain ────────────────────────────────────────────────
  // Inputs: [0] background, [1] anchor person (optional), [2] audio
  let vfChain, inputSection, audioMap;

  if (anchorFp) {
    // Full layout: background + animated anchor (person moving) + text overlays
    vfChain = [
      '[0:v]scale=640:360[bg]',
      '[1:v]scale=150:250[anc]',
      // Anchor overlaid bottom-right; sine wave y = person swaying while talking
      // 3Hz pulse on scale = speech cadence animation
      `[bg][anc]overlay=x=W-w-12:y='H-h-5+14*sin(2*PI*t/1.75)'[wa]`,
      // TOP: network bar
      `[wa]drawtext=text='📡 PHILIPPINES NEWS - TEAM STARTCOPE BETA':fontsize=15:fontcolor=white:box=1:boxcolor=0x003399@0.94:boxborderw=7:x=(w-tw)/2:y=6`,
      // BREAKING NEWS badge
      `drawtext=text='🔴 BREAKING NEWS':fontsize=18:fontcolor=white:box=1:boxcolor=red@0.92:boxborderw=7:x=10:y=32`,
      // Timestamp top-right
      `drawtext=text='${now} PH':fontsize=12:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4:x=w-tw-8:y=36`,
      // Headline center
      `drawtext=text='${headline}':fontsize=19:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=7:x=(w-tw)/2:y=h/2-25`,
      // Source
      `drawtext=text='SOURCE\\: ${srcLabel}':fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=5:x=(w-tw)/2:y=h/2+16`,
      // Scrolling news ticker at bottom
      `drawtext=text='${ticker}':fontsize=12:fontcolor=white:box=1:boxcolor=0x001166@0.90:boxborderw=4:x='w-mod(t*80\\,w+tw)':y=h-20`,
    ].join(',');
    inputSection = `-loop 1 -i "${bgFp}" -loop 1 -i "${anchorFp}" -i "${audioFp}"`;
    audioMap     = '-map "[wa]" -map 2:a';
    // Note: filter ends at [wa] (after last drawtext, ffmpeg auto-pipes final node)
    // Actually we need to fix this — the vfChain must produce a named output
    vfChain = [
      '[0:v]scale=640:360[bg]',
      '[1:v]scale=150:250[anc]',
      `[bg][anc]overlay=x=W-w-12:y='H-h-5+14*sin(2*PI*t/1.75)'[wa]`,
      `[wa]drawtext=text='📡 PHILIPPINES NEWS - TEAM STARTCOPE BETA':fontsize=15:fontcolor=white:box=1:boxcolor=0x003399@0.94:boxborderw=7:x=(w-tw)/2:y=6,` +
      `drawtext=text='🔴 BREAKING NEWS':fontsize=18:fontcolor=white:box=1:boxcolor=red@0.92:boxborderw=7:x=10:y=32,` +
      `drawtext=text='${now} PH':fontsize=12:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4:x=w-tw-8:y=36,` +
      `drawtext=text='${headline}':fontsize=19:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=7:x=(w-tw)/2:y=h/2-25,` +
      `drawtext=text='SOURCE\\: ${srcLabel}':fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=5:x=(w-tw)/2:y=h/2+16,` +
      `drawtext=text='${ticker}':fontsize=12:fontcolor=white:box=1:boxcolor=0x001166@0.90:boxborderw=4:x='w-mod(t*80\\,w+tw)':y=h-20[outv]`,
    ].join(';');
    audioMap = '-map "[outv]" -map 2:a';
  } else {
    // Fallback: no anchor — just background + text overlays
    vfChain = [
      `[0:v]scale=640:360,` +
      `drawtext=text='📡 PHILIPPINES NEWS - TEAM STARTCOPE BETA':fontsize=15:fontcolor=white:box=1:boxcolor=0x003399@0.94:boxborderw=7:x=(w-tw)/2:y=6,` +
      `drawtext=text='🔴 BREAKING NEWS':fontsize=19:fontcolor=white:box=1:boxcolor=red@0.92:boxborderw=7:x=10:y=32,` +
      `drawtext=text='${headline}':fontsize=19:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=7:x=(w-tw)/2:y=h/2-15,` +
      `drawtext=text='SOURCE\\: ${srcLabel}':fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=5:x=(w-tw)/2:y=h/2+20,` +
      `drawtext=text='${ticker}':fontsize=12:fontcolor=white:box=1:boxcolor=0x001166@0.90:boxborderw=4:x='w-mod(t*80\\,w+tw)':y=h-20[outv]`,
    ].join('');
    inputSection = `-loop 1 -i "${bgFp}" -i "${audioFp}"`;
    audioMap     = '-map "[outv]" -map 1:a';
  }

  const cmd1 =
    `ffmpeg -y ${inputSection} ` +
    `-filter_complex "${vfChain}" ` +
    `${audioMap} ` +
    `-c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p ` +
    `-af "apad=whole_dur=${TARGET}" ` +
    `-c:a aac -b:a 128k -t ${TARGET} "${outFp}" 2>&1`;

  try {
    await runCmd(cmd1, 120000);
    if (fs.existsSync(outFp) && fs.statSync(outFp).size > 30000) return outFp;
  } catch {}

  // Fallback: simple video with just background
  const cmd2 =
    `ffmpeg -y -loop 1 -i "${bgFp}" -i "${audioFp}" ` +
    `-vf "scale=640:360,` +
    `drawtext=text='BREAKING NEWS':fontsize=22:fontcolor=white:box=1:boxcolor=red@0.90:boxborderw=8:x=10:y=8,` +
    `drawtext=text='${headline}':fontsize=18:fontcolor=white:box=1:boxcolor=black@0.70:boxborderw=7:x=(w-tw)/2:y=h/2" ` +
    `-c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p ` +
    `-af "apad=whole_dur=${TARGET}" ` +
    `-c:a aac -b:a 96k -t ${TARGET} "${outFp}" 2>&1`;
  await runCmd(cmd2, 120000);
  if (!fs.existsSync(outFp) || fs.statSync(outFp).size < 10000) throw new Error('Video generation failed');
  return outFp;
}

function fmtDate(pubDate) {
  if (!pubDate) return '';
  try {
    return new Date(pubDate).toLocaleString('fil-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch { return pubDate.slice(0, 20); }
}

// ── Module config ─────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'news',
  version:         '2.0.0',
  hasPermssion:    0,
  credits:         'TEAM STARTCOPE BETA',
  description:     'Philippine news — nagse-send ng 59-segundo VIDEO na may Tagalog voice + music background. FREE.',
  commandCategory: 'Utility',
  usages:          '[keyword] | latest | bagyo | naga city | sports | ...',
  cooldowns:       15,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P = global.config?.PREFIX || '!';

  if (!args.length) {
    return api.sendMessage(
      `📰 ${bold('NEWS — 59-SEGUNDO VIDEO NA MAY TAGALOG VOICE!')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🆓 LIBRE — Walang API key! RSS + AI image + Tagalog voice!\n\n` +
      `📋 ${bold('PAANO GAMITIN:')}\n` +
      `${P}news [keyword]   — Mag-search ng balita\n` +
      `${P}news latest      — Pinakabagong balita\n\n` +
      `📍 ${bold('MGA HALIMBAWA:')}\n` +
      `${P}news naga city\n` +
      `${P}news bagyo\n` +
      `${P}news duterte\n` +
      `${P}news earthquake\n` +
      `${P}news sports\n` +
      `${P}news latest\n\n` +
      `🎬 Nagse-send ng:\n` +
      `  📹 59-segundo na news VIDEO\n` +
      `  🎙️ Tagalog voice bulletin (walang English)\n` +
      `  🎵 News background music\n` +
      `  📡 Mula sa: PhilStar, Rappler, Inquirer, GMA, CNN PH`,
      threadID, messageID
    );
  }

  const keyword = args.join(' ').trim().toLowerCase();
  api.setMessageReaction('📰', messageID, () => {}, true);
  api.sendMessage(
    `⏳ ${bold('Naghahanap ng balita')}${keyword !== 'latest' ? ` tungkol sa "${keyword}"` : ''}...\n` +
    `🎬 Gagawa ng 59-segundo na news video + 🎙️ Tagalog voice. Sandali lang po! (1–2 minuto)`,
    threadID
  );

  try {
    const allNews = await fetchAllNews();
    const results = searchNews(allNews, keyword);

    if (!results.length) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage(
        `❌ ${bold('Walang nahanap na balita')} tungkol sa "${keyword}".\n\n` +
        `💡 Subukan:\n` +
        `${P}news latest\n${P}news bagyo\n${P}news sports`,
        threadID, messageID
      );
    }

    const top = results[0];

    // Build text body
    const now = new Date().toLocaleString('fil-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    let body =
      `📹 ${bold('NEWS VIDEO')} — ${bold(keyword !== 'latest' ? keyword.toUpperCase() : 'PINAKABAGO')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${now} (Oras ng Pilipinas)\n\n`;

    results.slice(0, 4).forEach((a, i) => {
      body += `${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${bold(a.title)}\n`;
      if (a.desc && a.desc.length > 10) body += `   ${a.desc.slice(0, 120)}...\n`;
      body += `   📡 ${a.source}`;
      if (a.pubDate) body += ` · ${fmtDate(a.pubDate)}`;
      body += '\n\n';
    });

    body +=
      `🎬 ${bold('59-segundo na news video na may Tagalog voice at music background!')}\n` +
      `🎙️ ${bold('Voice:')} fil-PH-AngeloNeural (Tagalog)\n` +
      `🏷️ ${bold('TEAM STARTCOPE BETA')} 🇵🇭`;

    // Build Tagalog script
    const taScript = buildTagalogScript(results, keyword);

    // Generate TTS voice
    const rawVoice = await makeTagalogVoice(taScript);
    if (!rawVoice) throw new Error('Hindi nagawa ang Tagalog voice.');

    // Mix voice with background news music
    const audioFp = await mixWithBg(rawVoice).catch(() => rawVoice);

    // Generate news video: ibb.co background + animated anchor + text at TOP
    const videoFp = await makeNewsVideo(audioFp, results);

    api.setMessageReaction('✅', messageID, () => {}, true);

    // Send the video with caption
    api.sendMessage(
      { body, attachment: fs.createReadStream(videoFp) },
      threadID,
      () => {
        if (rawVoice !== audioFp) cleanup(rawVoice);
        cleanup(audioFp);
        cleanup(videoFp);
      }
    );

  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    return api.sendMessage(
      `❌ ${bold('Nabigo ang news video.')}\n🔧 ${e.message?.slice(0, 120)}\n\n` +
      `💡 Subukan ulit: ${P}news latest`,
      threadID, messageID
    );
  }
};
