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
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  connectStartGG,
  fetchStartGGEventSets,
  fetchStartGGEntrants,
  fetchStartGGTournamentLogo,
  fetchStartGGStandings,
  fetchStartGGTop8Bracket,
  reportStartGGSet,
  connectChallonge,
  fetchChallongeTournamentLogo,
  fetchChallongeStandings,
  fetchChallongeTop8Bracket,
  reportChallongeMatch,
  getDemoTournament,
  getDemoStandings,
  getDemoTop8Bracket,
  reportDemoSet
} from './tournaments.mjs';
import { createAssetManager } from './assets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_VERSION = '2.1.0';
const GITHUB_REPO = 'N5K-dev/fgc-open-scorebars';
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const FONTS_DIR = path.join(DATA_DIR, 'fonts');
const FONTS_FILE = path.join(FONTS_DIR, 'fonts.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(FONTS_DIR, { recursive: true });
const assets = createAssetManager(DATA_DIR);

export const DEFAULT_VS = {
  visible: true,
  source: 'current',           // 'current' | 'next' | 'custom'
  design: 'arcade-pop',        // 42 built-in broadcast designs from vs-designs.js
  game: 'tekken8',
  pack: 'full',
  avatarMode: 'hero-fallback', // 'badge' | 'hero-fallback' | 'portrait-hero' | 'off'
  bgMode: 'theme',             // 'theme' | 'custom' | 'transparent'
  bgColor1: '#f5b800',
  bgColor2: '#10131e',
  p1Color: '#ff512f',
  p2Color: '#2563eb',
  accentColor: '',             // '' = design theme default
  // Animated Pattern Studio
  pattern: 'theme',            // 'theme' | 'symbols' | 'grid' | 'halftone' | 'diagonal' | 'hex' | 'chevrons' | 'rings' | 'stars' | 'none'
  patternSpeed: 40,            // 0 (static) .. 100 (fast)
  patternDir: 'diag-dr',       // 'diag-dr' | 'up' | 'down' | 'left' | 'right' | 'diag-ul'
  patternOpacity: -1,          // -1 = theme default, else 0..80 %
  patternScale: 100,           // 50..200 %
  // Architectural Frame & Header
  frameStyle: 'theme',         // 'theme' | 'arcade-teeth' | 'cyber-corners' | 'cinematic-bars' | 'double-gold' | 'hazard-tape' | 'manga-ink' | 'neon-tube' | 'minimal-line' | 'none'
  headerStyle: 'theme',        // 'theme' | 'trapezoid' | 'floating-pill' | 'full-ribbon' | 'hex-crest' | 'minimal-text' | 'skew-tag' | 'none'
  headerScale: 100,            // 60..150 %
  headerOffsetY: 0,            // 0..180 px
  // Center Divider Studio (with animated scrolling contents!)
  dividerStyle: 'theme',       // 'theme' | 'x-tape' | 'chevron-stream' | 'hazard-scroll' | 'energy-beam' | 'lightning-crack' | 'scan-rail' | 'ticker-vs' | 'solid-glow' | 'hairline' | 'none'
  dividerAnim: 'theme',        // 'theme' | 'scroll-down' | 'scroll-up' | 'pulse' | 'shimmer' | 'static'
  dividerSpeed: 45,            // 0 (static) .. 100 (fast)
  dividerWidth: 0,             // 0 = theme default, else 2..64 px
  dividerTilt: null,           // null = theme default, else -20..20 deg
  dividerColor: '',            // '' = theme default
  // Center VS Emblem Studio
  emblemStyle: 'theme',        // 'theme' | 'winged' | 'diamond-shield' | 'circle-ring' | 'hex-core' | 'comic-burst' | 'pill-tag' | 'monolith' | 'slash-bolt' | 'minimal-text' | 'none'
  emblemText: 'VS',
  emblemScale: 100,            // 50..180 %
  emblemOffsetY: 0,            // -300..300 px
  emblemAnim: 'theme',         // 'theme' | 'none' | 'float' | 'pulse' | 'glitch' | 'spin-ring'
  // Nameplates, Typography & Flags Studio
  plateStyle: 'theme',         // 'theme' | 'arcade-box' | 't8-blade' | 'glass-pill' | 'floating-clean' | 'corner-ribbon' | 'hex-plate' | 'comic-skew' | 'stacked-banner' | 'luxury-thin'
  plateBottom: -1,             // -1 = theme default, else 30..420 px
  plateWidth: 790,             // 540..900 px
  plateScale: 100,             // 70..135 %
  plateOpacity: 96,            // 25..100 %
  fontDisplay: 'theme',        // 'theme' | Google font name
  nameScale: 100,              // 65..145 %
  flagMode: 'both',            // 'both' | 'country' | 'region' | 'none' (supports Region-Only!)
  flagSize: 100,               // 70..150 %
  flagWatermarkOpacity: -1,    // -1 = theme default, else 0..60 %
  // Branding & Info Toggles
  eyebrow: 'UP NEXT',
  subtitle: '',
  showFlags: true,
  showH2H: true,
  showSponsor: true,
  showCharName: true,
  showLogo: true,
  autoEventLogo: true,         // Auto-load tournament logo from Start.gg / Challonge / Demo
  showScore: false,
  logoUrl: '',
  logoSource: '',              // '' | 'auto' | 'manual'
  logoTournamentSlug: '',
  logoScale: 100,              // 50..180 %
  logoPos: 'bottom-left',      // 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-left' | 'top-right'
  h2hOffsetY: 84,              // 20..240 px from bottom
  // Millimeter Character Framing
  p1Flip: false,
  p2Flip: true,
  p1Zoom: 100,
  p2Zoom: 100,
  p1OffsetX: 0,                // -300..300 px
  p2OffsetX: 0,                // -300..300 px
  p1OffsetY: 0,                // -260..260 px
  p2OffsetY: 0,                // -260..260 px
  charShadow: 60,              // 0..100 %
  charIdleAnim: 'none',        // 'none' | 'breathe' | 'float'
  // OBS Scene Entry & Ambient FX
  entryAnim: 'slam-split',     // 10 choreography styles
  entrySpeed: 100,             // 40..200 %
  ambientAnim: 'theme',        // 'theme' | 'none' | 'pulse-glow' | 'shimmer-sweep' | 'energy-sparks' | 'spotlight-sway' | 'scanline-crt'
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
  scoreSlant: 'mirror',  // 'mirror' (\ / symmetric to blade) | 'upright' | 'italic'
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

export const DEFAULT_RESULTS = {
  visible: true,
  design: 'res-evo-gold',
  layoutOverride: 'theme',   // 'theme' | 'champ-left' | 'podium-top' | 'esports-grid' | 'tower-ladder' | 'top4-quad' | 'podium-3'
  cardStyle: 'theme',        // 'theme' | 'angled' | 'chamfer' | 'sharp' | 'glass' | 'comic' | 'minimal'
  game: 'tekken8',
  pack: 'full',
  // Event Header & Branding
  title: 'TOP 8 RESULTS',
  subtitle: 'TOURNAMENT FINALS',
  entrantsCount: '',
  footerText: '',
  logoUrl: '',               // '' = auto-inherit state.vs.logoUrl when showLogo is true
  showLogo: true,
  showCrown: true,
  showFlags: true,
  flagMode: 'both',          // 'both' | 'country' | 'region' | 'none'
  avatarMode: 'badge',       // 'badge' | 'fallback' | 'avatar-only' | 'char-only'
  showSponsor: true,
  showCharName: true,
  showHandles: true,
  showEntrants: true,
  // Colors, Typography & Pattern Studio
  bgMode: 'theme',           // 'theme' | 'custom' | 'transparent'
  bgColor1: '#1d356b',
  bgColor2: '#060912',
  accentColor: '',
  goldColor: '',
  fontDisplay: 'theme',
  pattern: 'theme',          // 'theme' | 'symbols' | 'grid' | 'halftone' | 'diagonal' | 'hex' | 'chevrons' | 'rings' | 'stars' | 'none'
  patternSpeed: 38,
  patternDir: 'diag-dr',
  patternOpacity: -1,
  patternScale: 100,
  // Animations & Ambient FX
  entryAnim: 'theme',        // 'theme' | 'cascade-slam' | 'podium-rise' | 'diag-wipe' | 'zoom-punch' | 'slide-ladder' | 'curtain-rise' | 'pop-bounce' | 'cyber-glitch' | 'shatter-drop' | 'clean-fade'
  entrySpeed: 100,
  staggerMs: 85,
  ambientAnim: 'theme',      // 'theme' | 'none' | 'confetti-gold' | 'energy-sparks' | 'spotlight-sweep' | 'petals-drift' | 'shimmer-wave' | 'aurora-glow' | 'scanline-crt'
  cardIdleAnim: 'theme',     // 'theme' | 'none' | 'champ-glow' | 'float-wave' | 'sheen-loop'
  charZoom: 100,
  charOffsetX: 0,
  charOffsetY: 0,
  charFlip: false,
  introNonce: 0,
  // Live Tournament Auto-Sync Link
  autoSyncTournament: true,
  linkedProvider: '',
  linkedTournament: '',
  tournamentStatus: '',      // '' | 'live' | 'completed' | 'upcoming'
  lastSyncAt: 0,
  placements: [
    { place: 1, name: 'PLAYER 1', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 2, name: 'PLAYER 2', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 3, name: 'PLAYER 3', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 4, name: 'PLAYER 4', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 5, name: 'PLAYER 5', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 5, name: 'PLAYER 6', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 7, name: 'PLAYER 7', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false },
    { place: 7, name: 'PLAYER 8', sponsor: '', flag: '', region: '', character: '', avatar: '', handle: '', charZoom: 100, charX: 0, charY: 0, charFlip: false }
  ]
};

export const DEFAULT_BRACKET = {
  visible: true,
  bgMode: 'auto', // 'auto' | 'standard' | 'reset' | 'transparent'
  showReset: false,
  introNonce: 0,
  bottomText: '',
  matches: {
    ws1:    { p1: '', p1s: '', p2: '', p2s: '' },
    ws2:    { p1: '', p1s: '', p2: '', p2s: '' },
    wf:     { p1: '', p1s: '', p2: '', p2s: '' },
    ltop81: { p1: '', p1s: '', p2: '', p2s: '' },
    ltop82: { p1: '', p1s: '', p2: '', p2s: '' },
    lq1:    { p1: '', p1s: '', p2: '', p2s: '' },
    lq2:    { p1: '', p1s: '', p2: '', p2s: '' },
    ls:     { p1: '', p1s: '', p2: '', p2s: '' },
    lf:     { p1: '', p1s: '', p2: '', p2s: '' },
    gf:     { p1: '', p1s: '', p2: '', p2s: '' },
    gfr:    { p1: '', p1s: '', p2: '', p2s: '' }
  }
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
    c2Handle: '@caster2',
    visible: true,
    bgMode: 'valquiria', // 'valquiria' | 'transparent'
    introNonce: 0,
    saved: []
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
  results: structuredClone(DEFAULT_RESULTS),
  bracket: structuredClone(DEFAULT_BRACKET),
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
currentState.results = {
  ...structuredClone(DEFAULT_RESULTS),
  ...(currentState.results || {}),
  placements: Array.isArray(currentState.results?.placements) && currentState.results.placements.length
    ? currentState.results.placements.slice(0, 8).map((p, i) => ({ ...DEFAULT_RESULTS.placements[i], ...(p || {}) }))
    : structuredClone(DEFAULT_RESULTS.placements)
};
{
  const brkMatches = { ...structuredClone(DEFAULT_BRACKET.matches) };
  for (const k of Object.keys(brkMatches)) {
    brkMatches[k] = { ...brkMatches[k], ...(currentState.bracket?.matches?.[k] || {}) };
  }
  currentState.bracket = {
    ...structuredClone(DEFAULT_BRACKET),
    ...(currentState.bracket || {}),
    matches: brkMatches
  };
}

let playersDb = readJsonSafe(PLAYERS_FILE, DEFAULT_PLAYERS);
let presetsDb = readJsonSafe(PRESETS_FILE, []);
let integrationsCfg = {
  provider: 'startgg',
  startggToken: '',
  startggUrl: '',
  challongeKey: '',
  challongeUrl: '',
  persistTokens: false,
  ...readJsonSafe(INTEGRATIONS_FILE, {})
};
// Keep active API tokens in RAM by default; only persist to local gitignored data/integrations.json if user opts in
const sessionTokens = {
  startgg: integrationsCfg.startggToken || '',
  challonge: integrationsCfg.challongeKey || ''
};
function getAuthToken(provider, bodyToken) {
  if (bodyToken && bodyToken !== '__KEEP__') return String(bodyToken).trim();
  if (provider === 'startgg') return sessionTokens.startgg || integrationsCfg.startggToken || '';
  if (provider === 'challonge') return sessionTokens.challonge || integrationsCfg.challongeKey || '';
  return '';
}
function saveIntegrationsSafe() {
  const onDisk = {
    provider: integrationsCfg.provider || 'startgg',
    startggUrl: integrationsCfg.startggUrl || '',
    challongeUrl: integrationsCfg.challongeUrl || '',
    persistTokens: Boolean(integrationsCfg.persistTokens),
    startggToken: integrationsCfg.persistTokens ? (sessionTokens.startgg || '') : '',
    challongeKey: integrationsCfg.persistTokens ? (sessionTokens.challonge || '') : ''
  };
  integrationsCfg = onDisk;
  writeJsonAtomic(INTEGRATIONS_FILE, onDisk);
}
let historyDb = readJsonSafe(HISTORY_FILE, []);
let fontsDb = readJsonSafe(FONTS_FILE, []).filter(f => {
  if (!f || !f.id) return false;
  if (f.kind === 'file') return Boolean(f.file && fs.existsSync(path.join(FONTS_DIR, path.basename(f.file))));
  return f.kind === 'system' && Boolean(f.family);
});
let lastTournamentSnapshot = null;

if (!fs.existsSync(STATE_FILE)) writeJsonAtomic(STATE_FILE, currentState);
if (!fs.existsSync(PLAYERS_FILE)) writeJsonAtomic(PLAYERS_FILE, playersDb);
if (!fs.existsSync(PRESETS_FILE)) writeJsonAtomic(PRESETS_FILE, presetsDb);
if (!fs.existsSync(INTEGRATIONS_FILE)) writeJsonAtomic(INTEGRATIONS_FILE, integrationsCfg);
if (!fs.existsSync(HISTORY_FILE)) writeJsonAtomic(HISTORY_FILE, historyDb);
if (!fs.existsSync(FONTS_FILE)) writeJsonAtomic(FONTS_FILE, fontsDb);

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

function broadcastFonts() {
  const payload = `event: fonts\ndata: ${JSON.stringify(fontsDb)}\n\n`;
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
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4'
};

const VIRTUAL_IFACE_RE = /radmin|hamachi|tailscale|zerotier|wireguard|nordlynx|openvpn|proton|mullvad|wintun|vpn|vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|bluetooth|npcap|tap-?windows|\btap\b|\btun\b/i;

function classifyIpv4(name, ip) {
  const parts = String(ip || '').split('.').map(Number);
  const [a, b, c] = parts;
  const isLinkLocal = a === 169 && b === 254;
  const isRadminOrHamachi = a === 26 || a === 25;
  const isCgnat = a === 100 && b >= 64 && b <= 127;
  const isVboxHostOnly = a === 192 && b === 168 && c === 56;
  const isRfc1918 = (a === 192 && b === 168) || a === 10 || (a === 172 && b >= 16 && b <= 31);
  const isVirtualName = VIRTUAL_IFACE_RE.test(name || '');

  let kind = 'lan';
  let score = 0;

  if (isLinkLocal) {
    kind = 'virtual';
    score = -200;
  } else if (isRadminOrHamachi || isCgnat || isVboxHostOnly || isVirtualName) {
    kind = (isRadminOrHamachi || isCgnat || /radmin|hamachi|tailscale|zerotier|wireguard|vpn/i.test(name || '')) ? 'vpn' : 'virtual';
    score = -100;
  } else {
    if (a === 192 && b === 168) score += 60;
    else if (a === 10) score += 50;
    else if (a === 172 && b >= 16 && b <= 31) score += 45;
    else score += 10;
    if (/wi-?fi|wlan|wireless/i.test(name || '')) score += 30;
    else if (/ethernet|eth\d|en\d|local area/i.test(name || '')) score += 25;
    if (!isRfc1918) score -= 20;
  }

  return { name, ip, kind, score };
}

function getRankedNetworkInterfaces() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push(classifyIpv4(name, net.address));
      }
    }
  }
  return list.sort((x, y) => y.score - x.score);
}

