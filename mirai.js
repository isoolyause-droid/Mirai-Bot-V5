const { readdirSync, readFileSync, writeFileSync, existsSync } = require("fs-extra");
const { join } = require("path");
const logger = require("./utils/log.js");
const login = require('stfca');
const fs = require('fs-extra');
const moment = require('moment-timezone');

if (!fs.existsSync('./utils/data')) {
  fs.mkdirSync('./utils/data', { recursive: true });
}

global.client = {
  commands: new Map(),
  events: new Map(),
  cooldowns: new Map(),
  eventRegistered: [],
  handleReaction: [],
  handleReply: [],
  mainPath: process.cwd(),
  configPath: "",
  getTime: option => moment.tz("Asia/Ho_Chi_Minh").format({
    seconds: "ss",
    minutes: "mm",
    hours: "HH",
    date: "DD",
    month: "MM",
    year: "YYYY",
    fullHour: "HH:mm:ss",
    fullYear: "DD/MM/YYYY",
    fullTime: "HH:mm:ss DD/MM/YYYY"
  }[option])
};

global.data = new Object({
  threadInfo: new Map(),
  threadData: new Map(),
  userName: new Map(),
  userBanned: new Map(),
  threadBanned: new Map(),
  commandBanned: new Map(),
  threadAllowNSFW: new Array(),
  allUserID: new Array(),
  allCurrenciesID: new Array(),
  allThreadID: new Array()
});

global.utils = require("./utils/func");
global.config = require('./config.json');
global.configModule = new Object();
global.moduleData = new Array();
global.language = new Object();

const langFile = (readFileSync(`${__dirname}/languages/${global.config.language || "en"}.lang`, { encoding: 'utf-8' })).split(/\r?\n|\r/);
const langData = langFile.filter(item => item.indexOf('#') != 0 && item != '');
for (const item of langData) {
  const getSeparator = item.indexOf('=');
  const itemKey = item.slice(0, getSeparator);
  const itemValue = item.slice(getSeparator + 1, item.length);
  const head = itemKey.slice(0, itemKey.indexOf('.'));
  const key = itemKey.replace(head + '.', '');
  const value = itemValue.replace(/\\n/gi, '\n');
  if (typeof global.language[head] == "undefined") global.language[head] = new Object();
  global.language[head][key] = value;
}

global.getText = function (...args) {
  const langText = global.language;
  if (!langText.hasOwnProperty(args[0])) throw `${__filename} - Language key not found: ${args[0]}`;
  var text = langText[args[0]][args[1]];
  for (var i = args.length - 1; i > 0; i--) {
    const regEx = RegExp(`%${i}`, 'g');
    text = text.replace(regEx, args[i + 1]);
  }
  return text;
};

function loadAppState() {
  // ── Priority 1: APPSTATE environment variable (for cloud hosting) ──────────
  // On Render/Railway/Heroku: set env var APPSTATE = <contents of appstate.json>
  if (process.env.APPSTATE) {
    try {
      const appState = JSON.parse(process.env.APPSTATE);
      if (Array.isArray(appState) && appState.length > 0) {
        logger('APPSTATE env var found — using it to login', '[ LOGIN ] >');
        // Write to disk so the API can refresh/save it
        try { writeFileSync('./appstate.json', JSON.stringify(appState, null, 2)); } catch {}
        return { appState };
      }
    } catch (e) {
      logger('Invalid APPSTATE env var: ' + e.message, '[ LOGIN ] >');
    }
  }

  // ── Priority 2: COOKIE environment variable ─────────────────────────────────
  if (process.env.FB_COOKIE) {
    try {
      logger('FB_COOKIE env var found — using it to login', '[ LOGIN ] >');
      const cookies = global.utils.parseCookies(process.env.FB_COOKIE);
      return { appState: cookies };
    } catch (e) {
      logger('Invalid FB_COOKIE env var: ' + e.message, '[ LOGIN ] >');
    }
  }

  // ── Priority 3: appstate.json file ─────────────────────────────────────────
  if (existsSync('./appstate.json')) {
    try {
      const appState = JSON.parse(readFileSync('./appstate.json', 'utf8'));
      if (Array.isArray(appState) && appState.length > 0) {
        logger('Found appstate.json — using it to login', '[ LOGIN ] >');
        return { appState };
      }
    } catch (e) {
      logger('Failed to parse appstate.json: ' + e.message, '[ LOGIN ] >');
    }
  }

  // ── Priority 4: cookie.txt file ─────────────────────────────────────────────
  if (existsSync('./cookie.txt')) {
    logger('Found cookie.txt — using it to login', '[ LOGIN ] >');
    const cookies = global.utils.parseCookies(readFileSync('./cookie.txt', 'utf8'));
    return { appState: cookies };
  }

  throw new Error(
    'No login credentials found!\n' +
    '  On Render/Railway: set env var APPSTATE = <your appstate.json contents>\n' +
    '  Locally: add appstate.json or cookie.txt to the project root'
  );
}

