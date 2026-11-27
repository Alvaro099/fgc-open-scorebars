/**
 * FGC Open Scorebars — Native Zero-Dependency Start.gg & Challonge Integration
 *
 * Features:
 *  - Start.gg GraphQL API v4 (https://api.start.gg/gql/alpha)
 *      • Parse any start.gg tournament/event URL or slug
 *      • Fetch Tournament metadata, Events list, and Stream Queue
 *      • Fetch Event Sets (Stream Queue, Active/Pending, Completed) with scores & round names
 *      • Import entire Event Participant Roster with Sponsors & Auto-Mapped Flags (Country + CCAA/State!)
 *      • Report Set Results via `reportBracketSet` mutation (with game-by-game score data)
 *  - Challonge REST API v1 (https://api.challonge.com/v1)
 *      • Parse any challonge.com URL (including subdomain orgs: org.challonge.com/slug -> org-slug)
 *      • Fetch Tournament, Participants (auto-splitting Sponsor | Name), and Matches
 *      • Convert Challonge round integers into clean FGC phase names + [W]/[L] badges
 *      • Report / Sync Match Scores via PUT matches/{id}.json
 *  - Demo Mode (100% offline local test tournament to try every workflow without an API key)
 */

const STARTGG_ENDPOINT = 'https://api.start.gg/gql/alpha';
const CHALLONGE_BASE = 'https://api.challonge.com/v1';

/* =========================================================================
   SMART LOCATION -> 114-FLAG AUTO-MAPPER (Country + Spanish CCAA / US States / EU Regions)
   ========================================================================= */
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const COUNTRY_NAME_MAP = {
  spain: 'ES', espana: 'ES', es: 'ES', esp: 'ES',
  japan: 'JP', japon: 'JP', jp: 'JP', jpn: 'JP',
  'south korea': 'KR', 'korea, republic of': 'KR', korea: 'KR', 'corea del sur': 'KR', kr: 'KR', kor: 'KR',
  pakistan: 'PK', pk: 'PK', pak: 'PK',
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US', 'estados unidos': 'US',
  'united kingdom': 'GB', uk: 'GB', gb: 'GB', 'great britain': 'GB', 'reino unido': 'GB',
  france: 'FR', francia: 'FR', fr: 'FR', fra: 'FR',
  germany: 'DE', alemania: 'DE', deutschland: 'DE', de: 'DE', ger: 'DE',
  italy: 'IT', italia: 'IT', it: 'IT', ita: 'IT',
  portugal: 'PT', pt: 'PT', por: 'PT',
  netherlands: 'NL', holland: 'NL', 'paises bajos': 'NL', nl: 'NL', ned: 'NL',
  belgium: 'BE', belgica: 'BE', be: 'BE',
  switzerland: 'CH', suiza: 'CH', ch: 'CH',
  austria: 'AT', at: 'AT',
  ireland: 'IE', irlanda: 'IE', ie: 'IE',
  sweden: 'SE', suecia: 'SE', se: 'SE',
  norway: 'NO', noruega: 'NO', no: 'NO',
  finland: 'FI', finlandia: 'FI', fi: 'FI',
  denmark: 'DK', dinamarca: 'DK', dk: 'DK',
  poland: 'PL', polonia: 'PL', pl: 'PL',
  'czech republic': 'CZ', czechia: 'CZ', cz: 'CZ',
  greece: 'GR', grecia: 'GR', gr: 'GR',
  hungary: 'HU', hungria: 'HU', hu: 'HU',
  romania: 'RO', rumania: 'RO', ro: 'RO',
  ukraine: 'UA', ucrania: 'UA', ua: 'UA',
  croatia: 'HR', croacia: 'HR', hr: 'HR',
  serbia: 'RS', rs: 'RS',
  bulgaria: 'BG', bg: 'BG',
  slovakia: 'SK', eslovaquia: 'SK', sk: 'SK',
  iceland: 'IS', islandia: 'IS', is: 'IS',
  luxembourg: 'LU', luxemburgo: 'LU', lu: 'LU',
  turkey: 'TR', turkiye: 'TR', turquia: 'TR', tr: 'TR',
  canada: 'CA', ca: 'CA',
  mexico: 'MX', mx: 'MX',
  brazil: 'BR', brasil: 'BR', br: 'BR',
  argentina: 'AR', ar: 'AR',
  chile: 'CL', cl: 'CL',
  colombia: 'CO', co: 'CO',
  peru: 'PE', pe: 'PE',
  venezuela: 'VE', ve: 'VE',
  ecuador: 'EC', ec: 'EC',
  uruguay: 'UY', uy: 'UY',
  'dominican republic': 'DO', 'republica dominicana': 'DO', do: 'DO',
  'costa rica': 'CR', cr: 'CR',
  'puerto rico': 'PR', pr: 'PR',
  australia: 'AU', au: 'AU',
  'new zealand': 'NZ', 'nueva zelanda': 'NZ', nz: 'NZ',
  philippines: 'PH', filipinas: 'PH', ph: 'PH', phl: 'PH',
  indonesia: 'ID', id: 'ID',
  'hong kong': 'HK', hk: 'HK',
  taiwan: 'TW', tw: 'TW',
  china: 'CN', cn: 'CN',
  singapore: 'SG', singapur: 'SG', sg: 'SG',
  malaysia: 'MY', malasia: 'MY', my: 'MY',
  thailand: 'TH', tailandia: 'TH', th: 'TH', tha: 'TH',
  india: 'IN', in: 'IN',
  'saudi arabia': 'SA', 'arabia saudi': 'SA', sa: 'SA',
  'united arab emirates': 'AE', uae: 'AE', ae: 'AE',
  morocco: 'MA', marruecos: 'MA', ma: 'MA',
  egypt: 'EG', egipto: 'EG', eg: 'EG',
  'south africa': 'ZA', sudafrica: 'ZA', za: 'ZA'
};

const SPAIN_REGION_KEYWORDS = [
  ['ES-AN', ['andalucia', 'andalusia', 'an', 'sevilla', 'seville', 'malaga', 'granada', 'cadiz', 'cordoba', 'huelva', 'jaen', 'almeria', 'jerez', 'marbella']],
  ['ES-AR', ['aragon', 'ar', 'zaragoza', 'huesca', 'teruel']],
  ['ES-AS', ['asturias', 'as', 'oviedo', 'gijon', 'aviles']],
  ['ES-IB', ['baleares', 'balears', 'balearic', 'ib', 'mallorca', 'palma', 'menorca', 'ibiza']],
  ['ES-CN', ['canarias', 'canary', 'cn', 'tenerife', 'las palmas', 'gran canaria', 'santa cruz', 'lanzarote']],
  ['ES-CB', ['cantabria', 'cb', 'santander', 'torrelavega']],
  ['ES-CM', ['castilla-la mancha', 'castilla la mancha', 'cm', 'toledo', 'albacete', 'ciudad real', 'cuenca', 'guadalajara']],
  ['ES-CL', ['castilla y leon', 'castile and leon', 'cl', 'valladolid', 'salamanca', 'burgos', 'leon', 'segovia', 'avila', 'zamora', 'soria', 'palencia']],
  ['ES-CT', ['cataluna', 'catalunya', 'catalonia', 'ct', 'barcelona', 'girona', 'tarragona', 'lleida', 'hospitalet', 'badalona', 'sabadell']],
  ['ES-VC', ['valenciana', 'valencia', 'vc', 'alicante', 'alacant', 'castellon', 'elche', 'elx']],
  ['ES-EX', ['extremadura', 'ex', 'badajoz', 'caceres', 'merida']],
  ['ES-GA', ['galicia', 'galiza', 'ga', 'vigo', 'coruna', 'santiago', 'lugo', 'ourense', 'pontevedra']],
  ['ES-MD', ['madrid', 'md', 'm', 'getafe', 'alcala', 'leganes', 'mostoles', 'fuenlabrada', 'alcorcon']],
  ['ES-MC', ['murcia', 'mc', 'cartagena', 'lorca']],
  ['ES-NC', ['navarra', 'navarre', 'nafarroa', 'nc', 'pamplona', 'iruna', 'tudela']],
  ['ES-PV', ['pais vasco', 'euskadi', 'basque', 'pv', 'bilbao', 'bilbo', 'donostia', 'san sebastian', 'vitoria', 'gasteiz', 'barakaldo']],
  ['ES-RI', ['la rioja', 'rioja', 'ri', 'logrono', 'calahorra']],
  ['ES-CE', ['ceuta', 'ce']],
  ['ES-ML', ['melilla', 'ml']]
];

