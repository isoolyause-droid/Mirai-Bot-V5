/**
 * !news [keyword] — Search Philippine news and send image + Tagalog voice with news music
 * FREE, no API key — uses RSS feeds + Pollinations AI image + msedge-tts Tagalog voice
 *
 * Usage:
 *   !news [keyword]     — Search news by topic, sends image + Tagalog voice bulletin
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

const TEMP_DIR = path.join(process.cwd(), 'utils/data/news_temp');
fs.ensureDirSync(TEMP_DIR);

const UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const cleanup = (fp) => setTimeout(() => fs.remove(fp).catch(() => {}), 300000);

function run(cmd, ms = 45000) {
  return new Promise((res, rej) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 100, timeout: ms }, (e, _, se) =>
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
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 70000 });
  if (!data || data.byteLength < 2000) throw new Error('Image too small');
  fs.writeFileSync(fp, Buffer.from(data));
  return fp;
}

// ── Try to download article thumbnail ────────────────────────────────────────
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
  await run(cmd, 30000);
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
    await run([
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
    setTimeout(() => rej(new Error('TTS timeout')), 30000);
  });
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 500) throw new Error('TTS output empty');
  return fp;
}

// ── Build Tagalog news script ─────────────────────────────────────────────────
function buildTagalogScript(articles, keyword) {
  const now = new Date().toLocaleString('fil-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  let script = `Magandang araw po sa inyong lahat! Ito ang pinakabagong balita mula sa Pilipinas, `;
  if (keyword && keyword !== 'latest') {
    script += `tungkol sa ${keyword}. `;
  } else {
    script += `ika-${now}. `;
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

  script += `Iyan po ang mga pinakabagong balita. Manatiling ligtas ang lahat. Salamat sa pakikinig!`;
  return script;
}

// ── Format timestamp ─────────────────────────────────────────────────────────
function fmtDate(pubDate) {
  if (!pubDate) return '';
  try {
    return new Date(pubDate).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch { return pubDate.slice(0, 20); }
}

// ── Module config ─────────────────────────────────────────────────────────────
module.exports.config = {
  name:            'news',
  version:         '1.0.0',
  hasPermssion:    0,
  credits:         'TEAM STARTCOPE BETA',
  description:     'Search Philippine news — sends AI news image + Tagalog voice bulletin with background music. FREE.',
  commandCategory: 'Utility',
  usages:          '[keyword] | latest | bagyo | naga city | sports | ...',
  cooldowns:       12,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const P = global.config?.PREFIX || '!';

  if (!args.length) {
    return api.sendMessage(
      `📰 ${bold('NEWS SEARCH — TAGALOG VOICE!')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🆓 FREE — No API key! RSS + AI image + Tagalog voice!\n\n` +
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
      `🎙️ Nagse-send ng:\n` +
      `  📸 AI News Card Image\n` +
      `  🔊 Tagalog voice bulletin\n` +
      `  🎵 News background music`,
      threadID, messageID
    );
  }

  const keyword = args.join(' ').trim().toLowerCase();
  api.setMessageReaction('📰', messageID, () => {}, true);
  api.sendMessage(
    `⏳ ${bold('Naghahanap ng balita')}${keyword !== 'latest' ? ` tungkol sa "${keyword}"` : ''}...\n` +
    `📸 Gagawa ng news image + 🎙️ Tagalog voice. Sandali lang po!`,
    threadID
  );

  try {
    // ── Fetch all RSS feeds in parallel ────────────────────────────────────
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

    // ── Build text body ────────────────────────────────────────────────────
    const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    let body =
      `📰 ${bold('BALITA')} — ${bold(keyword !== 'latest' ? keyword.toUpperCase() : 'PINAKABAGO')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${now} (Oras ng Pilipinas)\n\n`;

    results.slice(0, 4).forEach((a, i) => {
      body += `${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${bold(a.title)}\n`;
      if (a.desc && a.desc.length > 10) body += `   ${a.desc.slice(0, 120)}...\n`;
      body += `   📡 ${a.source}`;
      if (a.pubDate) body += ` · ${fmtDate(a.pubDate)}`;
      body += '\n\n';
    });

    body += `🎙️ ${bold('Pakinggan ang Tagalog voice bulletin sa susunod na mensahe!')}`;

    // ── Generate image + TTS in parallel ──────────────────────────────────
    const taScript  = buildTagalogScript(results, keyword);

    const [imgResult, ttsResult] = await Promise.allSettled([
      // Image: try article thumb first, then AI generated
      (async () => {
        if (top.thumb?.startsWith('http')) {
          const th = await downloadThumb(top.thumb);
          if (th) return th;
        }
        return generateNewsImage(top.title, top.source, top.cat);
      })(),
      makeTagalogVoice(taScript),
    ]);

    const imgFp   = imgResult.status === 'fulfilled' ? imgResult.value : null;
    const rawVoice = ttsResult.status === 'fulfilled' ? ttsResult.value : null;

    // Mix voice with background news music
    const voiceFp = rawVoice ? await mixWithBg(rawVoice).catch(() => rawVoice) : null;

    api.setMessageReaction('✅', messageID, () => {}, true);

    // ── Send image + text ─────────────────────────────────────────────────
    if (imgFp) {
      await new Promise(r =>
        api.sendMessage({ body, attachment: fs.createReadStream(imgFp) }, threadID, r)
      );
      cleanup(imgFp);
    } else {
      await new Promise(r => api.sendMessage(body, threadID, r));
    }

    // ── Send Tagalog voice bulletin with background music ─────────────────
    if (voiceFp) {
      api.sendMessage(
        {
          body:
            `🎙️ ${bold('TAGALOG VOICE BULLETIN')} 📻\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎵 May kasamang news background music!\n` +
            `🗣️ Voice: fil-PH-AngeloNeural (Tagalog Male)\n` +
            `📡 Source: PhilStar · Rappler · Inquirer · GMA · CNN PH`,
          attachment: fs.createReadStream(voiceFp),
        },
        threadID,
        () => cleanup(voiceFp)
      );
    }

  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    return api.sendMessage(
      `❌ ${bold('News search failed.')}\n🔧 ${e.message?.slice(0, 120)}\n\n` +
      `💡 Subukan ulit: ${P}news latest`,
      threadID, messageID
    );
  }
};
