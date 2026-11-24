/**
 * FGC Open Scorebars — Multi-Game Character Asset & Cache Manager (0 dependencies)
 * Powered by the open community StreamHelperAssets repository (github.com/joaorb64/StreamHelperAssets).
 *
 * All downloaded character renders & metadata are cached locally inside data/assets/
 * (excluded from Git via .gitignore) so tournaments run 100% offline once cached.
 */

import fs from 'node:fs';
import path from 'node:path';

const RAW_BASE = 'https://raw.githubusercontent.com/joaorb64/StreamHelperAssets/main';

export const FEATURED_GAMES = [
  { id: 'tekken8', name: 'Tekken 8',                          defaultPack: 'full', packs: ['full', 'vs_renders', 'costume_select'] },
  { id: 'sf6',     name: 'Street Fighter 6',                  defaultPack: 'full', packs: ['full', 'versus_screen', 'art', 'comic', 'chibi', 'pixel_art'] },
  { id: 'ggst',    name: 'Guilty Gear -STRIVE-',              defaultPack: 'full', packs: ['full', 'chibi'] },
  { id: 'riotpl',  name: '2XKO',                              defaultPack: 'full', packs: ['full', 'lol'] },
  { id: 'ffcotw',  name: 'Fatal Fury: City of the Wolves',    defaultPack: 'full', packs: ['full'] },
  { id: 'gbvsr',   name: 'Granblue Fantasy Versus: Rising',   defaultPack: 'full', packs: ['full'] },
  { id: 'dnfduel', name: 'DNF Duel',                          defaultPack: 'full', packs: ['full', 'mobile'] },
  { id: 'dbfz',    name: 'Dragon Ball FighterZ',              defaultPack: 'full', packs: ['full'] },
  { id: 'uni2',    name: 'Under Night In-Birth II [Sys:Celes]', defaultPack: 'full', packs: ['full', 'chibi'] },
  { id: 'umvc3',   name: 'Ultimate Marvel vs. Capcom 3',      defaultPack: 'full', packs: ['full'] },
  { id: 'mk1',     name: 'Mortal Kombat 1',                   defaultPack: 'full', packs: ['full', 'portrait', 'costume'] },
  { id: 'ssbu',    name: 'Super Smash Bros. Ultimate',        defaultPack: 'full', packs: ['full', 'vs_renders', 'portrait', 'mural_art'] }
];

const FALLBACK_T8_ROSTER = [
  'Alisa', 'Anna', 'Armor King', 'Asuka', 'Azucena', 'Bryan Fury', 'Claudio', 'Clive',
  'Devil Jin', 'Dragunov', 'Eddy', 'Fahkumram', 'Feng', 'Heihachi', 'Hwoarang', 'Jack-8',
  'Jin Kazama', 'Jun Kazama', 'Kazuya Mishima', 'King', 'Kuma', 'Lars', 'Lee Chaolan',
  'Leo', 'Leroy', 'Lidia', 'Lili', 'Marshall Law', 'Nina Williams', 'Panda', 'Paul Phoenix',
  'Raven', 'Reina', 'Shaheen', 'Steve', 'Victor', 'Xiaoyu', 'Yoshimitsu', 'Zafina'
];

