#!/usr/bin/env node
/**
 * FGC Open Scorebars — Ultra-Lightweight Zero-Dependency Local Server
 * Uses only Node.js built-in modules (~15MB RAM, <5ms SSE latency).
 *
 * Serves:
 *   GET  /             -> index.html (OBS Browser Source 1920x1080)
 *   GET  /panel        -> panel.html (Local Control Panel + OBS Custom Dock + Mobile LAN)
 *   GET  /api/state    -> Current scoreboard JSON state
 *   POST /api/state    -> Update state (merges or replaces) & broadcasts to all overlays via SSE
 *   GET  /api/events   -> Server-Sent Events (SSE) real-time stream
 *   GET  /api/players  -> Saved local player database (autocomplete/history)
 *   POST /api/players  -> Save/update/delete player entry
 *   GET  /api/info     -> Local LAN IPs and URLs for OBS & mobile remote control
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  connectStartGG,
  fetchStartGGEventSets,
  fetchStartGGEntrants,
  reportStartGGSet,
  connectChallonge,
  reportChallongeMatch,
  getDemoTournament,
  reportDemoSet
} from './tournaments.mjs';
import { createAssetManager } from './assets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
const assets = createAssetManager(DATA_DIR);

export const DEFAULT_VS = {
  visible: true,
  source: 'current',           // 'current' | 'next' | 'custom'
  design: 'arcade-pop',        // 'arcade-pop' | 't8-clash' | 'twt-clean' | 'portrait-cards' | 'cyber-neon' | 'glass-pro'
  game: 'tekken8',
  pack: 'full',
  avatarMode: 'hero-fallback', // 'badge' | 'hero-fallback' | 'portrait-hero' | 'off'
  bgMode: 'theme',             // 'theme' | 'custom' | 'transparent'
  bgColor1: '#f5b800',
  bgColor2: '#10131e',
  p1Color: '#ff512f',
  p2Color: '#2563eb',
  pattern: 'symbols',          // 'symbols' | 'grid' | 'halftone' | 'diagonal' | 'none'
  eyebrow: 'UP NEXT',
  subtitle: '',
  showFlags: true,
  showH2H: true,
  showSponsor: true,
  showCharName: true,
  showLogo: true,
  showScore: false,
  logoUrl: '',
  p1Flip: false,
  p2Flip: true,
  p1Zoom: 100,
  p2Zoom: 100,
  p1OffsetY: 0,
  p2OffsetY: 0,
  entryAnim: 'slam-split',     // 'slam-split' | 'curtain' | 'zoom-burst' | 'fade'
  introNonce: 0,
  customMatch: {
    round: 'GRAND FINALS',
    format: 'FT3',
    p1: { name: 'PLAYER 1', sponsor: '', flag: '', region: '', bracket: '', character: '', avatar: '', score: 0 },
    p2: { name: 'PLAYER 2', sponsor: '', flag: '', region: '', bracket: '', character: '', avatar: '', score: 0 }
  },
  nextMatch: null
};

export const DEFAULT_STYLE = {
  // Typography
  fontName: 'theme',
  fontScore: 'theme',
  fontScale: 100,
  letterSpacing: 4,
  italic: 'theme',       // 'theme' | 'on' | 'off'
  uppercase: true,
  // Layout & Shape overrides
  layoutOverride: 'theme',   // 'theme' | 'blade' | 'crown' | 'split' | 'arch'
  scorePosOverride: 'theme', // 'theme' | 'inner' | 'outer'
  shape: 'theme',            // 'theme' | 'blade-slant' | 'diagonal' | 'bevel' | 'hex' | 'skew' | 'flat' | 'rounded'
  flagStyle: 'theme',        // 'theme' | 'blade-twt' | 'fade-blend' | 'twt-code' | 'split-dual' | 'bezel' | 'classic'
  borderStyle: 'theme',      // 'theme' | 'thin' | 'bold' | 'neon' | 'none'
  centerStyle: 'theme',      // 'theme' | 'floating' | 'trapezoid' | 'hex' | 'pill'
  outerBlade: 'theme',       // 'theme' | 'on' | 'off'
  bladeSlant: 22,            // 0..38 px diagonal blade angle
  barHeight: 0,              // 0 = theme default, else 32..64 px
  flagWidth: 62,             // 40..140 px integrated flag width
  flagOpacity: 100,          // 25..100 % flag intensity
  // Flag Fade-In / Fade-Out Studio
  flagFadeMode: 'fade-out',  // 'fade-out' | 'both' | 'fade-in' | 'diagonal' | 'vignette'
  flagFadeCurve: 'smooth',   // 'smooth' | 'soft' | 'sharp' | 'linear'
  flagFadeIn: 0,             // 0..45 % outer edge fade-in distance
  flagFadeStart: 34,         // 10..85 % where solid plateau ends and fade-out begins
  flagFadeEnd: 98,           // 40..100 % where fade-out reaches 0% alpha
  flagFadeAngle: 0,          // -35..35 deg tilt angle on the fade gradient
  flagZoom: 108,             // 100..180 % vector zoom inside flag fade window
  flagShiftX: 0,             // -30..30 % horizontal shift inside flag fade window
  flagSaturation: 100,       // 30..160 % flag color vibrancy
  flagBrightness: 96,        // 50..135 % flag brightness match
  showIsoCode: 'theme',      // 'theme' | 'on' | 'off' (PHL/ESP/MAD tag)
  // Colors, Surfaces & Gradients
  customColors: false,
  fillMode: 'gradient',      // 'gradient' | 'solid' | 'glass' | 'metallic' | 'theme'
  bgColor1: '#121520',
  bgColor2: '#07080d',
  bgAngle: 180,
  bgAlpha: 94,
  glassBlur: 14,             // px (4..28) for Glassmorphism surface
  glassBorder: 22,           // % (0..60) frosted hairline border brightness
  p1Color1: '#ff512f',
  p1Color2: '#dd2476',
  p2Color1: '#2563eb',
  p2Color2: '#7c3aed',
  centerColor1: '#1b1f2e',
  centerColor2: '#0c0e16',
  centerAccent: '#ffd24d',
  textColor: '#ffffff',
  sponsorColor: '#ffbe4f',
  // Visual FX
  glow: 'subtle',            // 'none' | 'subtle' | 'intense' | 'pulse'
  sheen: 'off',              // 'off' | 'slow' | 'fast'
  animBorder: 'off',         // 'off' | 'flow' | 'breathe'
  texture: 'none',           // 'none' | 'carbon' | 'scanlines' | 'hex' | 'stripes'
  textShadow: 'broadcast',   // 'broadcast' | 'hard' | 'neon' | 'none'
  // Transitions & OBS Scene Intro
  entryAnim: 'split-wings',  // 'slide-top' | 'split-wings' | 'cascade' | 't8-slash' | 'slam' | 'wipe' | 'glitch' | 'fade'
  scoreAnim: 'pop',          // 'pop' | 'flip' | 'roll' | 'shockwave' | 'none'
  animSpeed: 'normal',       // Legacy preset label ('fast' | 'normal' | 'cinematic')
  animDuration: 450,         // Exact entry/exit transition duration in ms (150..2500)
  scoreAnimDuration: 450,    // Exact +1 score pop/flip/roll/shockwave duration in ms (200..1500)
  sceneAutoIntro: true,      // Replay entry transition whenever OBS loads/activates the scene
  sceneDelay: 250,           // ms delay to sync after OBS Stinger/Fade transition (0..2000)
  introStagger: true,        // Center enters first, then P1/P2 wings unfold
  introFlash: true,          // Metallic sheen flash across plates on landing
  introOnSetChange: false,   // Also replay clean out->in transition when loading a new tournament set
  // Match Point Badge Customization
  mpStyle: 'side-peek',      // 'side-peek' | 'inside-ribbon' | 'under-wing' | 'outer-peek' | 'score-glow'
  mpColor: 'fire',           // 'fire' | 'theme' | 'gold' | 'crimson' | 'cyan'
  mpText: 'MATCH POINT'
};

export const DEFAULT_STATE = {
  version: 1,
  updatedAt: Date.now(),
  visible: true,
  introNonce: 0,
  theme: 't8-native-hud',
  round: 'ROUND 1',
  format: 'FT3',
  tournament: '',
  showFormat: true,
  showFlags: true,
  flagMode: 'both', // 'both' | 'country' | 'region' | 'none'
  showCharacters: false,
  showMatchPoint: true,
  showCommentators: false,
  p1: {
    name: 'PLAYER 1',
    sponsor: '',
    score: 0,
    flag: '',
    region: '',
    bracket: '', // '', 'W', 'L'
    character: '',
    avatar: ''
  },
  p2: {
    name: 'PLAYER 2',
    sponsor: '',
    score: 0,
    flag: '',
    region: '',
    bracket: '',
    character: '',
    avatar: ''
  },
  commentators: {
    c1Name: 'CASTER 1',
    c1Handle: '@caster1',
    c2Name: 'CASTER 2',
    c2Handle: '@caster2'
  },
  tweaks: {
    offsetY: 0,
    scale: 100,
    wingSpread: 0,
    opacity: 100,
    customColors: false,
    p1Color: '#ff6a1a',
    p2Color: '#7b5cff',
    centerColor: '#ffd24d'
  },
  style: structuredClone(DEFAULT_STYLE),
  vs: structuredClone(DEFAULT_VS),
  activeMatch: null,
  lastEvent: {
    type: 'init',
    side: null,
    ts: Date.now()
  }
};

const DEFAULT_PLAYERS = [];

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return parsed;
    }
  } catch (err) {
    console.warn(`[WARN] Failed reading ${filePath}:`, err.message);
  }
  return structuredClone(fallback);
}

function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

let currentState = {
  ...structuredClone(DEFAULT_STATE),
  ...readJsonSafe(STATE_FILE, DEFAULT_STATE)
};
currentState.p1 = { ...DEFAULT_STATE.p1, ...(currentState.p1 || {}) };
currentState.p2 = { ...DEFAULT_STATE.p2, ...(currentState.p2 || {}) };
currentState.commentators = { ...DEFAULT_STATE.commentators, ...(currentState.commentators || {}) };
currentState.tweaks = { ...DEFAULT_STATE.tweaks, ...(currentState.tweaks || {}) };
currentState.style = { ...DEFAULT_STYLE, ...(currentState.style || {}) };
currentState.vs = {
  ...structuredClone(DEFAULT_VS),
  ...(currentState.vs || {}),
  customMatch: {
    ...structuredClone(DEFAULT_VS.customMatch),
    ...(currentState.vs?.customMatch || {}),
    p1: { ...DEFAULT_VS.customMatch.p1, ...(currentState.vs?.customMatch?.p1 || {}) },
    p2: { ...DEFAULT_VS.customMatch.p2, ...(currentState.vs?.customMatch?.p2 || {}) }
  }
};

let playersDb = readJsonSafe(PLAYERS_FILE, DEFAULT_PLAYERS);
let presetsDb = readJsonSafe(PRESETS_FILE, []);
let integrationsCfg = {
  provider: 'startgg',
  startggToken: '',
  startggUrl: '',
  challongeKey: '',
  challongeUrl: '',
  ...readJsonSafe(INTEGRATIONS_FILE, {})
};
let historyDb = readJsonSafe(HISTORY_FILE, []);
let lastTournamentSnapshot = null;

if (!fs.existsSync(STATE_FILE)) writeJsonAtomic(STATE_FILE, currentState);
if (!fs.existsSync(PLAYERS_FILE)) writeJsonAtomic(PLAYERS_FILE, playersDb);
if (!fs.existsSync(PRESETS_FILE)) writeJsonAtomic(PRESETS_FILE, presetsDb);
if (!fs.existsSync(INTEGRATIONS_FILE)) writeJsonAtomic(INTEGRATIONS_FILE, integrationsCfg);
if (!fs.existsSync(HISTORY_FILE)) writeJsonAtomic(HISTORY_FILE, historyDb);

function mergeImportedPlayers(list) {
  let added = 0;
  for (const item of (list || [])) {
    if (!item?.name || !String(item.name).trim()) continue;
    const clean = {
      name: String(item.name).trim(),
      sponsor: String(item.sponsor || '').trim(),
      flag: String(item.flag || '').trim().toUpperCase(),
      region: String(item.region || '').trim().toUpperCase(),
      character: String(item.character || '').trim(),
      avatar: String(item.avatar || '').trim()
    };
    const idx = playersDb.findIndex(p => p.name.toLowerCase() === clean.name.toLowerCase());
    if (idx >= 0) {
      // Preserve existing character/region/avatar if incoming doesn't specify one
      playersDb[idx] = {
        ...playersDb[idx],
        sponsor: clean.sponsor || playersDb[idx].sponsor,
        flag: clean.flag || playersDb[idx].flag,
        region: clean.region || playersDb[idx].region,
        character: clean.character || playersDb[idx].character,
        avatar: clean.avatar || playersDb[idx].avatar || ''
      };
    } else {
      playersDb.unshift(clean);
      added++;
    }
  }
  playersDb = playersDb.slice(0, 400);
  writeJsonAtomic(PLAYERS_FILE, playersDb);
  return { added, total: playersDb.length };
}

/** Connected SSE clients */
const sseClients = new Set();