const US_STATE_CODES = new Set([
  'CA', 'TX', 'NY', 'FL', 'IL', 'NV', 'GA', 'WA', 'NJ', 'PA',
  'MA', 'MI', 'OH', 'MD', 'AZ', 'CO', 'NC', 'TN', 'HI', 'VA', 'DC'
]);

const US_STATE_NAMES = {
  california: 'US-CA', texas: 'US-TX', 'new york': 'US-NY', florida: 'US-FL',
  illinois: 'US-IL', nevada: 'US-NV', georgia: 'US-GA', washington: 'US-WA',
  'new jersey': 'US-NJ', pennsylvania: 'US-PA', massachusetts: 'US-MA',
  michigan: 'US-MI', ohio: 'US-OH', maryland: 'US-MD', arizona: 'US-AZ',
  colorado: 'US-CO', 'north carolina': 'US-NC', tennessee: 'US-TN',
  hawaii: 'US-HI', virginia: 'US-VA', 'district of columbia': 'US-DC'
};

export function mapLocationToFlags(country, state, city) {
  const cNorm = norm(country);
  const sNorm = norm(state);
  const ciNorm = norm(city);
  let flag = COUNTRY_NAME_MAP[cNorm] || '';
  let region = '';

  // Auto-detect UK constituent nations even if country is listed as England/Scotland/Wales
  if (cNorm === 'scotland' || sNorm === 'scotland' || sNorm === 'sct') { flag = 'GB'; region = 'GB-SCT'; }
  else if (cNorm === 'wales' || sNorm === 'wales' || sNorm === 'wls') { flag = 'GB'; region = 'GB-WLS'; }
  else if (cNorm === 'england' || sNorm === 'england' || sNorm === 'eng') { flag = 'GB'; region = 'GB-ENG'; }
  else if (cNorm === 'northern ireland' || sNorm === 'northern ireland') { flag = 'GB'; region = 'GB-NIR'; }

  // Spanish Autonomous Communities (match state OR city!)
  if (flag === 'ES') {
    const combined = `${sNorm} ${ciNorm}`.trim();
    for (const [code, kws] of SPAIN_REGION_KEYWORDS) {
      if (kws.some(k => k.length <= 2 ? (sNorm === k) : combined.includes(k))) {
        region = code;
        break;
      }
    }
  } else if (flag === 'US') {
    const stUp = String(state || '').trim().toUpperCase();
    if (US_STATE_CODES.has(stUp)) region = `US-${stUp}`;
    else if (US_STATE_NAMES[sNorm]) region = US_STATE_NAMES[sNorm];
    else if (ciNorm.includes('las vegas')) region = 'US-NV';
    else if (ciNorm.includes('los angeles') || ciNorm.includes('san francisco')) region = 'US-CA';
    else if (ciNorm.includes('chicago')) region = 'US-IL';
    else if (ciNorm.includes('new york') || ciNorm.includes('brooklyn')) region = 'US-NY';
  } else if (flag === 'CA' && (sNorm === 'qc' || sNorm === 'quebec' || ciNorm.includes('montreal'))) {
    region = 'CA-QC';
  } else if (flag === 'DE' && (sNorm === 'by' || sNorm.includes('bavaria') || sNorm.includes('bayern') || ciNorm.includes('munich'))) {
    region = 'DE-BY';
  } else if (flag === 'FR') {
    if (sNorm.includes('bretagne') || sNorm.includes('brittany') || ciNorm.includes('rennes')) region = 'FR-BRE';
    else if (sNorm.includes('corse') || sNorm.includes('corsica')) region = 'FR-20R';
  } else if (flag === 'IT') {
    if (sNorm.includes('sicil') || ciNorm.includes('palermo')) region = 'IT-82';
    else if (sNorm.includes('sard') || ciNorm.includes('cagliari')) region = 'IT-88';
  } else if (flag === 'BE') {
    if (sNorm.includes('fland') || sNorm.includes('vlaand') || ciNorm.includes('antwerp')) region = 'BE-VLG';
    else if (sNorm.includes('wallon') || ciNorm.includes('liege')) region = 'BE-WAL';
  }

  return { flag, region };
}

/* =========================================================================
   URL PARSERS (Start.gg & Challonge)
   ========================================================================= */
export function parseStartGGUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { tournamentSlug: '', eventSlug: '' };
  const clean = raw.replace(/^https?:\/\/(www\.)?(start|smash)\.gg\//i, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/').filter(Boolean);
  let tournamentSlug = '';
  let eventSlug = '';

  const tIdx = parts.findIndex(p => p.toLowerCase() === 'tournament');
  if (tIdx >= 0 && parts[tIdx + 1]) {
    tournamentSlug = parts[tIdx + 1];
    const eIdx = parts.findIndex((p, i) => i > tIdx + 1 && p.toLowerCase() === 'event');
    if (eIdx >= 0 && parts[eIdx + 1]) {
      eventSlug = `tournament/${tournamentSlug}/event/${parts[eIdx + 1]}`;
    }
  } else if (parts.length >= 1) {
    tournamentSlug = parts[0];
  }
  return { tournamentSlug, eventSlug };
}