function getLanIps() {
  const ranked = getRankedNetworkInterfaces();
  const physical = ranked.filter(x => x.kind === 'lan');
  if (physical.length) return physical.map(x => x.ip);
  return ranked.filter(x => x.score > -150).map(x => x.ip);
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
    let nextMatchVal = nextVs.nextMatch;
    if (patch.vs.nextMatch === null) {
      nextMatchVal = null;
    } else if (patch.vs.nextMatch) {
      const incoming = patch.vs.nextMatch;
      // Full replacement when a new queue set is loaded; partial merge when editing p1/p2 character
      if (incoming.setId !== undefined || (incoming.p1 && incoming.p2)) {
        nextMatchVal = incoming;
      } else if (nextVs.nextMatch) {
        nextMatchVal = {
          ...nextVs.nextMatch,
          ...incoming,
          p1: incoming.p1 ? { ...(nextVs.nextMatch.p1 || {}), ...incoming.p1 } : nextVs.nextMatch.p1,
          p2: incoming.p2 ? { ...(nextVs.nextMatch.p2 || {}), ...incoming.p2 } : nextVs.nextMatch.p2
        };
      } else {
        nextMatchVal = incoming;
      }
    }
    nextVs = {
      ...nextVs,
      ...patch.vs,
      nextMatch: nextMatchVal,
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
  const nextResults = patch.results
    ? {
        ...(prev.results || structuredClone(DEFAULT_RESULTS)),
        ...patch.results,
        placements: Array.isArray(patch.results.placements)
          ? patch.results.placements.slice(0, 8).map((p, i) => ({
              ...(prev.results?.placements?.[i] || DEFAULT_RESULTS.placements[i] || { place: i + 1 }),
              ...(p || {})
            }))
          : (prev.results?.placements || structuredClone(DEFAULT_RESULTS.placements))
      }
    : (prev.results || structuredClone(DEFAULT_RESULTS));
  const prevBrk = prev.bracket || structuredClone(DEFAULT_BRACKET);
  let nextBrk = prevBrk;
  if (patch.bracket) {
    const mergedMatches = { ...structuredClone(DEFAULT_BRACKET.matches), ...(prevBrk.matches || {}) };
    if (patch.bracket.matches) {
      for (const slotKey of Object.keys(DEFAULT_BRACKET.matches)) {
        if (patch.bracket.matches[slotKey]) {
          mergedMatches[slotKey] = {
            ...(mergedMatches[slotKey] || { p1: '', p1s: '', p2: '', p2s: '' }),
            ...patch.bracket.matches[slotKey]
          };
        }
      }
    }
    nextBrk = {
      ...prevBrk,
      ...patch.bracket,
      matches: mergedMatches
    };
  }
  const next = {
    ...prev,
    ...patch,
    p1: patch.p1 ? { ...prev.p1, ...patch.p1 } : prev.p1,
    p2: patch.p2 ? { ...prev.p2, ...patch.p2 } : prev.p2,
    commentators: patch.commentators
      ? {
          ...prev.commentators,
          ...patch.commentators,
          saved: Array.isArray(patch.commentators.saved)
            ? patch.commentators.saved
            : (Array.isArray(prev.commentators?.saved) ? prev.commentators.saved : [])
        }
      : prev.commentators,
    tweaks: patch.tweaks ? { ...prev.tweaks, ...patch.tweaks } : prev.tweaks,
    style: patch.style ? { ...prev.style, ...patch.style } : prev.style,
    vs: nextVs,
    results: nextResults,
    bracket: nextBrk,
    updatedAt: Date.now()
  };
  return next;
}

/* ============================================================================
   GITHUB RELEASES VERSION CHECKER & DATA-SAFE 1-CLICK SELF-UPDATER (0 DEPS)
   ============================================================================ */
let updateCache = null;

function parseSemver(raw) {
  const m = String(raw || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

export function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function isAllowedUpdateHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    const allowed = [
      'github.com',
      'api.github.com',
      'objects.githubusercontent.com',
      'codeload.github.com',
      'release-assets.githubusercontent.com'
    ];
    return allowed.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function checkGithubUpdate(force = false) {
  const now = Date.now();
  if (!force && updateCache && (now - updateCache.checkedAt) < 10 * 60 * 1000) {
    return updateCache;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'User-Agent': `FGC-Open-Scorebars/${APP_VERSION}`,
        'Accept': 'application/vnd.github+json'
      },
      signal: AbortSignal.timeout(6500)
    });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const rel = await res.json();
    const latestTag = String(rel.tag_name || '').trim();
    const latestVersion = latestTag.replace(/^v/i, '') || APP_VERSION;
    const cmp = compareSemver(latestVersion, APP_VERSION);
    const status = cmp > 0 ? 'update-available' : (cmp < 0 ? 'ahead' : 'up-to-date');
    const zipAsset = (Array.isArray(rel.assets) ? rel.assets : []).find(a =>
      /\.zip$/i.test(String(a?.name || '')) && a?.browser_download_url
    );
    const downloadUrl = zipAsset?.browser_download_url || rel.zipball_url || '';
    const notesRaw = String(rel.body || '').replace(/\r\n/g, '\n').trim();
    const result = {
      status,
      currentVersion: APP_VERSION,
      latestVersion,
      latestTag: latestTag || `v${latestVersion}`,
      releaseTitle: String(rel.name || latestTag || `v${latestVersion}`).trim(),
      releaseUrl: String(rel.html_url || `https://github.com/${GITHUB_REPO}/releases`),
      publishedAt: rel.published_at || '',
      downloadUrl,
      assetName: zipAsset?.name || `FGC-Open-Scorebars-${latestTag}.zip`,
      assetSize: Number(zipAsset?.size || 0),
      notes: notesRaw.slice(0, 1400),
      checkedAt: now
    };
    updateCache = result;
    return result;
  } catch (err) {
    return {
      status: 'offline',
      currentVersion: APP_VERSION,
      latestVersion: '',
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      error: err.message,
      checkedAt: now
    };
  }
}

