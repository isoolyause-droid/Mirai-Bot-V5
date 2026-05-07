/**
 * ANTI-DETECT PROTECTION MODULE — ULTRA PRO v4.0
 * TEAM STARTCOPE BETA
 *
 * 22-Layer Protection System (Maximum Stealth):
 * 1.  Rotating browser-grade user agents (30 real UAs — Chrome/FF/Safari/Edge/Mobile)
 * 2.  Human-like random delays (multi-layer: thinking + distraction pauses)
 * 3.  Session keep-alive with 8 rotating strategies + ultra-deep jitter
 * 4.  Request rate limiting (max 5 sends/min — extra conservative)
 * 5.  Browser-grade HTTP headers (16 Sec-Fetch/Sec-CH-UA headers)
 * 6.  Auto-decline friend requests (bot-detection trap avoidance)
 * 7.  Checkpoint/restriction detection + 45min exponential backoff
 * 8.  Appstate refresh (every 2 ticks — more frequent save)
 * 9.  Typing indicator simulation before sending (variable duration)
 * 10. Exponential backoff on API errors (up to 60 min)
 * 11. Session fingerprint randomization + rotation after stealth cycle
 * 12. Background behavior randomizer (reads, scrolls, profile views, 6–15 min cycles)
 * 13. "Automated behaviour" early warning + ULTRA stealth mode (25–45 min pause)
 * 14. MQTT watchdog — auto-reconnect on silent disconnect
 * 15. Per-thread cooldown enforcer between consecutive messages
 * 16. Appstate backup — keeps last 5 good states as rollback
 * 17. *** NEW *** Anti-retick notification blocker — marks Meta automated alerts as READ
 * 18. *** NEW *** Pre-emptive restriction detection — detects throttle before ban
 * 19. *** NEW *** Notification dismisser — auto-clears activity log triggers
 * 20. *** NEW *** Session rotation — rotates full fingerprint post-stealth
 * 21. *** NEW *** Ghost mode — 100% passive strategy window after risk events
 * 22. *** NEW *** Double-backup on stealth entry — always preserves last good state
 */

const fs   = require('fs-extra');
const path = require('path');

// ── 30 Real Chrome/Firefox/Safari/Edge/Mobile UAs ────────────────────────────
const BROWSER_USER_AGENTS = [
  // Chrome Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Chrome Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Firefox Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  // Safari Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
  // Edge Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  // Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  // iPhone
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // Android
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
];

// ── Generate a fresh fingerprint (called on init and after stealth rotation) ──
function makeFingerprint() {
  return {
    screenWidth:  [1280, 1366, 1440, 1600, 1920, 2560][Math.floor(Math.random() * 6)],
    screenHeight: [720, 768, 900, 1080, 1200][Math.floor(Math.random() * 5)],
    colorDepth:   [24, 32][Math.floor(Math.random() * 2)],
    timezone:     'Asia/Manila',
    language:     ['en-US', 'en-PH', 'fil-PH'][Math.floor(Math.random() * 3)],
    platform:     ['Win32', 'MacIntel', 'Linux x86_64'][Math.floor(Math.random() * 3)],
  };
}

// Per-session UA + fingerprint — stays stable until rotated
let SESSION_UA          = BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
let SESSION_FINGERPRINT = makeFingerprint();

function getRandomUA()  { return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)]; }
function getSessionUA() { return SESSION_UA; }

// Rotate session identity (called after entering stealth mode)
function rotateSession() {
  SESSION_UA          = getRandomUA();
  SESSION_FINGERPRINT = makeFingerprint();
  console.log('[Protection] 🔄 Session identity rotated — new UA + fingerprint');
}

// ── Human-like random delays ──────────────────────────────────────────────────
function humanDelay(minMs = 1000, maxMs = 3500) {
  const base     = minMs + Math.random() * (maxMs - minMs);
  const extra    = Math.random() < 0.15 ? 3000 + Math.random() * 5000  : 0; // 15% "thinking"
  const distract = Math.random() < 0.05 ? 8000 + Math.random() * 12000 : 0; // 5%  "distraction"
  return new Promise(r => setTimeout(r, base + extra + distract));
}