export function parseChallongeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { slug: '' };
  // Handle org subdomain: https://myorg.challonge.com/es/my_tourney -> myorg-my_tourney
  const subMatch = raw.match(/^https?:\/\/([a-z0-9-]+)\.challonge\.com\/(.+)$/i);
  if (subMatch) {
    const sub = subMatch[1].toLowerCase();
    const rest = subMatch[2].replace(/[?#].*$/, '').split('/').filter(Boolean);
    const langs = new Set(['es', 'en', 'fr', 'de', 'ja', 'ko', 'pt', 'it', 'zh_cn', 'ru']);
    const filtered = rest.filter(p => !langs.has(p.toLowerCase()) && p.toLowerCase() !== 'tournaments' && p.toLowerCase() !== 'standings' && p.toLowerCase() !== 'module');
    const tourney = filtered[0] || '';
    if (!tourney) return { slug: '' };
    return { slug: sub === 'www' ? tourney : `${sub}-${tourney}` };
  }
  // Plain challonge.com/slug or raw slug
  const clean = raw.replace(/^https?:\/\/(www\.)?challonge\.com\//i, '').replace(/[?#].*$/, '');
  const parts = clean.split('/').filter(Boolean);
  const langs = new Set(['es', 'en', 'fr', 'de', 'ja', 'ko', 'pt', 'it']);
  const filtered = parts.filter(p => !langs.has(p.toLowerCase()) && p.toLowerCase() !== 'tournaments' && p.toLowerCase() !== 'standings');
  return { slug: filtered[0] || '' };
}

/* =========================================================================
   HELPER: SPLIT SPONSOR / TAG & DETECT [W] / [L] BRACKET BADGES
   ========================================================================= */
function splitSponsorAndName(displayName, explicitPrefix) {
  if (explicitPrefix && String(explicitPrefix).trim()) {
    return { sponsor: String(explicitPrefix).trim(), name: String(displayName || '').trim() };
  }
  const raw = String(displayName || '').trim();
  // Match "TAG | PlayerName" or "[TAG] PlayerName"
  const pipe = raw.match(/^([^|]{1,16})\s*\|\s*(.+)$/);
  if (pipe) return { sponsor: pipe[1].trim(), name: pipe[2].trim() };
  const brk = raw.match(/^\[([^\]]{1,16})\]\s*(.+)$/);
  if (brk) return { sponsor: brk[1].trim(), name: brk[2].trim() };
  return { sponsor: '', name: raw };
}

function inferBracketBadges(roundText, roundNum) {
  const rt = norm(roundText);
  if (rt.includes('grand final') && rt.includes('reset')) return { p1Bracket: 'L', p2Bracket: 'L' };
  if (rt.includes('grand final')) return { p1Bracket: 'W', p2Bracket: 'L' };
  if (rt.includes('loser') || (typeof roundNum === 'number' && roundNum < 0)) return { p1Bracket: 'L', p2Bracket: 'L' };
  if (rt.includes('winner')) return { p1Bracket: 'W', p2Bracket: 'W' };
  return { p1Bracket: '', p2Bracket: '' };
}

/* =========================================================================
   START.GG GRAPHQL V4 CLIENT
   ========================================================================= */
async function startggQuery(token, query, variables = {}) {
  if (!token || !String(token).trim()) {
    throw new Error('Please paste your free start.gg API token (start.gg/admin/profile/developer).');
  }
  const res = await fetch(STARTGG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${String(token).trim()}`
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Start.gg HTTP ${res.status}: ${json?.message || res.statusText}`);
  }
  if (json?.errors?.length) {
    throw new Error(`Start.gg GraphQL: ${json.errors.map(e => e.message).join(' · ')}`);
  }
  return json.data;
}

function extractProfileAvatar(user) {
  const imgs = user?.images;
  if (!Array.isArray(imgs) || !imgs.length) return '';
  const prof = imgs.find(i => i?.type === 'profile' && i?.url) || imgs.find(i => i?.url);
  return prof?.url ? String(prof.url).trim() : '';
}

function extractTournamentImages(t) {
  const imgs = Array.isArray(t?.images) ? t.images.filter(i => i?.url) : [];
  const profile = imgs.find(i => String(i.type || '').toLowerCase() === 'profile');
  const banner = imgs.find(i => String(i.type || '').toLowerCase() === 'banner');
  const fallback = imgs.find(i => String(i.type || '').toLowerCase() !== 'banner') || imgs[0];
  return {
    logoUrl: String(profile?.url || fallback?.url || '').trim(),
    bannerUrl: String(banner?.url || '').trim()
  };
}

function normalizeStartGGSlot(slot) {
  const entrant = slot?.entrant;
  if (!entrant) return null;
  const part = entrant.participants?.[0];
  const rawName = part?.gamerTag || entrant.name || 'TBD';
  const { sponsor, name } = splitSponsorAndName(rawName, part?.prefix);
  const loc = part?.user?.location || {};
  const { flag, region } = mapLocationToFlags(loc.country, loc.state, loc.city);
  const avatar = extractProfileAvatar(part?.user);
  const scoreVal = slot?.standing?.stats?.score?.value;
  return {
    entrantId: entrant.id,
    name,
    sponsor,
    flag,
    region,
    avatar,
    seed: slot?.seed?.seedNum || null,
    score: (typeof scoreVal === 'number' && scoreVal >= 0) ? scoreVal : 0
  };
}

function normalizeStartGGSet(s, streamNameOverride = '') {
  const p1 = normalizeStartGGSlot(s.slots?.[0]);
  const p2 = normalizeStartGGSlot(s.slots?.[1]);
  const roundText = s.fullRoundText || (s.round < 0 ? `Losers Round ${Math.abs(s.round)}` : `Winners Round ${s.round || 1}`);
  const { p1Bracket, p2Bracket } = inferBracketBadges(roundText, s.round);
  // Start.gg states: 1=Created/Open, 2=Active/In Progress, 3=Completed, 6=Called
  const stateMap = { 1: 'open', 2: 'active', 3: 'complete', 6: 'called' };
  return {
    id: String(s.id),
    provider: 'startgg',
    roundText: roundText.toUpperCase(),
    roundNum: s.round || 0,
    state: stateMap[s.state] || 'open',
    winnerId: s.winnerId ? String(s.winnerId) : null,
    streamName: streamNameOverride || s.stream?.streamName || '',
    p1: p1 ? { ...p1, bracket: p1Bracket } : { entrantId: null, name: 'TBD', sponsor: '', flag: '', region: '', score: 0, bracket: p1Bracket },
    p2: p2 ? { ...p2, bracket: p2Bracket } : { entrantId: null, name: 'TBD', sponsor: '', flag: '', region: '', score: 0, bracket: p2Bracket }
  };
}

export async function connectStartGG(urlOrSlug, token) {
  const { tournamentSlug, eventSlug } = parseStartGGUrl(urlOrSlug);
  if (!tournamentSlug) throw new Error('Invalid start.gg URL or slug. Example: https://www.start.gg/tournament/my-tournament');

  // 1. Ultra-lightweight metadata + events + tournament logo query (~35 objects, never hits 1000-object limit)
  const metaQuery = `
    query ConnectTournamentMeta($slug: String!) {
      tournament(slug: $slug) {
        id
        name
        slug
        city
        countryCode
        images {
          url
          type
        }
        events {
          id
          name
          slug
          numEntrants
          videogame { name }
        }
      }
    }`;

  const data = await startggQuery(token, metaQuery, { slug: tournamentSlug });
  const t = data?.tournament;
  if (!t) throw new Error(`Tournament "${tournamentSlug}" was not found on start.gg.`);
  const { logoUrl, bannerUrl } = extractTournamentImages(t);

  const events = (t.events || []).map(ev => ({
    id: String(ev.id),
    name: ev.name,
    slug: ev.slug,
    numEntrants: ev.numEntrants || 0,
    game: ev.videogame?.name || ''
  }));

  // Pick matched event from URL, else Tekken event, else first event
  let selectedEvent = events.find(e => eventSlug && e.slug.toLowerCase() === eventSlug.toLowerCase());
  if (!selectedEvent) selectedEvent = events.find(e => /tekken/i.test(`${e.name} ${e.game}`));
  if (!selectedEvent) selectedEvent = events[0] || null;

  // 2. Separate Stream Queue query (with automatic low-complexity fallback for huge majors)
  const streamSets = await fetchStartGGStreamQueue(tournamentSlug, token, selectedEvent?.id);

  // 3. Paginated Event Sets query (strictly <500 objects per request)
  let sets = [];
  if (selectedEvent) {
    sets = await fetchStartGGEventSets(selectedEvent.id, token);
  }

  return {
    provider: 'startgg',
    tournament: {
      id: String(t.id),
      name: t.name,
      slug: t.slug,
      location: [t.city, t.countryCode].filter(Boolean).join(', '),
      logoUrl,
      bannerUrl
    },
    events,
    selectedEventId: selectedEvent?.id || null,
    streamQueue: streamSets,
    sets
  };
}