function runExecFile(cmd, args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

async function extractZipNative(zipFile, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const psCmd = `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    await runExecFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd]);
    return;
  }
  try {
    await runExecFile('unzip', ['-oq', zipFile, '-d', destDir]);
  } catch {
    await runExecFile('python3', ['-m', 'zipfile', '-e', zipFile, destDir]);
  }
}

function findExtractedAppRoot(dir) {
  if (fs.existsSync(path.join(dir, 'server.mjs'))) return dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const d of entries) {
    const sub = path.join(dir, d.name);
    if (fs.existsSync(path.join(sub, 'server.mjs'))) return sub;
  }
  return null;
}

export async function applySafeUpdateFromZip(zipFile, targetDir = __dirname) {
  const resolvedTarget = path.resolve(targetDir);
  const workDir = path.join(os.tmpdir(), `fgc-scorebars-extract-${Date.now()}`);
  try {
    await extractZipNative(zipFile, workDir);
    const appRoot = findExtractedAppRoot(workDir);
    if (!appRoot) {
      throw new Error('Downloaded archive is missing server.mjs — update aborted safely');
    }
    const ALLOWED_ROOT_FILE = /^([a-zA-Z0-9._-]+\.(html|js|mjs|bat|css|md)|LICENSE)$/i;
    const BLOCKED_ROOT_FILE = /^(trailer|\.env)/i;
    const ALLOWED_ASSET_FILE = /^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|svg)$/i;

    let filesUpdated = 0;
    const safeWriteFile = (srcPath, destRel) => {
      const normalized = path.normalize(destRel).replace(/^(\.\.[/\\])+/, '');
      if (/^[/\\]?(data|\.git|docs)([/\\]|$)/i.test(normalized)) return;
      const dstPath = path.join(resolvedTarget, normalized);
      if (!dstPath.startsWith(resolvedTarget + path.sep)) return;
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      const tmp = `${dstPath}.upd.tmp`;
      fs.copyFileSync(srcPath, tmp);
      try {
        fs.renameSync(tmp, dstPath);
      } catch {
        // Windows fallback if file lock momentarily resists rename
        fs.copyFileSync(srcPath, dstPath);
        try { fs.unlinkSync(tmp); } catch {}
      }
      filesUpdated++;
    };

    for (const ent of fs.readdirSync(appRoot, { withFileTypes: true })) {
      if (ent.isFile() && ALLOWED_ROOT_FILE.test(ent.name) && !BLOCKED_ROOT_FILE.test(ent.name)) {
        safeWriteFile(path.join(appRoot, ent.name), ent.name);
      }
    }
    const assetsSrc = path.join(appRoot, 'assets');
    if (fs.existsSync(assetsSrc) && fs.statSync(assetsSrc).isDirectory()) {
      for (const ent of fs.readdirSync(assetsSrc, { withFileTypes: true })) {
        if (ent.isFile() && ALLOWED_ASSET_FILE.test(ent.name)) {
          safeWriteFile(path.join(assetsSrc, ent.name), path.join('assets', ent.name));
        }
      }
    }
    if (filesUpdated === 0) {
      throw new Error('No valid app files found in release archive');
    }
    return { filesUpdated };
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function applySafeUpdate(downloadUrl) {
  if (!isAllowedUpdateHost(downloadUrl)) {
    throw new Error('Refused update download from untrusted host');
  }
  const tmpDir = path.join(os.tmpdir(), `fgc-scorebars-dl-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'release.zip');
  try {
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': `FGC-Open-Scorebars/${APP_VERSION}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(45000)
    });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    if (res.url && !isAllowedUpdateHost(res.url)) {
      throw new Error('Redirected to untrusted host — update aborted');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024 || buf.length > 50 * 1024 * 1024) {
      throw new Error('Unexpected archive size — update aborted');
    }
    fs.writeFileSync(zipPath, buf);
    return await applySafeUpdateFromZip(zipPath);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
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
    req.socket?.setTimeout(0);
    req.socket?.setNoDelay(true);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: state\ndata: ${JSON.stringify(currentState)}\n\n`);
    res.write(`event: fonts\ndata: ${JSON.stringify(fontsDb)}\n\n`);
    sseClients.add(res);
    const cleanup = () => sseClients.delete(res);
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
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

  // --- API: Tournament Integrations Config (NEVER sends any token characters or hints to the browser!) ---
  if (pathname === '/api/integrations') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        provider: integrationsCfg.provider || 'startgg',
        startggUrl: integrationsCfg.startggUrl || '',
        hasStartggToken: Boolean(getAuthToken('startgg')),
        challongeUrl: integrationsCfg.challongeUrl || '',
        hasChallongeKey: Boolean(getAuthToken('challonge')),
        persistTokens: Boolean(integrationsCfg.persistTokens)
      });
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (body.action === 'clear') {
          const target = body.provider || 'all';
          if (target === 'all' || target === 'startgg') {
            sessionTokens.startgg = '';
            integrationsCfg.startggToken = '';
          }
          if (target === 'all' || target === 'challonge') {
            sessionTokens.challonge = '';
            integrationsCfg.challongeKey = '';
          }
          saveIntegrationsSafe();
          return sendJson(res, 200, {
            ok: true,
            hasStartggToken: Boolean(getAuthToken('startgg')),
            hasChallongeKey: Boolean(getAuthToken('challonge')),
            persistTokens: Boolean(integrationsCfg.persistTokens)
          });
        }
        if (body.provider) integrationsCfg.provider = body.provider;
        if (body.persistTokens !== undefined) integrationsCfg.persistTokens = Boolean(body.persistTokens);
        if (body.startggUrl !== undefined) integrationsCfg.startggUrl = String(body.startggUrl).trim();
        if (body.startggToken !== undefined && body.startggToken !== '__KEEP__') {
          sessionTokens.startgg = String(body.startggToken).trim();
        }
        if (body.challongeUrl !== undefined) integrationsCfg.challongeUrl = String(body.challongeUrl).trim();
        if (body.challongeKey !== undefined && body.challongeKey !== '__KEEP__') {
          sessionTokens.challonge = String(body.challongeKey).trim();
        }
        saveIntegrationsSafe();
        return sendJson(res, 200, {
          ok: true,
          hasStartggToken: Boolean(getAuthToken('startgg')),
          hasChallongeKey: Boolean(getAuthToken('challonge')),
          persistTokens: Boolean(integrationsCfg.persistTokens)
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // Helper: cache a tournament's remote logo locally into data/branding/ (zero CORS, works offline!)
  async function attachCachedTournamentLogo(snapshot) {
    const rawLogo = snapshot?.tournament?.logoUrl;
    if (!rawLogo) return snapshot;
    try {
      const cached = await assets.cacheRemoteBrandingLogo(rawLogo, snapshot.tournament.slug || snapshot.tournament.name);
      if (cached?.url) snapshot.tournament.cachedLogoUrl = cached.url;
    } catch {}
    return snapshot;
  }

  // --- API: Connect / Refresh Tournament (Start.gg | Challonge | Demo) ---
  if (pathname === '/api/tournament/connect' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const provider = body.provider || integrationsCfg.provider || 'startgg';
      integrationsCfg.provider = provider;

      if (provider === 'demo') {
        lastTournamentSnapshot = await attachCachedTournamentLogo(getDemoTournament());
        return sendJson(res, 200, lastTournamentSnapshot);
      }

      if (provider === 'startgg') {
        const url = String(body.url ?? integrationsCfg.startggUrl ?? '').trim();
        const token = getAuthToken('startgg', body.token);
        if (url) integrationsCfg.startggUrl = url;
        if (body.rememberToken !== undefined) integrationsCfg.persistTokens = Boolean(body.rememberToken);
        if (body.token && body.token !== '__KEEP__') sessionTokens.startgg = token;
        saveIntegrationsSafe();

        const data = await attachCachedTournamentLogo(await connectStartGG(url, token));
        lastTournamentSnapshot = data;
        return sendJson(res, 200, data);
      }

      if (provider === 'challonge') {
        const url = String(body.url ?? integrationsCfg.challongeUrl ?? '').trim();
        const key = getAuthToken('challonge', body.token);
        if (url) integrationsCfg.challongeUrl = url;
        if (body.rememberToken !== undefined) integrationsCfg.persistTokens = Boolean(body.rememberToken);
        if (body.token && body.token !== '__KEEP__') sessionTokens.challonge = key;
        saveIntegrationsSafe();

        const data = await attachCachedTournamentLogo(await connectChallonge(url, key));
        lastTournamentSnapshot = data;
        return sendJson(res, 200, data);
      }

      return sendJson(res, 400, { error: `Unknown provider: ${provider}` });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Pull & Cache Official Tournament / Event Logo (Start.gg | Challonge | Demo) ---
  if (pathname === '/api/tournament/logo' && req.method === 'POST') {
    try {
      const body = await readBody(req).catch(() => ({}));
      const provider = body.provider || lastTournamentSnapshot?.provider || integrationsCfg.provider || 'startgg';
      let tName = '';
      let tSlug = '';
      let rawLogo = '';

      if (lastTournamentSnapshot?.tournament?.cachedLogoUrl && (!body.provider || body.provider === lastTournamentSnapshot.provider)) {
        return sendJson(res, 200, {
          ok: true,
          provider: lastTournamentSnapshot.provider,
          tournamentName: lastTournamentSnapshot.tournament.name,
          tournamentSlug: lastTournamentSnapshot.tournament.slug,
          logoUrl: lastTournamentSnapshot.tournament.cachedLogoUrl
        });
      }

      if (provider === 'demo') {
        const demo = getDemoTournament();
        tName = demo.tournament.name;
        tSlug = demo.tournament.slug;
        rawLogo = demo.tournament.logoUrl;
      } else if (provider === 'startgg') {
        const url = String(body.url || integrationsCfg.startggUrl || '').trim();
        const token = getAuthToken('startgg', body.token);
        if (!url || !token) {
          return sendJson(res, 400, { error: 'Connect a start.gg tournament first in the Tournaments tab.' });
        }
        const meta = await fetchStartGGTournamentLogo(url, token);
        tName = meta.name;
        tSlug = meta.slug;
        rawLogo = meta.logoUrl;
      } else if (provider === 'challonge') {
        const url = String(body.url || integrationsCfg.challongeUrl || '').trim();
        const key = getAuthToken('challonge', body.token);
        if (!url || !key) {
          return sendJson(res, 400, { error: 'Connect a Challonge tournament first in the Tournaments tab.' });
        }
        const meta = await fetchChallongeTournamentLogo(url, key);
        tName = meta.name;
        tSlug = meta.slug;
        rawLogo = meta.logoUrl;
      }

      if (!rawLogo) {
        return sendJson(res, 404, { error: `No official event logo was found on ${provider.toUpperCase()} for "${tName || 'this tournament'}". You can still upload a custom PNG.` });
      }
      const cached = await assets.cacheRemoteBrandingLogo(rawLogo, tSlug || tName || 'event');
      const finalUrl = cached?.url || rawLogo;
      if (lastTournamentSnapshot?.tournament && lastTournamentSnapshot.tournament.slug === tSlug) {
        lastTournamentSnapshot.tournament.logoUrl = rawLogo;
        lastTournamentSnapshot.tournament.cachedLogoUrl = finalUrl;
      }
      return sendJson(res, 200, {
        ok: true,
        provider,
        tournamentName: tName,
        tournamentSlug: tSlug,
        logoUrl: finalUrl
      });
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
        const token = getAuthToken('startgg');
        const sets = await fetchStartGGEventSets(body.eventId, token);
        if (lastTournamentSnapshot) {
          lastTournamentSnapshot.selectedEventId = String(body.eventId);
          lastTournamentSnapshot.sets = sets;
        }
        return sendJson(res, 200, { sets });
      }
      if (provider === 'challonge') {
        const data = await connectChallonge(integrationsCfg.challongeUrl, getAuthToken('challonge'));
        lastTournamentSnapshot = data;
        return sendJson(res, 200, { sets: data.sets, streamQueue: data.streamQueue });
      }
      return sendJson(res, 400, { error: 'Unsupported provider' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Pull Final Tournament Standings (Top 8) from Start.gg / Challonge / Demo ---
  if (pathname === '/api/tournament/standings' && req.method === 'POST') {
    try {
      const body = await readBody(req).catch(() => ({}));
      const provider = body.provider || lastTournamentSnapshot?.provider || integrationsCfg.provider || 'startgg';
      let result = null;
      if (provider === 'demo') {
        result = getDemoStandings();
      } else if (provider === 'startgg') {
        let eventId = body.eventId || lastTournamentSnapshot?.selectedEventId;
        const token = getAuthToken('startgg', body.token);
        const url = String(body.url || integrationsCfg.startggUrl || '').trim();
        if (!eventId && url && token) {
          const snap = await attachCachedTournamentLogo(await connectStartGG(url, token));
          lastTournamentSnapshot = snap;
          eventId = snap.selectedEventId;
        }
        if (!eventId) throw new Error('Connect a start.gg event first in the Tournaments tab.');
        result = await fetchStartGGStandings(eventId, token);
      } else if (provider === 'challonge') {
        const url = String(body.url || integrationsCfg.challongeUrl || '').trim();
        const key = getAuthToken('challonge', body.token);
        if (!url || !key) throw new Error('Connect a Challonge tournament first in the Tournaments tab.');
        result = await fetchChallongeStandings(url, key);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      if (result?.logoUrl) {
        try {
          const cached = await assets.cacheRemoteBrandingLogo(result.logoUrl, result.tournamentSlug || result.tournamentName);
          if (cached?.url) result.cachedLogoUrl = cached.url;
        } catch {}
      }
      // Enrich characters/flags/avatars from saved local playersDb when missing
      for (const pl of (result.placements || [])) {
        const saved = playersDb.find(p => p.name.toLowerCase() === String(pl.name || '').toLowerCase());
        if (saved) {
          if (!pl.character && saved.character) pl.character = saved.character;
          if (!pl.sponsor && saved.sponsor) pl.sponsor = saved.sponsor;
          if (!pl.flag && saved.flag) pl.flag = saved.flag;
          if (!pl.region && saved.region) pl.region = saved.region;
          if (!pl.avatar && saved.avatar) pl.avatar = saved.avatar;
        }
      }
      return sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API: Pull Top 8 Bracket Tree from Start.gg / Challonge / Demo ---
  if (pathname === '/api/tournament/top8-bracket' && req.method === 'POST') {
    try {
      const body = await readBody(req).catch(() => ({}));
      const provider = body.provider || lastTournamentSnapshot?.provider || integrationsCfg.provider || 'startgg';
      let result = null;
      if (provider === 'demo') {
        result = getDemoTop8Bracket();
      } else if (provider === 'startgg') {
        let eventId = body.eventId || lastTournamentSnapshot?.selectedEventId;
        const token = getAuthToken('startgg', body.token);
        const url = String(body.url || integrationsCfg.startggUrl || '').trim();
        if (!eventId && url && token) {
          const snap = await attachCachedTournamentLogo(await connectStartGG(url, token));
          lastTournamentSnapshot = snap;
          eventId = snap.selectedEventId;
        }
        if (!eventId) throw new Error('Connect a start.gg event first in the Tournaments tab.');
        result = await fetchStartGGTop8Bracket(eventId, token);
      } else if (provider === 'challonge') {
        const url = String(body.url || integrationsCfg.challongeUrl || '').trim();
        const key = getAuthToken('challonge', body.token);
        if (!url || !key) throw new Error('Connect a Challonge tournament first in the Tournaments tab.');
        result = await fetchChallongeTop8Bracket(url, key);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      return sendJson(res, 200, { ok: true, ...result });
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
        imported = await fetchStartGGEntrants(eventId, getAuthToken('startgg'));
      } else if (provider === 'challonge') {
        const snap = lastTournamentSnapshot?.provider === 'challonge'
          ? lastTournamentSnapshot
          : await connectChallonge(integrationsCfg.challongeUrl, getAuthToken('challonge'));
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
          token: getAuthToken('startgg')
        });
      } else if (provider === 'challonge') {
        result = await reportChallongeMatch({
          tournamentSlug: tournamentSlug || lastTournamentSnapshot?.tournament?.slug,
          matchId: setId,
          winnerEntrantId,
          p1Score,
          p2Score,
          apiKey: getAuthToken('challonge'),
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
      const allowedHosts = ['images.start.gg', 'www.start.gg', 'start.gg', 'images.smash.gg', 'challonge.com', 'assets.challonge.com', 'secure.gravatar.com', 's3.amazonaws.com'];
      if (parsed.protocol !== 'https:' || !allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
        res.writeHead(403);
        return res.end('Host not allowed');
      }
      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'FGC-Open-Scorebars/1.1' },
        signal: AbortSignal.timeout(8000)
      });
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

  // --- API: Global Custom PC Fonts (Upload .ttf/.otf/.woff/.woff2 OR Register System Font) ---
  if (pathname === '/api/fonts') {
    if (req.method === 'GET') {
      return sendJson(res, 200, fontsDb);
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req, 16 * 1024 * 1024);
        const action = String(body.action || 'upload').toLowerCase();
        if (action === 'delete' && body.id) {
          const id = String(body.id);
          const target = fontsDb.find(f => f.id === id);
          if (target && target.kind === 'file' && target.file) {
            const fp = path.join(FONTS_DIR, path.basename(target.file));
            if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
          }
          fontsDb = fontsDb.filter(f => f.id !== id);
          writeJsonAtomic(FONTS_FILE, fontsDb);
          broadcastFonts();
          return sendJson(res, 200, { ok: true, fonts: fontsDb });
        }
        if (action === 'add-system') {
          const family = String(body.family || body.name || '').trim().slice(0, 80);
          if (!family) throw new Error('Font family name is required');
          const name = String(body.name || family).trim().slice(0, 60);
          const slug = 'sys-' + family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
          const id = slug || `sys-${Date.now()}`;
          const entry = { id, name, kind: 'system', family, addedAt: Date.now() };
          const idx = fontsDb.findIndex(f => f.id === id || (f.kind === 'system' && f.family.toLowerCase() === family.toLowerCase()));
          if (idx >= 0) fontsDb[idx] = entry;
          else fontsDb.unshift(entry);
          fontsDb = fontsDb.slice(0, 80);
          writeJsonAtomic(FONTS_FILE, fontsDb);
          broadcastFonts();
          return sendJson(res, 200, { ok: true, font: entry, fonts: fontsDb });
        }
        // Default: upload font file (.ttf, .otf, .woff, .woff2)
        const rawFilename = String(body.filename || 'custom-font.ttf').trim();
        const ext = path.extname(rawFilename).toLowerCase();
        const fmtMap = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
        if (!fmtMap[ext]) throw new Error('Supported font formats: .ttf, .otf, .woff, .woff2');
        const rawData = String(body.dataUrl || body.base64 || '');
        const commaIdx = rawData.indexOf(',');
        const b64 = commaIdx >= 0 ? rawData.slice(commaIdx + 1) : rawData;
        if (!b64) throw new Error('Missing font file data');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 32 || buf.length > 11 * 1024 * 1024) {
          throw new Error('Font file must be between 32 bytes and 11 MB');
        }
        const baseClean = path.basename(rawFilename, ext).replace(/[_-]+/g, ' ').trim();
        const displayName = String(body.name || baseClean || 'Custom Font').trim().slice(0, 60);
        const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || `font-${Date.now()}`;
        const fileName = `${slug}${ext}`;
        fs.mkdirSync(FONTS_DIR, { recursive: true });
        fs.writeFileSync(path.join(FONTS_DIR, fileName), buf);
        const entry = {
          id: slug,
          name: displayName,
          kind: 'file',
          file: fileName,
          url: `/media/fonts/${encodeURIComponent(fileName)}`,
          format: fmtMap[ext],
          sizeBytes: buf.length,
          addedAt: Date.now()
        };
        const idx = fontsDb.findIndex(f => f.id === slug);
        if (idx >= 0) fontsDb[idx] = entry;
        else fontsDb.unshift(entry);
        fontsDb = fontsDb.slice(0, 80);
        writeJsonAtomic(FONTS_FILE, fontsDb);
        broadcastFonts();
        return sendJson(res, 200, { ok: true, font: entry, fonts: fontsDb });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // --- Local Uploaded Font Serving (/media/fonts/filename) ---
  const fontMediaMatch = pathname.match(/^\/media\/fonts\/(.+)$/);
  if (fontMediaMatch && req.method === 'GET') {
    const safeName = path.basename(decodeURIComponent(fontMediaMatch[1]));
    const fp = path.join(FONTS_DIR, safeName);
    const ext = path.extname(fp).toLowerCase();
    if (!['.ttf', '.otf', '.woff', '.woff2'].includes(ext) || !fs.existsSync(fp)) {
      res.writeHead(404);
      return res.end('Font not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    return fs.createReadStream(fp).pipe(res);
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

  // --- API: Version Check & 1-Click Data-Safe Auto-Updater (GitHub Releases) ---
  if (pathname === '/api/update/check' && req.method === 'GET') {
    const force = urlObj.searchParams.get('force') === '1';
    const info = await checkGithubUpdate(force);
    return sendJson(res, 200, info);
  }

  if (pathname === '/api/update/apply' && req.method === 'POST') {
    try {
      const info = await checkGithubUpdate(true);
      if (info.status === 'offline') {
        throw new Error('No internet connection to reach GitHub Releases');
      }
      if (info.status !== 'update-available') {
        return sendJson(res, 200, {
          ok: true,
          alreadyUpToDate: true,
          previousVersion: APP_VERSION,
          updatedTo: APP_VERSION,
          filesUpdated: 0,
          canAutoRestart: true
        });
      }
      if (!info.downloadUrl) {
        throw new Error('No downloadable release package found on GitHub');
      }
      const result = await applySafeUpdate(info.downloadUrl);
      updateCache = null;
      return sendJson(res, 200, {
        ok: true,
        previousVersion: APP_VERSION,
        updatedTo: info.latestVersion,
        filesUpdated: result.filesUpdated,
        canAutoRestart: true
      });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/update/restart' && req.method === 'POST') {
    sendJson(res, 200, { ok: true, restarting: true, launcher: process.env.FGC_LAUNCHER === '1' });
    setTimeout(() => {
      for (const client of sseClients) {
        try { client.end(); } catch {}
      }
      sseClients.clear();
      const finishRestart = () => {
        if (process.env.FGC_LAUNCHER === '1') {
          process.exit(42);
        } else {
          try {
            const childEnv = { ...process.env, FGC_BOOT_DELAY_MS: '650' };
            const child = spawn(process.execPath, [__filename], {
              cwd: __dirname,
              detached: true,
              stdio: 'ignore',
              env: childEnv
            });
            child.unref();
          } catch {}
          process.exit(0);
        }
      };
      try {
        server.close(finishRestart);
        server.closeAllConnections?.();
      } catch {
        finishRestart();
      }
      setTimeout(finishRestart, 450).unref?.();
    }, 220);
    return;
  }

  // --- API: Server Info (URLs, LAN IPs, client count, app version) ---
  if (pathname === '/api/info' && req.method === 'GET') {
    const ranked = getRankedNetworkInterfaces();
    const lanIps = getLanIps();
    return sendJson(res, 200, {
      version: APP_VERSION,
      repo: GITHUB_REPO,
      canAutoRestart: true,
      port: PORT,
      overlayUrl: `http://localhost:${PORT}/`,
      vsOverlayUrl: `http://localhost:${PORT}/vs.html`,
      resultsOverlayUrl: `http://localhost:${PORT}/results.html`,
      bracketOverlayUrl: `http://localhost:${PORT}/bracket.html`,
      castersOverlayUrl: `http://localhost:${PORT}/casters.html`,
      panelUrl: `http://localhost:${PORT}/panel.html`,
      lanPanelUrls: lanIps.map(ip => `http://${ip}:${PORT}/panel.html`),
      networkInterfaces: ranked.map(n => ({
        name: n.name,
        ip: n.ip,
        kind: n.kind,
        url: `http://${n.ip}:${PORT}/panel.html`
      })),
      connectedClients: sseClients.size
    });
  }

  // --- Valquiria StreamControl JSON compatibility endpoint ---
  if (pathname === '/streamcontrol.json' && req.method === 'GET') {
    const m = currentState.bracket?.matches || {};
    const cm = currentState.commentators || {};
    const flat = {
      timestamp: String(Math.floor((currentState.updatedAt || Date.now()) / 1000)),
      p1Team: currentState.p1?.sponsor || '',
      pName1: currentState.p1?.name || '',
      pCountry1: currentState.p1?.flag || '',
      pScore1: String(currentState.p1?.score ?? 0),
      p2Team: currentState.p2?.sponsor || '',
      pName2: currentState.p2?.name || '',
      pCountry2: currentState.p2?.flag || '',
      pScore2: String(currentState.p2?.score ?? 0),
      round: currentState.round || '',
      textbottom: currentState.round || '',
      comm1name: cm.c1Name || '',
      comm1twit: cm.c1Handle || '',
      comm2name: cm.c2Name || '',
      comm2twit: cm.c2Handle || '',
      TOP8text: currentState.bracket?.bottomText || '',
      ws1p1: m.ws1?.p1 || '', ws1p1s: m.ws1?.p1s || '', ws1p2: m.ws1?.p2 || '', ws1p2s: m.ws1?.p2s || '',
      ws2p1: m.ws2?.p1 || '', ws2p1s: m.ws2?.p1s || '', ws2p2: m.ws2?.p2 || '', ws2p2s: m.ws2?.p2s || '',
      wfp1: m.wf?.p1 || '', wfp1s: m.wf?.p1s || '', wfp2: m.wf?.p2 || '', wfp2s: m.wf?.p2s || '',
      ltop81p1: m.ltop81?.p1 || '', ltop81p1s: m.ltop81?.p1s || '', ltop81p2: m.ltop81?.p2 || '', ltop81p2s: m.ltop81?.p2s || '',
      ltop82p1: m.ltop82?.p1 || '', ltop82p1s: m.ltop82?.p1s || '', ltop82p2: m.ltop82?.p2 || '', ltop82p2s: m.ltop82?.p2s || '',
      lq1p1: m.lq1?.p1 || '', lq1p1s: m.lq1?.p1s || '', lq1p2: m.lq1?.p2 || '', lq1p2s: m.lq1?.p2s || '',
      lq2p1: m.lq2?.p1 || '', lq2p1s: m.lq2?.p1s || '', lq2p2: m.lq2?.p2 || '', lq2p2s: m.lq2?.p2s || '',
      lsp1: m.ls?.p1 || '', lsp1s: m.ls?.p1s || '', lsp2: m.ls?.p2 || '', lsp2s: m.ls?.p2s || '',
      lfp1: m.lf?.p1 || '', lfp1s: m.lf?.p1s || '', lfp2: m.lf?.p2 || '', lfp2s: m.lf?.p2s || '',
      gfp1: m.gf?.p1 || '', gfp1s: m.gf?.p1s || '', gfp2: m.gf?.p2 || '', gfp2s: m.gf?.p2s || '',
      gfrp1: m.gfr?.p1 || '', gfrp1s: m.gfr?.p1s || '', gfrp2: m.gfr?.p2 || '', gfrp2s: m.gfr?.p2s || ''
    };
    return sendJson(res, 200, flat);
  }

  // --- Static file serving (strictly blocks /data/ so tokens/state JSON are never served publicly!) ---
  let relPath =
    pathname === '/' ? '/index.html' :
    pathname === '/panel' ? '/panel.html' :
    pathname === '/vs' ? '/vs.html' :
    pathname === '/results' ? '/results.html' :
    pathname === '/bracket' ? '/bracket.html' :
    pathname === '/casters' ? '/casters.html' : pathname;
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