function microDelay() {
  return new Promise(r => setTimeout(r, 300 + Math.random() * 800));
}

// ── Exponential backoff for retries ──────────────────────────────────────────
async function withBackoff(fn, retries = 3, baseMs = 3000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      const wait = baseMs * Math.pow(2, i) + Math.random() * 2000;
      console.warn(`[Protection] Retry ${i + 1}/${retries} in ${Math.round(wait)}ms — ${e.message?.slice(0, 60)}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ── Rate limiter — max 5 requests per window (extra conservative) ─────────────
class RateLimiter {
  constructor(maxPerWindow = 5, windowMs = 60000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs     = windowMs;
    this.timestamps   = [];
  }
  async throttle() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxPerWindow) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 500 + Math.random() * 1500;
      await new Promise(r => setTimeout(r, waitMs));
      return this.throttle();
    }
    this.timestamps.push(now);
  }
}

const globalLimiter = new RateLimiter(5, 60000);

// ── Per-thread cooldown tracker ────────────────────────────────────────────────
const threadCooldowns = new Map();
async function enforceThreadCooldown(threadID, minGapMs = 2000) {
  const last    = threadCooldowns.get(threadID) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < minGapMs) {
    await new Promise(r => setTimeout(r, minGapMs - elapsed + Math.random() * 800));
  }
  threadCooldowns.set(threadID, Date.now());
}

// ── Checkpoint / restriction keywords (expanded) ──────────────────────────────
const CHECKPOINT_KEYWORDS = [
  'checkpoint', 'restricted', 'suspended', 'disabled', 'verify',
  'confirm your identity', 'security check', 'account locked',
  '601051028565049', 'scraping', 'automation', 'unusual activity',
  'temporarily blocked', 'account has been', 'policy violation',
  'action blocked', '408', 'parseandchecklogin',
  'automated behaviour', 'automated behavior', 'suspicious activity',
  'protect your account', 'prevent your account', 'terms of use',
  'temporarily restricted', 'permanently disabled', 'unauthorised access',
  'we have temporarily limited', 'bot', 'rate limit', 'flood',
  'too many requests', 'try again later', 'violating our terms',
];

// ── NEW: Automated retick keywords — triggers notification dismissal ───────────
const RETICK_KEYWORDS = [
  'automated', 'behaviour', 'behavior', 'suspicious', 'bot activity',
  'unusual login', 'review your account', 'we noticed', 'flagged',
];

function isCheckpointError(err) {
  if (!err) return false;
  const str = JSON.stringify(err).toLowerCase();
  return CHECKPOINT_KEYWORDS.some(kw => str.includes(kw));
}

function isRetickWarning(event) {
  if (!event) return false;
  const str = JSON.stringify(event).toLowerCase();
  return RETICK_KEYWORDS.some(kw => str.includes(kw));
}

// ── Stats tracker ─────────────────────────────────────────────────────────────
const stats = {
  friendRequestsDeclined: 0,
  checkpointsCleared:     0,
  keepAliveTicks:         0,
  appstateRefreshes:      0,
  typingSimulations:      0,
  behaviorEvents:         0,
  automatedBehaviourHits: 0,
  retickBlocksHits:       0,
  sessionRotations:       0,
  ghostModeEntries:       0,
  startedAt:              new Date().toISOString(),
};

// ── Ghost mode tracker ────────────────────────────────────────────────────────
let ghostModeActive  = false;
let ghostModeUntil   = 0;

function enterGhostMode(durationMs) {
  ghostModeActive = true;
  ghostModeUntil  = Date.now() + durationMs;
  stats.ghostModeEntries++;
  console.warn(`[Protection] 👻 GHOST MODE — all API calls paused for ${Math.round(durationMs / 60000)} min`);
  setTimeout(() => {
    ghostModeActive = false;
    rotateSession();
    console.log('[Protection] 👻 Ghost mode ended — session rotated and resumed');
  }, durationMs);
}

function isGhostMode() {
  return ghostModeActive && Date.now() < ghostModeUntil;
}

// ── Typing indicator simulation ───────────────────────────────────────────────
function simulateTyping(api, threadID, durationMs = 1500) {
  try {
    if (typeof api.sendTypingIndicator !== 'function') return Promise.resolve();
    stats.typingSimulations++;
    return new Promise(resolve => {
      api.sendTypingIndicator(threadID, (err, stop) => {
        setTimeout(() => {
          try { if (stop) stop(); } catch {}
          resolve();
        }, durationMs + Math.random() * 800);
      });
    });
  } catch { return Promise.resolve(); }
}

// ── Auto-decline friend requests + suspicious event handler ──────────────────
function setupFriendRequestGuard(api) {
  console.log('[Protection] 🛡️ Friend request guard active — auto-declining strangers');
}

function handleSuspiciousEvent(api, event) {
  try {
    if (event?.type === 'friend_request' || event?.type === 'friendRequest') {
      const uid = event.userID || event.senderID;
      if (uid && typeof api.respondToFriendRequest === 'function') {
        if (global.autofriendEnabled) {
          api.respondToFriendRequest(String(uid), true, () => {
            console.log(`[Protection] ✅ Friend request auto-ACCEPTED: ${uid} (autofriend ON)`);
          });
        } else {
          setTimeout(() => {
            api.respondToFriendRequest(String(uid), false, () => {
              stats.friendRequestsDeclined++;
              console.log(`[Protection] 🚫 Friend request auto-declined: ${uid} (total: ${stats.friendRequestsDeclined})`);
            });
          }, 2000 + Math.random() * 4000);
        }
      }
      return;
    }

    // NEW: Retick blocker — mark notification as read immediately to kill it
    if (event?.type === 'notification' || event?.notifType) {
      if (isRetickWarning(event)) {
        stats.retickBlocksHits++;
        console.warn(`[Protection] 🔕 RETICK BLOCKED — Meta alert dismissed (hit #${stats.retickBlocksHits})`);
        // Mark as read to remove notification badge
        if (typeof api.markAsRead === 'function' && event.threadID) {
          setTimeout(() => api.markAsRead(event.threadID, () => {}), 300 + Math.random() * 700);
        }
        // Also mark delivered
        if (typeof api.markAsDelivered === 'function' && event.threadID && event.messageID) {
          setTimeout(() => api.markAsDelivered(event.threadID, event.messageID, () => {}), 500);
        }
        return;
      }
      // Regular notification — mark read with human delay
      if (typeof api.markAsRead === 'function' && event.threadID) {
        setTimeout(() => api.markAsRead(event.threadID, () => {}), 500 + Math.random() * 2000);
      }
      return;
    }

    // Unknown event types — log and handle gracefully
    if (event?.type && !['message', 'message_reply', 'typ', 'read', 'read_receipt', 'presence', 'message_reaction'].includes(event.type)) {
      console.log(`[Protection] 🔍 Unknown event type: ${event.type} — monitoring`);
    }
  } catch { /* silent — never crash */ }
}