export async function fetchStartGGTournamentLogo(urlOrSlug, token) {
  const { tournamentSlug } = parseStartGGUrl(urlOrSlug);
  if (!tournamentSlug) throw new Error('Enter a valid start.gg tournament URL or slug first.');
  const q = `
    query TournamentLogoOnly($slug: String!) {
      tournament(slug: $slug) {
        id
        name
        slug
        images { url type }
      }
    }`;
  const data = await startggQuery(token, q, { slug: tournamentSlug });
  const t = data?.tournament;
  if (!t) throw new Error(`Tournament "${tournamentSlug}" not found on start.gg.`);
  const { logoUrl, bannerUrl } = extractTournamentImages(t);
  return { name: t.name, slug: t.slug, logoUrl, bannerUrl };
}

async function fetchStartGGStreamQueue(tournamentSlug, token, preferredEventId) {
  const fullQuery = `
    query TournamentStreamQueue($slug: String!) {
      tournament(slug: $slug) {
        streamQueue {
          stream { streamName }
          sets {
            id
            state
            round
            fullRoundText
            winnerId
            event { id name }
            slots {
              standing { stats { score { value } } }
              entrant {
                id
                name
                participants {
                  gamerTag
                  prefix
                  user {
                    location { country state city }
                    images(type: "profile") { url type }
                  }
                }
              }
            }
          }
        }
      }
    }`;

  const slimQuery = `
    query TournamentStreamQueueSlim($slug: String!) {
      tournament(slug: $slug) {
        streamQueue {
          stream { streamName }
          sets {
            id
            state
            round
            fullRoundText
            winnerId
            event { id name }
            slots {
              standing { stats { score { value } } }
              entrant {
                id
                name
                participants { gamerTag prefix }
              }
            }
          }
        }
      }
    }`;

  let sqData = null;
  try {
    sqData = await startggQuery(token, fullQuery, { slug: tournamentSlug });
  } catch (err) {
    if (/complexity/i.test(err.message)) {
      sqData = await startggQuery(token, slimQuery, { slug: tournamentSlug });
    } else {
      throw err;
    }
  }

  const streamSets = [];
  for (const q of (sqData?.tournament?.streamQueue || [])) {
    const sName = q.stream?.streamName || 'Stream';
    for (const s of (q.sets || [])) {
      const evId = s.event?.id ? String(s.event.id) : null;
      const normSet = normalizeStartGGSet(s, sName);
      normSet.eventId = evId;
      streamSets.push(normSet);
    }
  }

  // If the tournament has multiple games on streamQueue, keep selected event sets first (or only them if present)
  if (preferredEventId) {
    const matching = streamSets.filter(s => s.eventId === String(preferredEventId));
    if (matching.length > 0) return matching;
  }
  return streamSets;
}

export async function fetchStartGGEventSets(eventId, token) {
  const buildQuery = (includeLocation) => `
    query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        id
        sets(page: $page, perPage: $perPage, sortType: MAGIC) {
          pageInfo { totalPages }
          nodes {
            id
            state
            round
            fullRoundText
            winnerId
            stream { streamName }
            slots {
              standing { stats { score { value } } }
              entrant {
                id
                name
                participants {
                  gamerTag
                  prefix
                  ${includeLocation ? 'user { location { country state city } images(type: "profile") { url type } }' : ''}
                }
              }
            }
          }
        }
      }
    }`;

  // Fetch up to 2 pages x 20 sets (= 40 sets), keeping every single GraphQL request ~380 objects (<1000 max!)
  const fetchPage = async (page, perPage, includeLocation) => {
    try {
      return await startggQuery(token, buildQuery(includeLocation), { eventId, page, perPage });
    } catch (err) {
      if (/complexity/i.test(err.message)) {
        if (perPage > 10) return fetchPage(page, 10, includeLocation);
        if (includeLocation) return fetchPage(page, 15, false);
      }
      throw err;
    }
  };

  const allNodes = [];
  for (let page = 1; page <= 2; page++) {
    const data = await fetchPage(page, 20, true);
    const conn = data?.event?.sets;
    const nodes = conn?.nodes || [];
    allNodes.push(...nodes);
    if (!conn?.pageInfo?.totalPages || page >= conn.pageInfo.totalPages) break;
  }

  return allNodes
    .filter(s => s.slots?.some(sl => sl?.entrant))
    .map(s => normalizeStartGGSet(s));
}

export async function fetchStartGGEntrants(eventId, token) {
  const buildQuery = (includeLocation) => `
    query EventEntrants($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        entrants(query: { page: $page, perPage: $perPage }) {
          pageInfo { totalPages }
          nodes {
            id
            name
            participants {
              gamerTag
              prefix
              ${includeLocation ? 'user { location { country state city } images(type: "profile") { url type } }' : ''}
            }
          }
        }
      }
    }`;

  const fetchPage = async (page, perPage, includeLocation) => {
    try {
      return await startggQuery(token, buildQuery(includeLocation), { eventId, page, perPage });
    } catch (err) {
      if (/complexity/i.test(err.message)) {
        if (perPage > 20) return fetchPage(page, 20, includeLocation);
        if (includeLocation) return fetchPage(page, 30, false);
      }
      throw err;
    }
  };

  const results = [];
  for (let page = 1; page <= 5; page++) {
    const data = await fetchPage(page, 45, true);
    const conn = data?.event?.entrants;
    const nodes = conn?.nodes || [];
    for (const ent of nodes) {
      const p = ent.participants?.[0];
      const { sponsor, name } = splitSponsorAndName(p?.gamerTag || ent.name, p?.prefix);
      const loc = p?.user?.location || {};
      const { flag, region } = mapLocationToFlags(loc.country, loc.state, loc.city);
      const avatar = extractProfileAvatar(p?.user);
      if (name) results.push({ name, sponsor, flag, region, avatar, character: '' });
    }
    if (!conn?.pageInfo?.totalPages || page >= conn.pageInfo.totalPages) break;
  }
  return results;
}