function startListening() {
  server.listen(PORT, HOST, () => {
    const ranked = getRankedNetworkInterfaces();
    const primaryLan = ranked.find(n => n.kind === 'lan') || ranked[0];
    console.log('\n=======================================================');
    console.log(`  FGC OPEN SCOREBARS v${APP_VERSION} — LOCAL SERVER RUNNING (0 deps)`);
    console.log('=======================================================');
    console.log(`  Scorebar Overlay (OBS):   http://localhost:${PORT}/`);
    console.log(`  VS Splash Overlay (OBS):  http://localhost:${PORT}/vs.html`);
    console.log(`  Results Overlay (OBS):    http://localhost:${PORT}/results.html`);
    console.log(`  Bracket Overlay (OBS):    http://localhost:${PORT}/bracket.html`);
    console.log(`  Casters Overlay (OBS):    http://localhost:${PORT}/casters.html`);
    console.log(`  Local Control Panel:      http://localhost:${PORT}/panel.html`);
    if (primaryLan) {
      console.log(`  Mobile / Tablet LAN UI:   http://${primaryLan.ip}:${PORT}/panel.html (${primaryLan.name})`);
    }
    console.log('=======================================================\n');
  });
}

if (process.env.FGC_NO_LISTEN !== '1') {
  const bootDelay = Math.max(0, Math.min(5000, Number(process.env.FGC_BOOT_DELAY_MS || 0) || 0));
  if (bootDelay > 0) setTimeout(startListening, bootDelay);
  else startListening();
}