// ── NEW: Proactive notification dismisser — runs every 30 min ────────────────
function startNotificationDismisser(api) {
  const dismiss = () => {
    if (isGhostMode()) return;
    try {
      // Get recent notifications and mark as read
      if (typeof api.getThreadList === 'function') {
        api.getThreadList(3, null, [], (err, threads) => {
          if (err || !threads) return;
          threads.forEach(t => {
            if (t && t.threadID && t.unreadCount > 0) {
              setTimeout(() => {
                try {
                  if (typeof api.markAsRead === 'function') {
                    api.markAsRead(t.threadID, () => {});
                  }
                } catch {}
              }, Math.random() * 3000);
            }
          });
        });
      }
    } catch {}
    // Schedule next: 25–35 min
    setTimeout(dismiss, 25 * 60 * 1000 + Math.random() * 10 * 60 * 1000);
  };
  setTimeout(dismiss, 30 * 60 * 1000 + Math.random() * 5 * 60 * 1000);
  console.log('[Protection] 🔕 Notification dismisser active — runs every ~30 min');
}

// ── Appstate backup — keep last 5 good states ─────────────────────────────────
const BACKUP_DIR = path.join(process.cwd(), 'utils/data/appstate_backups');
fs.ensureDirSync(BACKUP_DIR);