export async function fetchStartGGStandings(eventId, token) {
  if (!eventId) throw new Error('Connect a start.gg event first.');
  const q = `
    query EventStandings($eventId: ID!) {
      event(id: $eventId) {
        id
        name
        state
        numEntrants
        videogame { name }
        tournament {
          name
          slug
          city
          countryCode
          images { url type }
        }
        standings(query: { perPage: 8, page: 1 }) {
          nodes {
            placement
            entrant {
              id
              name
              participants {
                gamerTag
                prefix
                user {
                  location { country state city }
                  images(type: "profile") { url type }
                  authorizations(types: [TWITTER]) { externalUsername }
                }
              }
            }
          }
        }
      }
    }`;
  const data = await startggQuery(token, q, { eventId });
  const ev = data?.event;
  if (!ev) throw new Error('Event standings not found on start.gg.');
  const t = ev.tournament || {};
  const { logoUrl } = extractTournamentImages(t);
  const nodes = ev.standings?.nodes || [];
  const rawState = String(ev.state || '').toUpperCase();
  const isCompleted = rawState === 'COMPLETED';
  const status = isCompleted ? 'completed' : (rawState === 'ACTIVE' || nodes.length > 0 ? 'live' : 'upcoming');
  const placements = nodes.slice(0, 8).map((n, idx) => {
    const ent = n.entrant || {};
    const p = ent.participants?.[0];
    const { sponsor, name } = splitSponsorAndName(p?.gamerTag || ent.name || `Player ${idx + 1}`, p?.prefix);
    const loc = p?.user?.location || {};
    const { flag, region } = mapLocationToFlags(loc.country, loc.state, loc.city);
    const avatar = extractProfileAvatar(p?.user);
    const tw = p?.user?.authorizations?.[0]?.externalUsername || '';
    return {
      place: Number(n.placement || (idx + 1)),
      name,
      sponsor,
      flag,
      region,
      character: '',
      avatar,
      handle: tw ? `@${String(tw).replace(/^@/, '')}` : ''
    };
  });
  return {
    provider: 'startgg',
    tournamentName: t.name || ev.name || 'Tournament',
    tournamentSlug: t.slug || '',
    eventName: ev.name || '',
    gameName: ev.videogame?.name || '',
    entrantsCount: Number(ev.numEntrants || 0),
    location: [t.city, t.countryCode].filter(Boolean).join(', '),
    logoUrl,
    status,
    isCompleted,
    placements
  };
}

export async function reportStartGGSet({ setId, winnerEntrantId, p1EntrantId, p2EntrantId, p1Score, p2Score, token }) {
  if (!setId || !winnerEntrantId) throw new Error('Missing setId or winnerEntrantId for start.gg report.');
  const s1 = Math.max(0, Number(p1Score || 0));
  const s2 = Math.max(0, Number(p2Score || 0));

  // Build game-by-game records so start.gg records the exact score (e.g., 3-1)
  const gameData = [];
  let gameNum = 1;
  const winnerIsP1 = String(winnerEntrantId) === String(p1EntrantId);
  const loserId = winnerIsP1 ? p2EntrantId : p1EntrantId;
  const loserWins = winnerIsP1 ? s2 : s1;
  const winnerWins = winnerIsP1 ? s1 : s2;

  for (let i = 0; i < loserWins; i++) {
    if (loserId) gameData.push({ winnerId: loserId, gameNum: gameNum++ });
  }
  for (let i = 0; i < Math.max(1, winnerWins); i++) {
    gameData.push({ winnerId: winnerEntrantId, gameNum: gameNum++ });
  }

  const mutation = `
    mutation ReportSet($setId: ID!, $winnerId: ID!, $gameData: [BracketSetGameDataInput]) {
      reportBracketSet(setId: $setId, winnerId: $winnerId, gameData: $gameData) {
        id
        state
      }
    }`;

  const data = await startggQuery(token, mutation, {
    setId,
    winnerId: winnerEntrantId,
    gameData
  });
  return { ok: true, result: data?.reportBracketSet };
}

/* =========================================================================
   CHALLONGE REST API V1 CLIENT
   ========================================================================= */
function mapChallongeRoundName(round, maxWinRound, minLosRound, totalMatchesAtMax) {
  if (round > 0) {
    if (round === maxWinRound) return totalMatchesAtMax > 1 ? 'GRAND FINALS' : 'GRAND FINALS';
    if (round === maxWinRound - 1) return 'WINNERS FINALS';
    if (round === maxWinRound - 2) return 'WINNERS SEMIS';
    return `WINNERS ROUND ${round}`;
  }
  if (round < 0) {
    if (round === minLosRound) return 'LOSERS FINALS';
    if (round === minLosRound + 1) return 'LOSERS SEMIS';
    return `LOSERS ROUND ${Math.abs(round)}`;
  }
  return 'POOLS';
}

function parseChallongeScores(scoresCsv) {
  const raw = String(scoresCsv || '').trim();
  if (!raw) return [0, 0];
  const first = raw.split(',')[0].trim();
  const m = first.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
  if (!m) return [0, 0];
  return [Math.max(0, parseInt(m[1], 10)), Math.max(0, parseInt(m[2], 10))];
}

export async function connectChallonge(urlOrSlug, apiKey) {
  const { slug } = parseChallongeUrl(urlOrSlug);
  if (!slug) throw new Error('Invalid Challonge URL or slug. Example: https://challonge.com/my_tournament');
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('Please paste your free Challonge API key (challonge.com/settings/developer).');
  }

  const url = `${CHALLONGE_BASE}/tournaments/${encodeURIComponent(slug)}.json?api_key=${encodeURIComponent(String(apiKey).trim())}&include_participants=1&include_matches=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg = Array.isArray(json?.errors) ? json.errors.join(' · ') : res.statusText;
    throw new Error(`Challonge HTTP ${res.status}: ${errMsg}`);
  }

  const t = json?.tournament;
  if (!t) throw new Error('Unexpected response from Challonge.');

  const participantsById = new Map();
  const participantsList = [];
  for (const wrap of (t.participants || [])) {
    const p = wrap.participant || wrap;
    const { sponsor, name } = splitSponsorAndName(p.display_name || p.name || p.username || 'Player');
    const info = {
      entrantId: String(p.id),
      name,
      sponsor,
      flag: '',
      region: '',
      seed: p.seed || null,
      character: ''
    };
    participantsById.set(String(p.id), info);
    if (name) participantsList.push(info);
  }

  const rawMatches = (t.matches || []).map(w => w.match || w);
  const winRounds = rawMatches.map(m => m.round).filter(r => r > 0);
  const losRounds = rawMatches.map(m => m.round).filter(r => r < 0);
  const maxWin = winRounds.length ? Math.max(...winRounds) : 1;
  const minLos = losRounds.length ? Math.min(...losRounds) : -1;
  const maxRoundCount = rawMatches.filter(m => m.round === maxWin).length;

  let gfSeen = 0;
  const sets = rawMatches
    .filter(m => m.player1_id || m.player2_id)
    .map(m => {
      let roundText = mapChallongeRoundName(m.round, maxWin, minLos, maxRoundCount);
      if (m.round === maxWin && maxRoundCount > 1) {
        gfSeen++;
        if (gfSeen === 2) roundText = 'GRAND FINALS RESET';
      }
      const [s1, s2] = parseChallongeScores(m.scores_csv);
      const { p1Bracket, p2Bracket } = inferBracketBadges(roundText, m.round);
      const p1Info = participantsById.get(String(m.player1_id)) || { entrantId: null, name: 'TBD', sponsor: '', flag: '', region: '' };
      const p2Info = participantsById.get(String(m.player2_id)) || { entrantId: null, name: 'TBD', sponsor: '', flag: '', region: '' };
      const st = m.state === 'complete' ? 'complete' : (m.underway_at ? 'active' : (m.state === 'open' ? 'open' : 'pending'));

      return {
        id: String(m.id),
        provider: 'challonge',
        roundText,
        roundNum: m.round || 0,
        state: st,
        winnerId: m.winner_id ? String(m.winner_id) : null,
        streamName: m.underway_at ? 'Live' : '',
        p1: { ...p1Info, score: s1, bracket: p1Bracket },
        p2: { ...p2Info, score: s2, bracket: p2Bracket }
      };
    });

  const challongeLogo = String(t.organization_logo_url || t.logo_url || t.avatar_url || t.image_url || '').trim();

  return {
    provider: 'challonge',
    tournament: {
      id: String(t.id),
      name: t.name,
      slug,
      location: t.game_name || 'Challonge',
      logoUrl: challongeLogo
    },
    events: [{ id: slug, name: t.game_name || t.name, slug, numEntrants: participantsList.length, game: t.game_name || '' }],
    selectedEventId: slug,
    streamQueue: sets.filter(s => s.state === 'active' || s.state === 'open').slice(0, 6),
    sets,
    participants: participantsList
  };
}

export async function fetchChallongeTournamentLogo(urlOrSlug, apiKey) {
  const { slug } = parseChallongeUrl(urlOrSlug);
  if (!slug) throw new Error('Enter a valid Challonge tournament URL or slug first.');
  if (!apiKey || !String(apiKey).trim()) throw new Error('Missing Challonge API key.');
  const url = `${CHALLONGE_BASE}/tournaments/${encodeURIComponent(slug)}.json?api_key=${encodeURIComponent(String(apiKey).trim())}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.tournament) throw new Error(`Challonge HTTP ${res.status}`);
  const t = json.tournament;
  const logoUrl = String(t.organization_logo_url || t.logo_url || t.avatar_url || t.image_url || '').trim();
  return { name: t.name, slug, logoUrl };
}