function safeSeg(s) {
  return String(s || '').replace(/[^a-zA-Z0-9._-]/g, '');
}

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createAssetManager(dataDir) {
  const ASSETS_DIR = path.join(dataDir, 'assets');
  const AVATARS_DIR = path.join(dataDir, 'avatars');
  const BRANDING_DIR = path.join(dataDir, 'branding');
  const CUSTOM_CHAR_DIR = path.join(ASSETS_DIR, '_custom');
  const INDEX_CACHE_FILE = path.join(ASSETS_DIR, 'catalog_index.json');

  for (const d of [ASSETS_DIR, AVATARS_DIR, BRANDING_DIR, CUSTOM_CHAR_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const memConfigCache = new Map();
  const inFlightRenders = new Map();
  let remoteCatalogCache = null;

  const downloadJob = {
    running: false,
    game: '',
    pack: '',
    done: 0,
    total: 0,
    cached: 0,
    failed: 0,
    currentChar: '',
    error: ''
  };

  function readJsonFile(fp) {
    try {
      if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {}
    return null;
  }

  function writeJsonAtomic(fp, obj) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, fp);
  }

  async function fetchRemoteJson(relPath, localCachePath, maxAgeMs = 12 * 3600 * 1000) {
    const cached = readJsonFile(localCachePath);
    if (cached && cached._fetchedAt && (Date.now() - cached._fetchedAt) < maxAgeMs) {
      return cached;
    }
    try {
      const res = await fetch(`${RAW_BASE}/${relPath}`, {
        headers: { 'User-Agent': 'FGC-Open-Scorebars/1.1' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        if (cached) return cached;
        throw new Error(`Asset config HTTP ${res.status} for ${relPath}`);
      }
      const data = await res.json();
      data._fetchedAt = Date.now();
      writeJsonAtomic(localCachePath, data);
      return data;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }

  async function getFullRemoteIndex() {
    if (remoteCatalogCache) return remoteCatalogCache;
    try {
      const idx = await fetchRemoteJson('assets.json', INDEX_CACHE_FILE, 24 * 3600 * 1000);
      remoteCatalogCache = idx;
      return idx;
    } catch {
      return null;
    }
  }

  function countCachedPngs(gameId, packId) {
    const dir = path.join(ASSETS_DIR, safeSeg(gameId), safeSeg(packId));
    try {
      if (!fs.existsSync(dir)) return 0;
      return fs.readdirSync(dir).filter(f => /\.(png|webp|jpg|jpeg)$/i.test(f)).length;
    } catch {
      return 0;
    }
  }

  async function listGames(includeAll = false) {
    const idx = await getFullRemoteIndex();
    const featuredIds = new Set(FEATURED_GAMES.map(g => g.id));

    const buildGameInfo = (id, fallbackName, fallbackPacks) => {
      const remote = idx?.[id];
      const packsObj = remote?.assets || {};
      const packKeys = Object.keys(packsObj).filter(p => p !== 'base_files' && p !== 'stage_icon' && p !== 'variant_icon');
      const packs = packKeys.length ? packKeys : (fallbackPacks || ['full']);
      const defaultPack = packs.includes('full') ? 'full' : packs[0] || 'full';
      const cachedCounts = {};
      for (const p of packs) cachedCounts[p] = countCachedPngs(id, p);
      return {
        id,
        name: remote?.name || fallbackName || id.toUpperCase(),
        featured: featuredIds.has(id),
        defaultPack,
        packs: packs.map(p => ({
          id: p,
          name: packsObj[p]?.name || p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          cachedCount: cachedCounts[p] || 0
        }))
      };
    };

    const featured = FEATURED_GAMES.map(g => buildGameInfo(g.id, g.name, g.packs));
    if (!includeAll || !idx) {
      return { featured, totalCatalogGames: idx ? Object.keys(idx).filter(k => !k.startsWith('_')).length : featured.length, all: featured };
    }

    const others = [];
    for (const key of Object.keys(idx)) {
      if (key.startsWith('_') || featuredIds.has(key)) continue;
      const g = idx[key];
      const packsObj = g?.assets || {};
      const packKeys = Object.keys(packsObj).filter(p => p !== 'base_files' && p !== 'stage_icon' && p !== 'variant_icon');
      if (!packKeys.length) continue;
      others.push(buildGameInfo(key, g.name || key, packKeys));
    }
    others.sort((a, b) => a.name.localeCompare(b.name));
    return {
      featured,
      totalCatalogGames: featured.length + others.length,
      all: [...featured, ...others]
    };
  }

  async function getGameConfigs(gameId, packId = 'full') {
    const g = safeSeg(gameId || 'tekken8');
    const p = safeSeg(packId || 'full');
    const memKey = `${g}/${p}`;
    if (memConfigCache.has(memKey)) return memConfigCache.get(memKey);

    const baseFile = path.join(ASSETS_DIR, g, 'base_config.json');
    const packFile = path.join(ASSETS_DIR, g, `${p}_config.json`);

    const [baseCfg, packCfg] = await Promise.all([
      fetchRemoteJson(`games/${g}/base_files/config.json`, baseFile),
      fetchRemoteJson(`games/${g}/${p}/config.json`, packFile)
    ]);

    const result = { game: g, pack: p, baseCfg, packCfg };
    memConfigCache.set(memKey, result);
    return result;
  }

  function buildCharFilename(packCfg, codename, skinIdx = 0) {
    const prefix = packCfg?.prefix || '';
    const postfix = packCfg?.postfix || '';
    return `${prefix}${codename}${postfix}${skinIdx}.png`;
  }

  function getCustomCharFile(gameId, charName) {
    const key = `${safeSeg(gameId)}__${norm(charName).replace(/\s+/g, '_')}`;
    for (const ext of ['.png', '.webp', '.jpg', '.jpeg']) {
      const fp = path.join(CUSTOM_CHAR_DIR, `${key}${ext}`);
      if (fs.existsSync(fp)) return fp;
    }
    return null;
  }

  function matchCharacterEntry(baseCfg, queryName) {
    const map = baseCfg?.character_to_codename || {};
    const q = norm(queryName);
    if (!q) return null;

    // 1. Exact full name / smashgg_name / codename match
    for (const [displayName, meta] of Object.entries(map)) {
      if (displayName.toLowerCase() === 'random') continue;
      if (
        norm(displayName) === q ||
        norm(meta?.smashgg_name) === q ||
        norm(meta?.codename) === q ||
        norm(meta?.en_name) === q
      ) {
        return { displayName, ...meta };
      }
    }
    // 2. Clean prefix / word match (e.g., "Bryan Fury" <-> "Bryan", "Xiao" <-> "Ling Xiaoyu")
    for (const [displayName, meta] of Object.entries(map)) {
      if (displayName.toLowerCase() === 'random') continue;
      const dn = norm(displayName);
      const sn = norm(meta?.smashgg_name || '');
      if (dn.includes(q) || q.includes(dn) || (sn && (sn.includes(q) || q.includes(sn)))) {
        return { displayName, ...meta };
      }
    }
    return null;
  }

  async function getRoster(gameId = 'tekken8', packId = 'full') {
    const g = safeSeg(gameId || 'tekken8');
    const p = safeSeg(packId || 'full');
    try {
      const { baseCfg, packCfg } = await getGameConfigs(g, p);
      const packDir = path.join(ASSETS_DIR, g, p);
      const map = baseCfg.character_to_codename || {};
      const characters = [];

      for (const [displayName, meta] of Object.entries(map)) {
        if (displayName.toLowerCase() === 'random') continue;
        const codename = meta?.codename;
        if (!codename) continue;
        const filename = buildCharFilename(packCfg, codename, 0);
        const localPath = path.join(packDir, filename);
        const customFile = getCustomCharFile(g, displayName);
        const eye = packCfg?.eyesights?.[codename]?.['0'] || null;
        const size = packCfg?.image_sizes?.[codename]?.['0'] || null;
        const rescale = packCfg?.rescaling_factor?.[codename]?.['0'] || 1;
        characters.push({
          name: displayName,
          shortName: meta?.smashgg_name || displayName,
          codename,
          filename,
          cached: Boolean(customFile) || fs.existsSync(localPath),
          custom: Boolean(customFile),
          eyesight: eye,
          size,
          rescale
        });
      }
      characters.sort((a, b) => a.name.localeCompare(b.name));
      const cachedCount = characters.filter(c => c.cached).length;
      return {
        game: g,
        gameName: baseCfg.name || g.toUpperCase(),
        pack: p,
        packName: packCfg.name || p,
        credits: packCfg.credits || 'StreamHelperAssets Community',
        total: characters.length,
        cachedCount,
        characters
      };
    } catch (err) {
      // Offline fallback for Tekken 8 if never fetched yet
      if (g === 'tekken8') {
        return {
          game: 'tekken8',
          gameName: 'Tekken 8',
          pack: p,
          packName: p,
          offlineFallback: true,
          error: err.message,
          total: FALLBACK_T8_ROSTER.length,
          cachedCount: 0,
          characters: FALLBACK_T8_ROSTER.map(name => ({
            name, shortName: name, codename: norm(name), cached: false, custom: Boolean(getCustomCharFile('tekken8', name)),
            eyesight: null, size: null, rescale: 1
          }))
        };
      }
      throw err;
    }
  }

  /**
   * Resolves a character render PNG on disk; if not cached yet, fetches it on demand
   * from StreamHelperAssets and caches it atomically under data/assets/<game>/<pack>/.
   */
  async function ensureCharacterRender(gameId, packId, charQuery, skinIdx = 0) {
    const g = safeSeg(gameId || 'tekken8');
    const p = safeSeg(packId || 'full');

    // 1. Check custom user-uploaded PNG first
    const customFile = getCustomCharFile(g, charQuery);
    if (customFile) {
      return { filePath: customFile, custom: true };
    }

    const { baseCfg, packCfg } = await getGameConfigs(g, p);
    const matched = matchCharacterEntry(baseCfg, charQuery);
    if (!matched?.codename) return null;

    // Also check custom upload keyed by canonical displayName
    const customCanon = getCustomCharFile(g, matched.displayName);
    if (customCanon) return { filePath: customCanon, custom: true };

    const filename = buildCharFilename(packCfg, matched.codename, skinIdx);
    const packDir = path.join(ASSETS_DIR, g, p);
    fs.mkdirSync(packDir, { recursive: true });
    const localPath = path.join(packDir, filename);

    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 200) {
      return {
        filePath: localPath,
        codename: matched.codename,
        displayName: matched.displayName,
        eyesight: packCfg?.eyesights?.[matched.codename]?.[String(skinIdx)] || null,
        size: packCfg?.image_sizes?.[matched.codename]?.[String(skinIdx)] || null
      };
    }

    // Download from StreamHelperAssets raw CDN and cache atomically (coalesce concurrent requests)
    const flightKey = `${g}/${p}/${filename}`;
    if (inFlightRenders.has(flightKey)) {
      return inFlightRenders.get(flightKey);
    }
    const task = (async () => {
      const remoteUrl = `${RAW_BASE}/games/${g}/${p}/${encodeURIComponent(filename)}`;
      const res = await fetch(remoteUrl, {
        headers: { 'User-Agent': 'FGC-Open-Scorebars/1.1' },
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        // Fallback to skin 0 if requested alt skin doesn't exist
        if (skinIdx !== 0) return ensureCharacterRender(g, p, charQuery, 0);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const tmp = `${localPath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, localPath);

      return {
        filePath: localPath,
        codename: matched.codename,
        displayName: matched.displayName,
        eyesight: packCfg?.eyesights?.[matched.codename]?.[String(skinIdx)] || null,
        size: packCfg?.image_sizes?.[matched.codename]?.[String(skinIdx)] || null
      };
    })();
    inFlightRenders.set(flightKey, task);
    try {
      return await task;
    } finally {
      inFlightRenders.delete(flightKey);
    }
  }

  /**
   * Bulk-downloads all character renders in a chosen game/pack into data/assets/<game>/<pack>/
   * with a concurrency pool of 6 so an entire roster caches offline in seconds.
   */
  async function startPackDownload(gameId, packId = 'full') {
    if (downloadJob.running) {
      return { alreadyRunning: true, ...downloadJob };
    }
    const g = safeSeg(gameId || 'tekken8');
    const p = safeSeg(packId || 'full');
    const roster = await getRoster(g, p);

    Object.assign(downloadJob, {
      running: true,
      game: g,
      pack: p,
      done: 0,
      total: roster.characters.length,
      cached: roster.cachedCount,
      failed: 0,
      currentChar: 'Starting...',
      error: ''
    });

    const queue = [...roster.characters];
    const concurrency = 6;

    const worker = async () => {
      while (queue.length > 0 && downloadJob.running) {
        const ch = queue.shift();
        if (!ch) break;
        downloadJob.currentChar = ch.name;
        try {
          const ok = await ensureCharacterRender(g, p, ch.name, 0);
          if (ok) downloadJob.cached++;
          else downloadJob.failed++;
        } catch {
          downloadJob.failed++;
        }
        downloadJob.done++;
      }
    };

    Promise.all(Array.from({ length: concurrency }, () => worker()))
      .catch(err => { downloadJob.error = err.message; })
      .finally(() => {
        downloadJob.running = false;
        downloadJob.currentChar = 'Done';
      });

    return { started: true, ...downloadJob };
  }

  function getDownloadStatus() {
    return { ...downloadJob };
  }

  function clearPackCache(gameId, packId) {
    const g = safeSeg(gameId);
    const p = safeSeg(packId);
    if (!g || !p) throw new Error('Missing game or pack id');
    const dir = path.join(ASSETS_DIR, g, p);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    memConfigCache.delete(`${g}/${p}`);
    return { cleared: true, game: g, pack: p };
  }

  /**
   * Saves a base64 data URL image uploaded from the Control Panel into
   * data/avatars/, data/branding/, or data/assets/_custom/.
   */
  function saveUploadedImage({ kind, name, dataUrl, game }) {
    const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/i);
    if (!m) throw new Error('Invalid image format. Please upload PNG, JPG, WebP, or SVG.');
    const rawExt = m[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? '.jpg' : rawExt === 'svg+xml' ? '.svg' : `.${rawExt}`;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) throw new Error('Image exceeds 6 MB limit.');

    if (kind === 'avatar') {
      const slug = (norm(name || `player_${Date.now()}`).replace(/\s+/g, '_') || `player_${Date.now()}`).slice(0, 48);
      const fname = `${slug}_${Date.now().toString(36)}${ext}`;
      const fp = path.join(AVATARS_DIR, fname);
      fs.writeFileSync(fp, buf);
      return { url: `/media/avatars/${encodeURIComponent(fname)}`, filePath: fp };
    }

    if (kind === 'logo') {
      const fname = `tournament_logo_${Date.now().toString(36)}${ext}`;
      const fp = path.join(BRANDING_DIR, fname);
      fs.writeFileSync(fp, buf);
      return { url: `/media/branding/${encodeURIComponent(fname)}`, filePath: fp };
    }

    if (kind === 'character') {
      const g = safeSeg(game || 'tekken8');
      const slug = norm(name || '').replace(/\s+/g, '_');
      if (!slug) throw new Error('Select or enter a character name first.');
      // Remove any older extension for the same game+character
      for (const oldExt of ['.png', '.webp', '.jpg', '.jpeg', '.svg']) {
        const oldFp = path.join(CUSTOM_CHAR_DIR, `${g}__${slug}${oldExt}`);
        if (fs.existsSync(oldFp)) fs.unlinkSync(oldFp);
      }
      const fname = `${g}__${slug}${ext}`;
      const fp = path.join(CUSTOM_CHAR_DIR, fname);
      fs.writeFileSync(fp, buf);
      return { url: `/media/custom/${encodeURIComponent(fname)}`, filePath: fp };
    }

    throw new Error(`Unsupported upload kind: ${kind}`);
  }

  function resolveMediaFile(kind, filename) {
    const cleanName = path.basename(decodeURIComponent(filename || ''));
    if (!cleanName || cleanName.includes('..') || cleanName.endsWith('.json')) return null;
    const baseDir =
      kind === 'avatars' ? AVATARS_DIR :
      kind === 'branding' ? BRANDING_DIR :
      kind === 'custom' ? CUSTOM_CHAR_DIR : null;
    if (!baseDir) return null;
    const fp = path.join(baseDir, cleanName);
    if (!fp.startsWith(baseDir) || !fs.existsSync(fp)) return null;
    return fp;
  }

  return {
    listGames,
    getRoster,
    ensureCharacterRender,
    startPackDownload,
    getDownloadStatus,
    clearPackCache,
    saveUploadedImage,
    resolveMediaFile
  };
}