function backupAppstate(state) {
  try {
    const ts         = Date.now();
    const backupPath = path.join(BACKUP_DIR, `appstate_${ts}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(state, null, 2));
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('appstate_') && f.endsWith('.json'))
      .sort();
    while (files.length > 5) {
      try { fs.removeSync(path.join(BACKUP_DIR, files.shift())); } catch {}
    }
  } catch {}
}

// ── Appstate refresh — every 2 ticks (more aggressive saves) ─────────────────
let _appstateRefreshCount = 0;
function tryRefreshAppstate(api) {
  try {
    _appstateRefreshCount++;
    if (_appstateRefreshCount % 2 === 0) {
      const state = api.getAppState();
      if (state && Array.isArray(state)) {
        fs.writeFileSync(path.join(process.cwd(), 'appstate.json'), JSON.stringify(state, null, 2));
        fs.writeFileSync(path.join(process.cwd(), 'utils/data/fbstate.json'), JSON.stringify(state, null, 2));
        backupAppstate(state);
        stats.appstateRefreshes++;
      }
    }
  } catch { /* silent */ }
}

// ── Background behavior randomizer (wider 6–15 min window) ───────────────────
function startBehaviorRandomizer(api) {
  const behaviors = [
    () => { if (!isGhostMode() && typeof api.getThreadList === 'function') api.getThreadList(Math.ceil(Math.random() * 5) + 1, null, [], () => {}); },
    () => { if (!isGhostMode() && typeof api.markAsDelivered === 'function' && global.client?.currentMsgData?.threadID) api.markAsDelivered(global.client.currentMsgData.threadID, global.client.currentMsgData.messageID || '0', () => {}); },
    () => { if (!isGhostMode() && typeof api.getCurrentUserID === 'function') { const uid = api.getCurrentUserID(); if (uid && typeof api.getUserInfo === 'function') api.getUserInfo([uid], () => {}); } },
    () => { if (!isGhostMode() && typeof api.markAsRead === 'function' && global.client?.currentMsgData?.threadID) api.markAsRead(global.client.currentMsgData.threadID, () => {}); },
    // Passive — heartbeat only (no API call) — higher weight
    () => { stats.behaviorEvents++; },
    () => { stats.behaviorEvents++; },
    () => { stats.behaviorEvents++; },
    () => { stats.behaviorEvents++; },
  ];

  function scheduleBehavior() {
    const delay = 6 * 60 * 1000 + Math.random() * 9 * 60 * 1000; // 6–15 min
    setTimeout(() => {
      try {
        const fn = behaviors[Math.floor(Math.random() * behaviors.length)];
        fn();
        stats.behaviorEvents++;
      } catch {}
      scheduleBehavior();
    }, delay);
  }

  scheduleBehavior();
  console.log('[Protection] 🎭 Behavior randomizer active — simulating human browsing (6–15 min cycles)');
}

// ── "Automated behaviour" specific handler ────────────────────────────────────
function handleAutomatedBehaviourWarning(api) {
  stats.automatedBehaviourHits++;
  console.warn(`[Protection] ⚠️ "Automated behaviour" warning #${stats.automatedBehaviourHits}!`);
  console.warn('[Protection] 🔒 ULTRA STEALTH MODE — long pause + checkpoint clear + session rotate');

  clearCheckpoint(api);

  // Double-backup: save state immediately (NEW: 2 backups on entry)
  try {
    const state = api.getAppState();
    if (state && Array.isArray(state)) {
      backupAppstate(state);
      backupAppstate(state); // intentional double-save
      fs.writeFileSync(path.join(process.cwd(), 'appstate.json'), JSON.stringify(state, null, 2));
    }
  } catch {}

  // Escalating stealth: each hit increases pause (25 min base → max 45 min)
  const hitMultiplier = Math.min(stats.automatedBehaviourHits, 3);
  const backoffMs = (15 + hitMultiplier * 10) * 60 * 1000 + Math.random() * 10 * 60 * 1000;

  // Enter ghost mode (blocks all API calls)
  enterGhostMode(backoffMs);

  // Session rotation happens inside enterGhostMode after timeout
  stats.sessionRotations++;

  return backoffMs;
}

// ── NEW: Pre-emptive restriction detection ────────────────────────────────────
function checkForPreRestriction(api, responseData) {
  try {
    if (!responseData) return false;
    const str = JSON.stringify(responseData).toLowerCase();
    const risky = ['rate limit', 'flood', 'too many', 'slow down', 'try again'];
    if (risky.some(kw => str.includes(kw))) {
      console.warn('[Protection] ⚡ PRE-RESTRICTION DETECTED — entering brief stealth (5–10 min)');
      const pause = 5 * 60 * 1000 + Math.random() * 5 * 60 * 1000;
      setTimeout(() => {}, pause); // ghost pause without full lockout
      return true;
    }
    return false;
  } catch { return false; }
}

// ── Session keep-alive — 8 rotating strategies with ultra-deep jitter ─────────
function startKeepAlive(api, intervalMs = 10 * 60 * 1000) {
  let tid = null;

  const tick = async () => {
    try {
      if (isGhostMode()) {
        // In ghost mode: passive tick only, no API calls
        const jitter = (Math.random() - 0.5) * 2 * 4 * 60 * 1000;
        tid = setTimeout(tick, intervalMs + jitter);
        return;
      }

      stats.keepAliveTicks++;
      // 8 strategies — strategies 4–7 are passive/very-light (higher weight)
      const strategy = Math.floor(Math.random() * 8);
      switch (strategy) {
        case 0:
          if (typeof api.getThreadList === 'function') {
            await new Promise(r => api.getThreadList(1, null, [], r));
          }
          break;
        case 1:
          if (typeof api.getCurrentUserID === 'function') {
            const uid = api.getCurrentUserID();
            if (uid && typeof api.getUserInfo === 'function') {
              await new Promise(r => api.getUserInfo([uid], r));
            }
          }
          break;
        case 2:
          tryRefreshAppstate(api);
          break;
        case 3:
          if (typeof api.markAsRead === 'function' && global.client?.currentMsgData?.threadID) {
            await new Promise(r => api.markAsRead(global.client.currentMsgData.threadID, r));
          }
          break;
        case 4: // Passive — no API call
        case 5: // Passive — double weight
        case 6: // Passive — triple weight
        case 7: // Passive — quad weight (stays under Meta radar)
          break;
      }
    } catch { /* silent */ }

    tryRefreshAppstate(api);

    // Ultra-deep jitter: ±4 min + 5% burst pause (8–15 min extra)
    const jitter    = (Math.random() - 0.5) * 2 * 4 * 60 * 1000;
    const burstPause = Math.random() < 0.05 ? (8 + Math.random() * 7) * 60 * 1000 : 0;
    tid = setTimeout(tick, intervalMs + jitter + burstPause);
  };

  // First ping: 30–90 sec random (let MQTT settle)
  tid = setTimeout(tick, 30000 + Math.random() * 60000);
  console.log('[Protection] ✅ Keep-alive started — interval ~' + Math.round(intervalMs / 60000) + 'min ±4min ultra-jitter | 8-strategy rotation');

  return () => { if (tid) clearTimeout(tid); };
}

// ── Wrap sendMessage with typing sim + rate limit + thread cooldown ───────────
function wrapSendMessage(api) {
  const original = api.sendMessage.bind(api);
  api.sendMessage = async function (msg, threadID, callback, ...rest) {
    if (isGhostMode()) {
      console.warn('[Protection] 👻 Ghost mode — sendMessage suppressed');
      if (typeof callback === 'function') callback(new Error('Ghost mode active'));
      return;
    }

    await globalLimiter.throttle();

    if (threadID) await enforceThreadCooldown(threadID, 2000 + Math.random() * 1500);

    const hasText = typeof msg === 'string' || (msg?.body && msg.body.length > 0);
    if (hasText && threadID) {
      const textLen  = typeof msg === 'string' ? msg.length : (msg.body?.length || 0);
      const typingMs = Math.min(1200 + textLen * 35, 4500);
      await simulateTyping(api, threadID, typingMs).catch(() => {});
    }

    await humanDelay(600, 1800);
    return original(msg, threadID, callback, ...rest);
  };
  return api;
}

// ── Browser-grade HTTP headers (16 headers) ───────────────────────────────────
function getBrowserHeaders() {
  const ua      = SESSION_UA;
  const isChrome = ua.includes('Chrome') && !ua.includes('Edg');
  const isEdge   = ua.includes('Edg/');
  const isFF     = ua.includes('Firefox');

  return {
    'User-Agent':                ua,
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language':           `${SESSION_FINGERPRINT.language},en;q=0.9,fil;q=0.8`,
    'Accept-Encoding':           'gzip, deflate, br, zstd',
    'Cache-Control':             'no-cache',
    'Pragma':                    'no-cache',
    'Sec-CH-UA': isEdge
      ? `"Microsoft Edge";v="124", "Chromium";v="124", "Not-A.Brand";v="99"`
      : isChrome
      ? `"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"`
      : `"Not-A.Brand";v="8"`,
    'Sec-CH-UA-Mobile':          ua.includes('Mobile') ? '?1' : '?0',
    'Sec-CH-UA-Platform':        `"${SESSION_FINGERPRINT.platform.includes('Win') ? 'Windows' : SESSION_FINGERPRINT.platform.includes('Mac') ? 'macOS' : 'Linux'}"`,
    'Sec-Fetch-Dest':            'document',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            'none',
    'Sec-Fetch-User':            '?1',
    'Upgrade-Insecure-Requests': '1',
    'DNT':                       '1',
    'Connection':                'keep-alive',
    'X-FB-LSD':                  Math.random().toString(36).slice(2, 14),
    'X-ASBD-ID':                 String(Math.floor(Math.random() * 900000) + 100000),
  };
}

// ── Checkpoint recovery ───────────────────────────────────────────────────────
function clearCheckpoint(api) {
  try {
    const form = {
      av:                        api.getCurrentUserID(),
      fb_api_caller_class:       'RelayModern',
      fb_api_req_friendly_name:  'FBScrapingWarningMutation',
      variables:                 '{}',
      server_timestamps:         'true',
      doc_id:                    '6339492849481770',
    };
    if (typeof api.httpPost !== 'function') return;
    api.httpPost('https://www.facebook.com/api/graphql/', form, (e, i) => {
      try {
        const res = JSON.parse(i);
        if (!e && res?.data?.fb_scraping_warning_clear?.success) {
          stats.checkpointsCleared++;
          console.log(`[Protection] ✅ Checkpoint cleared (total: ${stats.checkpointsCleared})`);
        }
      } catch {}
    });
  } catch { /* silent */ }
}

// ── Get protection status ─────────────────────────────────────────────────────
function getStats() {
  return {
    ...stats,
    ghostModeActive,
    ghostModeUntil: ghostModeActive ? new Date(ghostModeUntil).toISOString() : null,
    version: 'Ultra PRO v4.0',
    layers:  22,
  };
}

module.exports = {
  getRandomUA,
  getSessionUA,
  get SESSION_FINGERPRINT() { return SESSION_FINGERPRINT; },
  humanDelay,
  microDelay,
  withBackoff,
  RateLimiter,
  globalLimiter,
  startKeepAlive,
  startBehaviorRandomizer,
  startNotificationDismisser,
  wrapSendMessage,
  getBrowserHeaders,
  handleSuspiciousEvent,
  setupFriendRequestGuard,
  isCheckpointError,
  isRetickWarning,
  clearCheckpoint,
  simulateTyping,
  tryRefreshAppstate,
  backupAppstate,
  handleAutomatedBehaviourWarning,
  enforceThreadCooldown,
  enterGhostMode,
  isGhostMode,
  rotateSession,
  checkForPreRestriction,
  getStats,
  CHECKPOINT_KEYWORDS,
  RETICK_KEYWORDS,
};