export async function fetchChallongeStandings(urlOrSlug, apiKey) {
  const { slug } = parseChallongeUrl(urlOrSlug);
  if (!slug) throw new Error('Enter a valid Challonge tournament URL or slug first.');
  if (!apiKey || !String(apiKey).trim()) throw new Error('Missing Challonge API key.');
  const url = `${CHALLONGE_BASE}/tournaments/${encodeURIComponent(slug)}.json?api_key=${encodeURIComponent(String(apiKey).trim())}&include_participants=1&include_matches=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.tournament) throw new Error(`Challonge HTTP ${res.status}`);
  const t = json.tournament;
  const parts = (t.participants || []).map(w => w.participant || w);
  const matches = (t.matches || []).map(w => w.match || w);
  const winsById = new Map();
  for (const m of matches) {
    if (m.winner_id) winsById.set(String(m.winner_id), (winsById.get(String(m.winner_id)) || 0) + 1);
  }
  const tState = String(t.state || '').toLowerCase();
  const isCompleted = tState === 'complete' || tState === 'awaiting_review';
  const status = isCompleted ? 'completed' : (tState === 'underway' || winsById.size > 0 ? 'live' : 'upcoming');

  const ranked = parts
    .filter(p => p.final_rank != null || p.seed != null)
    .sort((a, b) => {
      const ra = a.final_rank ?? 999;
      const rb = b.final_rank ?? 999;
      if (ra !== rb) return ra - rb;
      const wa = winsById.get(String(a.id)) || 0;
      const wb = winsById.get(String(b.id)) || 0;
      if (wa !== wb) return wb - wa;
      return (a.seed ?? 999) - (b.seed ?? 999);
    })
    .slice(0, 8);
  const placements = ranked.map((p, idx) => {
    const { sponsor, name } = splitSponsorAndName(p.display_name || p.name || p.username || `Player ${idx + 1}`);
    return {
      place: Number(p.final_rank || [1, 2, 3, 4, 5, 5, 7, 7][idx] || (idx + 1)),
      name,
      sponsor,
      flag: '',
      region: '',
      character: '',
      avatar: '',
      handle: p.challonge_username ? `@${p.challonge_username}` : ''
    };
  });
  return {
    provider: 'challonge',
    tournamentName: t.name || slug,
    tournamentSlug: slug,
    eventName: t.game_name || t.name || '',
    gameName: t.game_name || '',
    entrantsCount: parts.length,
    location: 'Challonge',
    logoUrl: String(t.organization_logo_url || t.logo_url || t.avatar_url || t.image_url || '').trim(),
    status,
    isCompleted,
    placements
  };
}

export async function reportChallongeMatch({ tournamentSlug, matchId, winnerEntrantId, p1Score, p2Score, apiKey, liveOnly = false }) {
  if (!tournamentSlug || !matchId) throw new Error('Missing Challonge tournament slug or matchId.');
  if (!apiKey || !String(apiKey).trim()) throw new Error('Missing Challonge API key.');

  const scoresCsv = `${Math.max(0, Number(p1Score || 0))}-${Math.max(0, Number(p2Score || 0))}`;
  const params = new URLSearchParams();
  params.set('api_key', String(apiKey).trim());
  params.set('match[scores_csv]', scoresCsv);
  if (!liveOnly && winnerEntrantId) {
    params.set('match[winner_id]', String(winnerEntrantId));
  }

  const url = `${CHALLONGE_BASE}/tournaments/${encodeURIComponent(tournamentSlug)}/matches/${encodeURIComponent(matchId)}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString()
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg = Array.isArray(json?.errors) ? json.errors.join(' · ') : res.statusText;
    throw new Error(`Challonge HTTP ${res.status}: ${errMsg}`);
  }
  return { ok: true, match: json?.match };
}

/* =========================================================================
   OFFLINE DEMO TOURNAMENT (Lets TOs test Start.gg/Challonge workflow immediately!)
   ========================================================================= */
const DEMO_SETS = [
  {
    id: 'demo-set-1', provider: 'demo', roundText: 'WINNERS FINALS', roundNum: 5, state: 'active', winnerId: null, streamName: 'Main Stream',
    p1: { entrantId: 'd1', name: 'PLAYER ALPHA', sponsor: 'TEAM A', flag: 'JP', region: '', score: 0, bracket: 'W', seed: 1, character: 'Jin Kazama' },
    p2: { entrantId: 'd2', name: 'PLAYER BRAVO', sponsor: 'TEAM B', flag: 'KR', region: '', score: 0, bracket: 'W', seed: 2, character: 'Kazuya Mishima' }
  },
  {
    id: 'demo-set-2', provider: 'demo', roundText: 'LOSERS SEMIS', roundNum: -4, state: 'called', winnerId: null, streamName: 'Main Stream',
    p1: { entrantId: 'd3', name: 'PLAYER CHARLIE', sponsor: 'FGC', flag: 'US', region: 'US-CA', score: 0, bracket: 'L', seed: 3, character: 'Reina' },
    p2: { entrantId: 'd4', name: 'PLAYER DELTA', sponsor: 'PRO', flag: 'ES', region: 'ES-MD', score: 0, bracket: 'L', seed: 4, character: 'Jun Kazama' }
  },
  {
    id: 'demo-set-3', provider: 'demo', roundText: 'TOP 8 LOSERS', roundNum: -3, state: 'open', winnerId: null, streamName: 'Main Stream',
    p1: { entrantId: 'd5', name: 'PLAYER ECHO', sponsor: '', flag: 'GB', region: 'GB-SCT', score: 0, bracket: 'L', seed: 5, character: 'Bryan Fury' },
    p2: { entrantId: 'd6', name: 'PLAYER FOXTROT', sponsor: 'T8', flag: 'PK', region: '', score: 0, bracket: 'L', seed: 6, character: 'Dragunov' }
  },
  {
    id: 'demo-set-4', provider: 'demo', roundText: 'GRAND FINALS', roundNum: 6, state: 'open', winnerId: null, streamName: 'Main Stream',
    p1: { entrantId: 'd7', name: 'PLAYER GULF', sponsor: 'WEST', flag: 'US', region: 'US-NV', score: 0, bracket: 'W', seed: 7, character: 'Victor' },
    p2: { entrantId: 'd8', name: 'PLAYER HOTEL', sponsor: 'EAST', flag: 'FR', region: 'FR-BRE', score: 0, bracket: 'L', seed: 8, character: 'King' }
  },
  {
    id: 'demo-set-5', provider: 'demo', roundText: 'WINNERS SEMIS', roundNum: 4, state: 'complete', winnerId: 'd1', streamName: 'Main Stream',
    p1: { entrantId: 'd1', name: 'PLAYER ALPHA', sponsor: 'TEAM A', flag: 'JP', region: '', score: 3, bracket: 'W', seed: 1, character: 'Jin Kazama' },
    p2: { entrantId: 'd5', name: 'PLAYER ECHO', sponsor: '', flag: 'GB', region: 'GB-SCT', score: 2, bracket: 'W', seed: 5, character: 'Bryan Fury' }
  }
];