function broadcastState() {
  const payload = `event: state\ndata: ${JSON.stringify(currentState)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Keep-alive heartbeat so OBS CEF never drops the SSE socket
setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': ping\n\n');
    } catch {
      sseClients.delete(res);
    }
  }
}, 20000).unref();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function deepMergeState(prev, patch) {
  let nextVs = prev.vs || structuredClone(DEFAULT_VS);
  if (patch.vs) {
    nextVs = {
      ...nextVs,
      ...patch.vs,
      customMatch: patch.vs.customMatch
        ? {
            ...(nextVs.customMatch || DEFAULT_VS.customMatch),
            ...patch.vs.customMatch,
            p1: patch.vs.customMatch.p1
              ? { ...(nextVs.customMatch?.p1 || DEFAULT_VS.customMatch.p1), ...patch.vs.customMatch.p1 }
              : (nextVs.customMatch?.p1 || DEFAULT_VS.customMatch.p1),
            p2: patch.vs.customMatch.p2
              ? { ...(nextVs.customMatch?.p2 || DEFAULT_VS.customMatch.p2), ...patch.vs.customMatch.p2 }
              : (nextVs.customMatch?.p2 || DEFAULT_VS.customMatch.p2)
          }
        : nextVs.customMatch
    };
  }
  const next = {
    ...prev,
    ...patch,
    p1: patch.p1 ? { ...prev.p1, ...patch.p1 } : prev.p1,
    p2: patch.p2 ? { ...prev.p2, ...patch.p2 } : prev.p2,
    commentators: patch.commentators
      ? { ...prev.commentators, ...patch.commentators }
      : prev.commentators,
    tweaks: patch.tweaks ? { ...prev.tweaks, ...patch.tweaks } : prev.tweaks,
    style: patch.style ? { ...prev.style, ...patch.style } : prev.style,
    vs: nextVs,
    updatedAt: Date.now()
  };
  return next;
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- SSE real-time stream ---
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: state\ndata: ${JSON.stringify(currentState)}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // --- API: State ---
  if (pathname === '/api/state') {
    if (req.method === 'GET') {
      return sendJson(res, 200, currentState);
    }
    if (req.method === 'POST') {
      try {
        const patch = await readBody(req);
        currentState = deepMergeState(currentState, patch);
        writeJsonAtomic(STATE_FILE, currentState);
        broadcastState();
        return sendJson(res, 200, currentState);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- API: Reset to defaults ---
  if (pathname === '/api/reset' && req.method === 'POST') {
    currentState = { ...structuredClone(DEFAULT_STATE), updatedAt: Date.now() };
    writeJsonAtomic(STATE_FILE, currentState);
    broadcastState();
    return sendJson(res, 200, currentState);
  }

  // --- API: Players DB ---
  if (pathname === '/api/players') {
    if (req.method === 'GET') {
      return sendJson(res, 200, playersDb);
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (body.action === 'delete' && body.name) {
          playersDb = playersDb.filter(
            p => p.name.toLowerCase() !== String(body.name).toLowerCase()
          );
        } else if (body.name && String(body.name).trim()) {
          const entry = {
            name: String(body.name).trim(),
            sponsor: String(body.sponsor || '').trim(),
            flag: String(body.flag || '').trim().toUpperCase(),
            region: String(body.region || '').trim().toUpperCase(),
            character: String(body.character || '').trim(),
            avatar: String(body.avatar || '').trim()
          };
          const idx = playersDb.findIndex(
            p => p.name.toLowerCase() === entry.name.toLowerCase()
          );
          if (idx >= 0) playersDb[idx] = entry;
          else playersDb.unshift(entry);
          playersDb = playersDb.slice(0, 300);
        }
        writeJsonAtomic(PLAYERS_FILE, playersDb);
        return sendJson(res, 200, playersDb);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- API: Custom Style Presets ---
  if (pathname === '/api/presets') {
    if (req.method === 'GET') {
      return sendJson(res, 200, presetsDb);
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (body.action === 'delete' && body.id) {
          presetsDb = presetsDb.filter(p => p.id !== body.id);
        } else if (body.name && String(body.name).trim()) {
          const entry = {
            id: body.id || `preset-${Date.now()}`,
            name: String(body.name).trim().slice(0, 40),
            theme: body.theme || currentState.theme,
            tweaks: { ...DEFAULT_STATE.tweaks, ...(body.tweaks || {}) },
            style: { ...DEFAULT_STYLE, ...(body.style || {}) },
            savedAt: Date.now()
          };
          const idx = presetsDb.findIndex(p => p.id === entry.id || p.name.toLowerCase() === entry.name.toLowerCase());
          if (idx >= 0) presetsDb[idx] = entry;
          else presetsDb.unshift(entry);
          presetsDb = presetsDb.slice(0, 60);
        }
        writeJsonAtomic(PRESETS_FILE, presetsDb);
        return sendJson(res, 200, presetsDb);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- API: Tournament Integrations Config (Tokens stored strictly locally, masked on GET) ---
  if (pathname === '/api/integrations') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        provider: integrationsCfg.provider || 'startgg',
        startggUrl: integrationsCfg.startggUrl || '',
        hasStartggToken: Boolean(integrationsCfg.startggToken),
        startggTokenHint: integrationsCfg.startggToken ? `••••${integrationsCfg.startggToken.slice(-4)}` : '',
        challongeUrl: integrationsCfg.challongeUrl || '',
        hasChallongeKey: Boolean(integrationsCfg.challongeKey),
        challongeKeyHint: integrationsCfg.challongeKey ? `••••${integrationsCfg.challongeKey.slice(-4)}` : ''
      });
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (body.provider) integrationsCfg.provider = body.provider;
        if (body.startggUrl !== undefined) integrationsCfg.startggUrl = String(body.startggUrl).trim();
        if (body.startggToken !== undefined && body.startggToken !== '__KEEP__') {
          integrationsCfg.startggToken = String(body.startggToken).trim();
        }
        if (body.challongeUrl !== undefined) integrationsCfg.challongeUrl = String(body.challongeUrl).trim();
        if (body.challongeKey !== undefined && body.challongeKey !== '__KEEP__') {
          integrationsCfg.challongeKey = String(body.challongeKey).trim();
        }
        writeJsonAtomic(INTEGRATIONS_FILE, integrationsCfg);
        return sendJson(res, 200, {
          ok: true,
          hasStartggToken: Boolean(integrationsCfg.startggToken),
          hasChallongeKey: Boolean(integrationsCfg.challongeKey)
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- API: Connect / Refresh Tournament (Start.gg | Challonge | Demo) ---
  if (pathname === '/api/tournament/connect' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const provider = body.provider || integrationsCfg.provider || 'startgg';
      integrationsCfg.provider = provider;

      if (provider === 'demo') {
        lastTournamentSnapshot = getDemoTournament();
        return sendJson(res, 200, lastTournamentSnapshot);
      }

      if (provider === 'startgg') {
        const url = String(body.url ?? integrationsCfg.startggUrl ?? '').trim();
        const token = (body.token && body.token !== '__KEEP__')
          ? String(body.token).trim()
          : integrationsCfg.startggToken;
        if (url) integrationsCfg.startggUrl = url;
        if (body.token && body.token !== '__KEEP__') integrationsCfg.startggToken = token;
        writeJsonAtomic(INTEGRATIONS_FILE, integrationsCfg);

        const data = await connectStartGG(url, token);
        lastTournamentSnapshot = data;
        return sendJson(res, 200, data);
      }

      if (provider === 'challonge') {
        const url = String(body.url ?? integrationsCfg.challongeUrl ?? '').trim();
        const key = (body.token && body.token !== '__KEEP__')
          ? String(body.token).trim()
          : integrationsCfg.challongeKey;
        if (url) integrationsCfg.challongeUrl = url;
        if (body.token && body.token !== '__KEEP__') integrationsCfg.challongeKey = key;
        writeJsonAtomic(INTEGRATIONS_FILE, integrationsCfg);

        const data = await connectChallonge(url, key);
        lastTournamentSnapshot = data;
        return sendJson(res, 200, data);
      }

      return sendJson(res, 400, { error: `Unknown provider: ${provider}` });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Switch Start.gg Event Sets ---
  if (pathname === '/api/tournament/sets' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const provider = body.provider || lastTournamentSnapshot?.provider || 'startgg';
      if (provider === 'demo') {
        const demo = getDemoTournament();
        return sendJson(res, 200, { sets: demo.sets, streamQueue: demo.streamQueue });
      }
      if (provider === 'startgg') {
        const token = integrationsCfg.startggToken;
        const sets = await fetchStartGGEventSets(body.eventId, token);
        if (lastTournamentSnapshot) {
          lastTournamentSnapshot.selectedEventId = String(body.eventId);
          lastTournamentSnapshot.sets = sets;
        }
        return sendJson(res, 200, { sets });
      }
      if (provider === 'challonge') {
        const data = await connectChallonge(integrationsCfg.challongeUrl, integrationsCfg.challongeKey);
        lastTournamentSnapshot = data;
        return sendJson(res, 200, { sets: data.sets, streamQueue: data.streamQueue });
      }
      return sendJson(res, 400, { error: 'Unsupported provider' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Import Tournament Participants into local players.json ---
  if (pathname === '/api/tournament/import-players' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const provider = body.provider || lastTournamentSnapshot?.provider || 'startgg';
      let imported = [];
      if (provider === 'demo') {
        imported = getDemoTournament().participants;
      } else if (provider === 'startgg') {
        const eventId = body.eventId || lastTournamentSnapshot?.selectedEventId;
        if (!eventId) throw new Error('Connect a start.gg event first.');
        imported = await fetchStartGGEntrants(eventId, integrationsCfg.startggToken);
      } else if (provider === 'challonge') {
        const snap = lastTournamentSnapshot?.provider === 'challonge'
          ? lastTournamentSnapshot
          : await connectChallonge(integrationsCfg.challongeUrl, integrationsCfg.challongeKey);
        imported = snap.participants || [];
      }
      const stats = mergeImportedPlayers(imported);
      return sendJson(res, 200, { ...stats, players: playersDb });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Report Set Result to Start.gg / Challonge / Demo (+ Auto-log History!) ---
  if (pathname === '/api/tournament/report' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { provider, tournamentSlug, setId, winnerEntrantId, p1EntrantId, p2EntrantId, p1Score, p2Score, liveOnly } = body;
      let result = null;
      if (provider === 'demo') {
        result = reportDemoSet({ setId, winnerEntrantId, p1Score, p2Score });
      } else if (provider === 'startgg') {
        result = await reportStartGGSet({
          setId, winnerEntrantId, p1EntrantId, p2EntrantId, p1Score, p2Score,
          token: integrationsCfg.startggToken
        });
      } else if (provider === 'challonge') {
        result = await reportChallongeMatch({
          tournamentSlug: tournamentSlug || lastTournamentSnapshot?.tournament?.slug,
          matchId: setId,
          winnerEntrantId,
          p1Score,
          p2Score,
          apiKey: integrationsCfg.challongeKey,
          liveOnly: Boolean(liveOnly)
        });
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Local Match History & H2H ---
  if (pathname === '/api/history') {
    if (req.method === 'GET') {
      return sendJson(res, 200, historyDb);
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (body.action === 'delete' && body.id) {
          historyDb = historyDb.filter(h => h.id !== body.id);
        } else if (body.action === 'clear') {
          historyDb = [];
        } else {
          const entry = {
            id: `match-${Date.now()}`,
            ts: Date.now(),
            provider: body.provider || 'local',
            tournament: String(body.tournament || currentState.tournament || 'Local').trim(),
            round: String(body.round || currentState.round || '').trim(),
            format: String(body.format || currentState.format || '').trim(),
            p1: body.p1 || currentState.p1,
            p2: body.p2 || currentState.p2,
            winnerSide: body.winnerSide || (Number(body.p1?.score ?? 0) >= Number(body.p2?.score ?? 0) ? 'p1' : 'p2')
          };
          historyDb.unshift(entry);
          historyDb = historyDb.slice(0, 500);
        }
        writeJsonAtomic(HISTORY_FILE, historyDb);
        return sendJson(res, 200, historyDb);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- API: Multi-Game Character Assets & Local Cache (StreamHelperAssets) ---
  if (pathname === '/api/assets/games' && req.method === 'GET') {
    try {
      const includeAll = urlObj.searchParams.get('all') === '1';
      return sendJson(res, 200, await assets.listGames(includeAll));
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/assets/roster' && req.method === 'GET') {
    try {
      const game = urlObj.searchParams.get('game') || currentState.vs?.game || 'tekken8';
      const pack = urlObj.searchParams.get('pack') || currentState.vs?.pack || 'full';
      return sendJson(res, 200, await assets.getRoster(game, pack));
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/assets/render' && req.method === 'GET') {
    try {
      const game = urlObj.searchParams.get('game') || 'tekken8';
      const pack = urlObj.searchParams.get('pack') || 'full';
      const charName = urlObj.searchParams.get('char') || '';
      const skin = Math.max(0, Number(urlObj.searchParams.get('skin') || 0) || 0);
      if (!charName.trim()) {
        res.writeHead(404);
        return res.end('No character specified');
      }
      const resolved = await assets.ensureCharacterRender(game, pack, charName, skin);
      if (!resolved?.filePath || !fs.existsSync(resolved.filePath)) {
        res.writeHead(404);
        return res.end('Character render not found');
      }
      const ext = path.extname(resolved.filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(resolved.filePath).pipe(res);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(err.message);
    }
  }

  if (pathname === '/api/assets/download-pack' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const status = await assets.startPackDownload(body.game || 'tekken8', body.pack || 'full');
      return sendJson(res, 200, status);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/assets/download-status' && req.method === 'GET') {
    return sendJson(res, 200, assets.getDownloadStatus());
  }

  if (pathname === '/api/assets/clear-pack' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      return sendJson(res, 200, assets.clearPackCache(body.game, body.pack));
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Upload Local Player Avatar, Tournament Logo, or Custom Character PNG ---
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const body = await readBody(req, 9 * 1024 * 1024);
      const saved = assets.saveUploadedImage({
        kind: body.kind,
        name: body.name,
        dataUrl: body.dataUrl,
        game: body.game
      });
      return sendJson(res, 200, { ok: true, url: saved.url });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Same-origin Avatar Proxy for Start.gg / Challonge external profile photos (zero CORS canvas taint) ---
  if (pathname === '/api/avatar-proxy' && req.method === 'GET') {
    try {
      const rawUrl = urlObj.searchParams.get('url') || '';
      const parsed = new URL(rawUrl);
      const allowedHosts = ['images.start.gg', 'www.start.gg', 'start.gg', 'images.smash.gg', 'secure.gravatar.com', 's3.amazonaws.com'];
      if (parsed.protocol !== 'https:' || !allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
        res.writeHead(403);
        return res.end('Host not allowed');
      }
      const upstream = await fetch(parsed.toString(), { headers: { 'User-Agent': 'FGC-Open-Scorebars/1.1' } });
      if (!upstream.ok) {
        res.writeHead(404);
        return res.end('Avatar unavailable');
      }
      const ct = upstream.headers.get('content-type') || 'image/jpeg';
      if (!ct.startsWith('image/')) {
        res.writeHead(415);
        return res.end('Not an image');
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(buf);
    } catch {
      res.writeHead(404);
      return res.end('Avatar error');
    }
  }

  // --- Local Uploaded Media Serving (/media/avatars|branding|custom/filename) ---
  const mediaMatch = pathname.match(/^\/media\/(avatars|branding|custom)\/(.+)$/);
  if (mediaMatch && req.method === 'GET') {
    const fp = assets.resolveMediaFile(mediaMatch[1], mediaMatch[2]);
    if (!fp) {
      res.writeHead(404);
      return res.end('Media not found');
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    return fs.createReadStream(fp).pipe(res);
  }

  // --- API: Server Info (URLs, LAN IPs, client count) ---
  if (pathname === '/api/info' && req.method === 'GET') {
    const lanIps = getLanIps();
    return sendJson(res, 200, {
      port: PORT,
      overlayUrl: `http://localhost:${PORT}/`,
      vsOverlayUrl: `http://localhost:${PORT}/vs.html`,
      panelUrl: `http://localhost:${PORT}/panel.html`,
      lanPanelUrls: lanIps.map(ip => `http://${ip}:${PORT}/panel.html`),
      connectedClients: sseClients.size
    });
  }

  // --- Static file serving (strictly blocks /data/ so tokens/state JSON are never served publicly!) ---
  let relPath =
    pathname === '/' ? '/index.html' :
    pathname === '/panel' ? '/panel.html' :
    pathname === '/vs' ? '/vs.html' : pathname;
  relPath = decodeURIComponent(relPath);
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  if (/^[/\\]?data([/\\]|$)/i.test(safePath)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const fullPath = path.join(__dirname, safePath);

  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(fullPath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const lanIps = getLanIps();
  console.log('\n=======================================================');
  console.log('  FGC OPEN SCOREBARS — LOCAL SERVER RUNNING (0 deps)');
  console.log('=======================================================');
  console.log(`  Scorebar Overlay (OBS):   http://localhost:${PORT}/`);
  console.log(`  VS Splash Overlay (OBS):  http://localhost:${PORT}/vs.html`);
  console.log(`  Local Control Panel:      http://localhost:${PORT}/panel.html`);
  if (lanIps.length) {
    console.log(`  Mobile / Tablet LAN UI:   http://${lanIps[0]}:${PORT}/panel.html`);
  }
  console.log('=======================================================\n');
});