function onBot({ models }) {
  let loginOptions;
  try {
    loginOptions = loadAppState();
  } catch (e) {
    logger(e.message, '[ ERROR ] >');
    process.exit(1);
  }

  login(loginOptions, async (loginError, api) => {
    if (loginError) {
      logger('Login failed: ' + JSON.stringify(loginError), '[ ERROR ] >');
      return;
    }

    api.setOptions(global.config.FCAOption);
    writeFileSync('./appstate.json', JSON.stringify(api.getAppState(), null, 2));
    writeFileSync('./utils/data/fbstate.json', JSON.stringify(api.getAppState(), null, 2));

    // ── ANTI-DETECT PROTECTION ULTRA PRO v4.0 ─────────────────────────────
    // 22-layer protection: keep-alive, UA rotation, retick blocker,
    // ghost mode, checkpoint clear, session fingerprint rotation,
    // notification dismisser, behavior randomizer, appstate backup.
    const protection = require('./utils/protection');
    protection.startKeepAlive(api, 10 * 60 * 1000);      // ping every ~10 min ± 4min ultra-jitter
    protection.setupFriendRequestGuard(api);               // guard against FR traps
    protection.startBehaviorRandomizer(api);               // simulate human browsing (6–15 min)
    protection.startNotificationDismisser(api);            // auto-clear Meta notification reticks
    // Store protection on global for access in all modules
    global.protection = protection;
    // ────────────────────────────────────────────────────────────────────────

    global.config.version = '3.0.0';
    global.client.timeStart = new Date().getTime();
    global.client.api = api;

    const userId = api.getCurrentUserID();
    const user = await api.getUserInfo([userId]);
    const userName = user[userId]?.name || null;
    logger(`Login successful - ${userName} (${userId})`, '[ LOGIN ] >');

    console.log(require('chalk').yellow(
      " __  __ ___ ____      _    ___      ____   ___ _____  __     _______\n" +
      "|  \\/  |_ _|  _ \\    / \\  |_ _|    | __ ) / _ \\_   _| \\ \\   / /___ / \n" +
      "| |\\/| || || |_) |  / _ \\  | |_____|  _ \\| | | || |____\\ \\ / /  |_ \\ \n" +
      "| |  | || ||  _ <  / ___ \\ | |_____| |_) | |_| || |_____\\ V /  ___) |\n" +
      "|_|  |_|___|_| \\_\\/_/   \\_\\___|    |____/ \\___/ |_|      \\_/  |____/ \n"
    ));

    (function () {
      const loadModules = (path, collection, disabledList, type) => {
        const items = readdirSync(path).filter(file => file.endsWith('.js') && !file.includes('example') && !disabledList.includes(file));
        let loadedCount = 0;
        for (const file of items) {
          try {
            const item = require(join(path, file));
            const { config, run, onLoad, handleEvent } = item;
            if (!config || !run || (type === 'commands' && !config.commandCategory)) {
              throw new Error(`Invalid format in ${type === 'commands' ? 'command' : 'event'}: ${file}`);
            }
            if (global.client[collection].has(config.name)) {
              throw new Error(`Duplicate ${type === 'commands' ? 'command' : 'event'} name: ${config.name}`);
            }
            if (config.envConfig) {
              global.configModule[config.name] = global.configModule[config.name] || {};
              global.config[config.name] = global.config[config.name] || {};
              for (const key in config.envConfig) {
                global.configModule[config.name][key] = global.config[config.name][key] || config.envConfig[key] || '';
                global.config[config.name][key] = global.configModule[config.name][key];
              }
            }
            if (onLoad) onLoad({ api, models });
            if (handleEvent) global.client.eventRegistered.push(config.name);
            global.client[collection].set(config.name, item);
            loadedCount++;
          } catch (error) {
            console.error(`Error loading ${type === 'commands' ? 'command' : 'event'} ${file}:`, error);
          }
        }
        if (loadedCount === 0) {
          console.log(`No ${type === 'commands' ? 'commands' : 'events'} found in ${path}`);
        }
        return loadedCount;
      };

      const commandPath = join(global.client.mainPath, 'modules', 'commands');
      const eventPath = join(global.client.mainPath, 'modules', 'events');
      const loadedCommandsCount = loadModules(commandPath, 'commands', global.config.commandDisabled, 'commands');
      logger.loader(`Loaded ${loadedCommandsCount} commands`);
      const loadedEventsCount = loadModules(eventPath, 'events', global.config.eventDisabled, 'events');
      logger.loader(`Loaded ${loadedEventsCount} events`);
    })();

    logger.loader('Startup ping: ' + (Date.now() - global.client.timeStart) + 'ms');
    writeFileSync('./config.json', JSON.stringify(global.config, null, 4), 'utf8');

    const listener = require('./includes/listen')({ api, models });

    function listenerCallback(error, event) {
      if (error) {
        const errStr = JSON.stringify(error).toLowerCase();

        // ── "Automated behaviour" / checkpoint — strongest response ──────────
        const isAutomated = errStr.includes('automated behaviour') ||
          errStr.includes('automated behavior') ||
          errStr.includes('prevent your account') ||
          errStr.includes('temporarily restricted') ||
          errStr.includes('terms of use') ||
          errStr.includes('unauthorised access');

        const isCheckpoint = errStr.includes('601051028565049') || errStr.includes('scraping');

        if (isAutomated) {
          logger('⚠️ "Automated behaviour" warning from Meta — entering stealth mode!', '[ PROTECTION ]');
          const backoffMs = global.protection?.handleAutomatedBehaviourWarning
            ? global.protection.handleAutomatedBehaviourWarning(api)
            : 20 * 60 * 1000;
          logger(`🔒 Pausing MQTT for ${Math.round(backoffMs / 60000)} min then reconnecting...`, '[ PROTECTION ]');
          setTimeout(() => {
            global.handleListen = api.listenMqtt(listenerCallback);
            logger('🔄 MQTT reconnected after automated-behaviour backoff.', '[ PROTECTION ]');
          }, backoffMs);
          return;
        }

        if (isCheckpoint) {
          const form = {
            av: api.getCurrentUserID(),
            fb_api_caller_class: "RelayModern",
            fb_api_req_friendly_name: "FBScrapingWarningMutation",
            variables: "{}",
            server_timestamps: "true",
            doc_id: "6339492849481770",
          };
          api.httpPost("https://www.facebook.com/api/graphql/", form, (e, i) => {
            try {
              const res = JSON.parse(i);
              if (e || res.errors) return logger("Failed to clear Facebook warning.", "error");
              if (res.data.fb_scraping_warning_clear.success) {
                logger("Facebook warning cleared successfully.", "[ SUCCESS ] >");
                global.handleListen = api.listenMqtt(listenerCallback);
                logger(global.getText('mirai', 'successConnectMQTT'), '[ MQTT ]');
              }
            } catch {}
          });
          return;
        }

        return logger(global.getText("mirai", "handleListenError", JSON.stringify(error)), "error");
      }
      if (["presence", "typ", "read_receipt"].some((data) => data === event?.type)) return;
      if (global.config.DeveloperMode) console.log(event);
      return listener(event);
    }

    function connect_mqtt() {
      global.handleListen = api.listenMqtt(listenerCallback);
      logger(global.getText('mirai', 'successConnectMQTT'), '[ MQTT ]');
    }

    connect_mqtt();
  });
}

(async () => {
  try {
    const { Sequelize, sequelize } = require("./includes/database");
    await sequelize.authenticate();
    const models = require('./includes/database/model')({ Sequelize, sequelize });
    logger(global.getText('mirai', 'successConnectDatabase'), '[ DATABASE ]');
    onBot({ models });
  } catch (error) {
    console.log(error);
  }
})();

process.on("unhandledRejection", (err, p) => { console.log(p); });