let demoSetsLive = structuredClone(DEMO_SETS);

const DEMO_EVENT_LOGO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 84"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f97316"/><stop offset="50%" stop-color="#facc15"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><rect x="3" y="3" width="214" height="78" rx="14" fill="#0b0f1c" stroke="url(#g)" stroke-width="5"/><polygon points="22,42 36,20 50,42 36,64" fill="url(#g)"/><text x="64" y="40" fill="#ffffff" font-family="Arial Black,Impact,sans-serif" font-size="24" font-weight="900" letter-spacing="1">FGC OPEN</text><text x="65" y="62" fill="#facc15" font-family="Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="3">CHAMPIONSHIP</text></svg>`)}`;

export function getDemoTournament() {
  return {
    provider: 'demo',
    tournament: {
      id: 'demo-open-t8',
      name: 'DEMO TOURNAMENT (Offline Test)',
      slug: 'demo-tournament',
      location: 'Offline Demo',
      logoUrl: DEMO_EVENT_LOGO_SVG
    },
    events: [{ id: 'demo-ev-t8', name: 'Tekken 8 Singles', slug: 'tekken-8', numEntrants: 8, game: 'Tekken 8' }],
    selectedEventId: 'demo-ev-t8',
    streamQueue: demoSetsLive.filter(s => s.state !== 'complete'),
    sets: demoSetsLive,
    participants: demoSetsLive.flatMap(s => [s.p1, s.p2]).filter((v, i, a) => a.findIndex(x => x.name === v.name) === i)
  };
}

export function getDemoStandings() {
  const sample = [
    { place: 1, name: 'PLAYER ALPHA', sponsor: 'TEAM A', flag: 'JP', region: '', character: 'Jin Kazama', avatar: '', handle: '@player_alpha' },
    { place: 2, name: 'PLAYER BRAVO', sponsor: 'TEAM B', flag: 'KR', region: '', character: 'Kazuya Mishima', avatar: '', handle: '@player_bravo' },
    { place: 3, name: 'PLAYER CHARLIE', sponsor: 'FGC', flag: 'US', region: 'US-CA', character: 'Reina', avatar: '', handle: '@player_charlie' },
    { place: 4, name: 'PLAYER DELTA', sponsor: 'PRO', flag: 'ES', region: 'ES-MD', character: 'Jun Kazama', avatar: '', handle: '@player_delta' },
    { place: 5, name: 'PLAYER ECHO', sponsor: 'UK', flag: 'GB', region: 'GB-SCT', character: 'Bryan Fury', avatar: '', handle: '@player_echo' },
    { place: 5, name: 'PLAYER FOXTROT', sponsor: 'T8', flag: 'PK', region: '', character: 'Dragunov', avatar: '', handle: '@player_foxtrot' },
    { place: 7, name: 'PLAYER GULF', sponsor: 'WEST', flag: 'US', region: 'US-NV', character: 'Victor', avatar: '', handle: '@player_gulf' },
    { place: 7, name: 'PLAYER HOTEL', sponsor: 'EAST', flag: 'FR', region: 'FR-BRE', character: 'King', avatar: '', handle: '@player_hotel' }
  ];
  return {
    provider: 'demo',
    tournamentName: 'FGC OPEN CHAMPIONSHIP',
    tournamentSlug: 'demo-tournament',
    eventName: 'Tekken 8 Singles · Top 8',
    gameName: 'Tekken 8',
    entrantsCount: 64,
    location: 'Offline Demo',
    logoUrl: DEMO_EVENT_LOGO_SVG,
    status: 'completed',
    isCompleted: true,
    placements: sample
  };
}

export function reportDemoSet({ setId, winnerEntrantId, p1Score, p2Score }) {
  const target = demoSetsLive.find(s => s.id === setId);
  if (!target) throw new Error('Demo set not found');
  target.p1.score = Number(p1Score || 0);
  target.p2.score = Number(p2Score || 0);
  target.winnerId = String(winnerEntrantId);
  target.state = 'complete';
  return { ok: true, set: target };
}

/* =========================================================================
   TOP 8 BRACKET TREE MAPPING (Start.gg / Challonge / Demo)
   Matches ValquiriaStreamControl StartGgService.MapTop8Sets slot layout:
     ws1, ws2, wf, ltop81, ltop82, lq1, lq2, ls, lf, gf, gfr
   ========================================================================= */
function formatBracketPlayerName(slot) {
  if (!slot || !slot.entrantId) return '';
  const name = String(slot.name || '').trim();
  if (!name || name === 'TBD') return '';
  const sponsor = String(slot.sponsor || '').trim();
  if (!sponsor) return name;
  return `${sponsor} | ${name}`;
}

function setToBracketSlot(s) {
  const p1 = formatBracketPlayerName(s?.p1);
  const p2 = formatBracketPlayerName(s?.p2);
  const hasAny = Boolean(p1 || p2);
  return {
    p1,
    p1s: hasAny ? String(s?.p1?.score ?? 0) : '',
    p2,
    p2s: hasAny ? String(s?.p2?.score ?? 0) : ''
  };
}

export function mapTop8SetsToBracket(sets) {
  const slots = {
    ws1: { p1: '', p1s: '', p2: '', p2s: '' },
    ws2: { p1: '', p1s: '', p2: '', p2s: '' },
    wf: { p1: '', p1s: '', p2: '', p2s: '' },
    ltop81: { p1: '', p1s: '', p2: '', p2s: '' },
    ltop82: { p1: '', p1s: '', p2: '', p2s: '' },
    lq1: { p1: '', p1s: '', p2: '', p2s: '' },
    lq2: { p1: '', p1s: '', p2: '', p2s: '' },
    ls: { p1: '', p1s: '', p2: '', p2s: '' },
    lf: { p1: '', p1s: '', p2: '', p2s: '' },
    gf: { p1: '', p1s: '', p2: '', p2s: '' },
    gfr: { p1: '', p1s: '', p2: '', p2s: '' }
  };

  const ordered = [...(sets || [])].sort((a, b) => {
    const ra = Number(a.roundNum || 0);
    const rb = Number(b.roundNum || 0);
    if (ra !== rb) return ra - rb;
    return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
  });

  const plainLosersRounds = [];
  let wsIdx = 1;
  let lqIdx = 1;

  for (const s of ordered) {
    const rt = norm(s.roundText).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rt) continue;
    const val = setToBracketSlot(s);

    if (rt.includes('grand final') && rt.includes('reset')) {
      slots.gfr = val;
    } else if (rt.includes('grand final')) {
      slots.gf = val;
    } else if (rt.includes('winners final')) {
      slots.wf = val;
    } else if (rt.includes('losers final')) {
      slots.lf = val;
    } else if (rt.includes('losers semi')) {
      slots.ls = val;
    } else if (rt.includes('losers quarter')) {
      if (lqIdx <= 2) slots[`lq${lqIdx}`] = val;
      lqIdx++;
    } else if (rt.includes('winners semi')) {
      if (wsIdx <= 2) slots[`ws${wsIdx}`] = val;
      wsIdx++;
    } else if (rt.includes('losers')) {
      plainLosersRounds.push(s);
    }
  }

  // Group remaining plain Losers rounds ("Losers Round 1", "Losers Round 2", ...)
  // In Start.gg, losers rounds have negative round numbers (-1, -2, -3... getting more negative later).
  const byRound = new Map();
  for (const s of plainLosersRounds) {
    const key = Number(s.roundNum || 0);
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key).push(s);
  }
  const roundEntries = [...byRound.entries()].sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));

  if (lqIdx === 1 && roundEntries.length > 1) {
    // Last round is Losers Quarters, previous round is Losers Top 8
    const ltopGroup = roundEntries[roundEntries.length - 2][1];
    const lqGroup = roundEntries[roundEntries.length - 1][1];
    ltopGroup.slice(0, 2).forEach((s, i) => { slots[`ltop8${i + 1}`] = setToBracketSlot(s); });
    lqGroup.slice(0, 2).forEach((s, i) => { slots[`lq${i + 1}`] = setToBracketSlot(s); });
  } else if (roundEntries.length >= 1) {
    // When Losers Quarters matched explicitly, the latest remaining losers round is Losers Top 8
    const ltopGroup = roundEntries[roundEntries.length - 1][1];
    ltopGroup.slice(0, 2).forEach((s, i) => { slots[`ltop8${i + 1}`] = setToBracketSlot(s); });
  }

  return slots;
}

export async function fetchStartGGTop8Bracket(eventId, token) {
  if (!eventId) throw new Error('Connect a start.gg event first.');
  const phasesQuery = `
    query EventPhasesForBracket($eventId: ID!) {
      event(id: $eventId) {
        id
        name
        tournament { name slug }
        phases {
          id
          name
          phaseOrder
          bracketType
        }
      }
    }`;

  const phaseData = await startggQuery(token, phasesQuery, { eventId });
  const ev = phaseData?.event;
  if (!ev) throw new Error('Event not found on start.gg.');

  const phases = [...(ev.phases || [])].sort((a, b) => {
    const poDiff = Number(b.phaseOrder || 0) - Number(a.phaseOrder || 0);
    if (poDiff !== 0) return poDiff;
    const aTop = /top\s*8|final/i.test(a.name || '') ? 1 : 0;
    const bTop = /top\s*8|final/i.test(b.name || '') ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  const phaseSetsQuery = `
    query PhaseSetsForBracket($phaseId: ID!, $page: Int!, $perPage: Int!) {
      phase(id: $phaseId) {
        id
        name
        sets(page: $page, perPage: $perPage, sortType: ROUND) {
          pageInfo { totalPages }
          nodes {
            id
            state
            round
            fullRoundText
            winnerId
            slots {
              standing { stats { score { value } } }
              entrant {
                id
                name
                participants {
                  gamerTag
                  prefix
                }
              }
            }
          }
        }
      }
    }`;

  let chosenSets = [];
  let chosenPhaseName = '';
  for (const ph of phases) {
    const collected = [];
    for (let page = 1; page <= 6; page++) {
      const pRes = await startggQuery(token, phaseSetsQuery, { phaseId: String(ph.id), page, perPage: 30 });
      const conn = pRes?.phase?.sets;
      const nodes = conn?.nodes || [];
      collected.push(...nodes);
      if (!conn?.pageInfo?.totalPages || page >= conn.pageInfo.totalPages) break;
    }
    if (collected.length > 0) {
      chosenSets = collected.map(s => normalizeStartGGSet(s));
      chosenPhaseName = ph.name || '';
      break;
    }
  }

  if (!chosenSets.length) {
    chosenSets = await fetchStartGGEventSets(eventId, token);
  }

  return {
    provider: 'startgg',
    tournamentName: ev.tournament?.name || ev.name || '',
    eventName: ev.name || '',
    phaseName: chosenPhaseName,
    matches: mapTop8SetsToBracket(chosenSets)
  };
}

export async function fetchChallongeTop8Bracket(urlOrSlug, apiKey) {
  const snap = await connectChallonge(urlOrSlug, apiKey);
  return {
    provider: 'challonge',
    tournamentName: snap.tournament?.name || '',
    eventName: snap.events?.[0]?.name || '',
    phaseName: 'Top 8',
    matches: mapTop8SetsToBracket(snap.sets || [])
  };
}

export function getDemoTop8Bracket() {
  return {
    provider: 'demo',
    tournamentName: 'FGC OPEN CHAMPIONSHIP',
    eventName: 'Tekken 8 Singles · Top 8',
    phaseName: 'Top 8',
    matches: {
      ws1: { p1: 'TEAM A | PLAYER ALPHA', p1s: '3', p2: 'PLAYER ECHO', p2s: '1' },
      ws2: { p1: 'TEAM B | PLAYER BRAVO', p1s: '3', p2: 'WEST | PLAYER GULF', p2s: '2' },
      wf:  { p1: 'TEAM A | PLAYER ALPHA', p1s: '3', p2: 'TEAM B | PLAYER BRAVO', p2s: '1' },
      ltop81: { p1: 'FGC | PLAYER CHARLIE', p1s: '3', p2: 'T8 | PLAYER FOXTROT', p2s: '2' },
      ltop82: { p1: 'PRO | PLAYER DELTA', p1s: '3', p2: 'EAST | PLAYER HOTEL', p2s: '1' },
      lq1: { p1: 'WEST | PLAYER GULF', p1s: '1', p2: 'FGC | PLAYER CHARLIE', p2s: '3' },
      lq2: { p1: 'PLAYER ECHO', p1s: '2', p2: 'PRO | PLAYER DELTA', p2s: '3' },
      ls:  { p1: 'FGC | PLAYER CHARLIE', p1s: '3', p2: 'PRO | PLAYER DELTA', p2s: '2' },
      lf:  { p1: 'TEAM B | PLAYER BRAVO', p1s: '3', p2: 'FGC | PLAYER CHARLIE', p2s: '1' },
      gf:  { p1: 'TEAM A | PLAYER ALPHA', p1s: '3', p2: 'TEAM B | PLAYER BRAVO', p2s: '2' },
      gfr: { p1: '', p1s: '', p2: '', p2s: '' }
    }
  };
}
