// FantaSchedina Oracolo: server-side API-Football access with shared cache
// and atomic per-device limits stored in Supabase. Never expose API_FOOTBALL_KEY.
const crypto = require('node:crypto');
const BASE = 'https://v3.football.api-sports.io';
const SUPABASE = (process.env.SUPABASE_URL || 'https://gxafkezdsbxgoxvzethz.supabase.co').replace(/\/$/, '');
const devicePattern = /^[a-zA-Z0-9-]{15,80}$/;
const hashDevice = id => crypto.createHash('sha256').update(id).digest('hex');
const supabaseKey = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata su Vercel.');
  return key;
};
function headers(extra = {}) {
  const key = supabaseKey();
  return {'apikey': key, 'Authorization': 'Bearer ' + key, ...extra};
}
function validDevice(id) {
  if (typeof id !== 'string' || !devicePattern.test(id)) throw new Error('Identificativo dispositivo mancante.');
  return hashDevice(id);
}
async function quota(deviceHash, reserve = false, endpoint = '') {
  const response = await fetch(SUPABASE + '/rest/v1/rpc/fantaschedina_oracle_quota', {
    method: 'POST', headers: headers({'Content-Type': 'application/json'}),
    body: JSON.stringify({p_device_hash: deviceHash, p_reserve: reserve, p_endpoint: endpoint}),
    signal: AbortSignal.timeout(9000)
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || typeof value?.used !== 'number') {
    console.error('Oracolo quota:', response.status, value?.code || value?.message || 'unknown');
    throw new Error('Budget Oracolo non disponibile: controlla lo script SQL su Supabase.');
  }
  return value;
}
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function cleanTeam(s, left = false) {
  let v = String(s || '').replace(/[“”"'()]/g, ' ').trim();
  if (left) v = v.replace(/^(?:(?:analizza|confronta|considera|valuta|tra|fra|sulla|sulle|su|la|le|il|gli|per|partita|partite|match|incontro|vorrei|voglio|scegli|dimmi|quota|quote|di|del|della|dei|delle|mi|puoi|trovami|una|un|e)\s+)+/gi, '');
  else v = v.replace(/\s+(?:per|cerco|voglio|vorrei|con|quota|quote|soprattutto|sui|sugli|e|dove|quale|quali|scegli|analizza|dammi|consigliami|tra|fra)\b.*$/i, '');
  return v.trim().slice(0, 60);
}
function extractMatches(question) {
  const text = String(question || '').slice(0, 700);
  const parts = text.split(/[,;\n]|\s+e\s+(?=[A-ZÀ-Ý])/);
  const matches = [];
  for (const part of parts) {
    const m = part.match(/(.{2,90}?)\s*(?:\s+[vV][sS]\.?(?:\s+)|\s+contro\s+|\s*[-–—]\s*)(.{2,90})/);
    if (!m) continue;
    const home = cleanTeam(m[1], true), away = cleanTeam(m[2]);
    if (home.length < 2 || away.length < 2 || home.length > 45 || away.length > 45) continue;
    if (!matches.some(p => normalize(p.home) === normalize(home) && normalize(p.away) === normalize(away))) matches.push({home, away});
  }
  return matches;
}
async function readCache(cacheKey) {
  const response = await fetch(SUPABASE + '/rest/v1/fantaschedina_oracle_cache?cache_key=eq.' + encodeURIComponent(cacheKey) + '&select=value,expires_at&limit=1', {
    headers: headers(), signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error('Impossibile leggere la cache di Supabase.');
  const data = await response.json();
  const found = data?.[0];
  return found && new Date(found.expires_at).getTime() > Date.now() ? found.value : null;
}
async function saveCache(cacheKey, value, ttlSeconds) {
  const response = await fetch(SUPABASE + '/rest/v1/fantaschedina_oracle_cache?on_conflict=cache_key', {
    method: 'POST', headers: headers({'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'}),
    body: JSON.stringify({cache_key: cacheKey, value, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(), updated_at: new Date().toISOString()}),
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) console.error('Oracolo cache write failed:', response.status);
}
async function footballGet(path, deviceHash, context, ttlSeconds) {
  const cacheKey = crypto.createHash('sha256').update('v1:' + path).digest('hex');
  const hit = await readCache(cacheKey);
  if (hit) { context.cacheHits++; return hit; }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error('API_FOOTBALL_KEY non configurata su Vercel.');
  const current = await quota(deviceHash, true, path);
  context.quota = current;
  if (!current.allowed) throw new Error(current.reason || 'Budget Oracolo esaurito.');
  context.apiCalls++;
  const response = await fetch(BASE + '/' + path, {
    headers: {'x-apisports-key': apiKey, 'Accept': 'application/json'},
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || (body.errors && Object.keys(body.errors).length)) {
    console.error('API-Football:', response.status, Object.keys(body?.errors || {}));
    throw new Error('API-Football non ha restituito dati validi per questa richiesta.');
  }
  const value = Array.isArray(body.response) ? body.response : body.response || {};
  await saveCache(cacheKey, value, ttlSeconds);
  return value;
}
function scoreFixture(f) {
  return {
    data: f.fixture?.date || '',
    squadraCasa: f.teams?.home?.name || '', squadraOspite: f.teams?.away?.name || '',
    golCasa: f.goals?.home ?? null, golOspite: f.goals?.away ?? null,
    stato: f.fixture?.status?.short || ''
  };
}
function fixtureStats(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => ({
    squadra: r.team?.name,
    valori: (r.statistics || []).filter(s => /corner kicks|shots on goal|shots off goal|total shots|yellow cards|red cards|fouls|goalkeeper saves|ball possession/i.test(s.type)).map(s => ({tipo: s.type, valore: s.value}))
  }));
}
function flattenOdds(rows) {
  const out = [];
  for (const r of (rows || []).slice(0, 2)) {
    for (const book of (r.bookmakers || []).slice(0, 5)) {
      for (const bet of (book.bets || [])) {
        if (!/corners?|cards?|goals?|total|over|under|both teams|double chance|match winner|shots?/i.test(bet.name)) continue;
        for (const x of (bet.values || []).slice(0, 12)) {
          if (out.length >= 125) return out;
          out.push({bookmaker: book.name, mercato: bet.name, selezione: x.value, quota: x.odd});
        }
      }
    }
  }
  return out;
}
async function buildMatch(pair, deviceHash, context) {
  const names = await footballGet('teams?search=' + encodeURIComponent(pair.home), deviceHash, context, 86400 * 7);
  const target = normalize(pair.home);
  const team = (names || []).find(x => normalize(x.team?.name) === target) ||
    (names || []).find(x => normalize(x.team?.name).includes(target) || target.includes(normalize(x.team?.name))) || (names || [])[0];
  if (!team?.team?.id) throw new Error('Squadra non trovata: ' + pair.home + '. Verifica come è scritto il nome.');
  const fixtures = await footballGet('fixtures?team=' + team.team.id + '&next=20', deviceHash, context, 3600 * 3);
  const away = normalize(pair.away);
  const match = (fixtures || []).find(f => f.teams?.home?.id === team.team.id && (
    normalize(f.teams?.away?.name) === away || normalize(f.teams?.away?.name).includes(away) || away.includes(normalize(f.teams?.away?.name))
  ));
  if (!match) throw new Error('Non trovo un prossimo incontro ' + pair.home + ' - ' + pair.away + '. Controlla competizione e data.');
  const fixtureId = match.fixture?.id;
  const homeId = match.teams.home.id, awayId = match.teams.away.id;
  const odds = await footballGet('odds?fixture=' + fixtureId, deviceHash, context, 3600 * 3);
  const [lastHome, lastAway] = await Promise.all([
    footballGet('fixtures?team=' + homeId + '&last=5', deviceHash, context, 3600 * 12),
    footballGet('fixtures?team=' + awayId + '&last=5', deviceHash, context, 3600 * 12)
  ]);
  const homeRecent = (lastHome || []).filter(f => f.fixture?.status?.short === 'FT').slice(-5);
  const awayRecent = (lastAway || []).filter(f => f.fixture?.status?.short === 'FT').slice(-5);
  // One recent fixture per team for market-specific statistics; stays within the daily budget.
  const stats = [];
  for (const recent of [homeRecent.at(-1), awayRecent.at(-1)]) {
    if (!recent?.fixture?.id) continue;
    const data = await footballGet('fixtures/statistics?fixture=' + recent.fixture.id, deviceHash, context, 86400 * 7);
    stats.push({partita: scoreFixture(recent), statistiche: fixtureStats(data)});
  }
  return {
    incontro: {id: fixtureId, data: match.fixture?.date, competizione: match.league?.name,
      casa: match.teams?.home?.name, ospite: match.teams?.away?.name},
    quoteVerificate: flattenOdds(odds),
    recentiCasa: homeRecent.map(scoreFixture), recentiOspite: awayRecent.map(scoreFixture),
    statisticheUltimePartite: stats
  };
}
async function getOracleData(question, deviceId) {
  const deviceHash = validDevice(deviceId);
  if (!process.env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY non configurata su Vercel.');
  const matches = extractMatches(question);
  if (!matches.length) throw new Error('Indica la partita nel formato «Napoli - Roma» (puoi inserirne fino a due).');
  if (matches.length > 2) throw new Error('Per preservare il budget, analizza al massimo due partite per richiesta.');
  const context = {apiCalls: 0, cacheHits: 0, quota: await quota(deviceHash)};
  if (context.quota.deviceRemaining < 1 || context.quota.remainingAssigned < 1)
    throw new Error('Budget Oracolo esaurito per questo dispositivo o per la lega.');
  const data = [];
  const warnings = [];
  for (const pair of matches) {
    try { data.push(await buildMatch(pair, deviceHash, context)); }
    catch (e) { warnings.push(pair.home + ' - ' + pair.away + ': ' + e.message); }
  }
  context.quota = await quota(deviceHash);
  if (!data.length) throw new Error(warnings.join(' '));
  return {data, warnings, apiCalls: context.apiCalls, cacheHits: context.cacheHits, quota: context.quota};
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Metodo non consentito.'});
  try {
    const deviceHash = validDevice(req.query?.deviceId);
    return res.status(200).json({quota: await quota(deviceHash)});
  } catch (e) {
    console.error('Oracolo budget:', e.message);
    return res.status(503).json({error:'Budget Oracolo non disponibile. Controlla SQL e configurazione Vercel.'});
  }
};
module.exports.getOracleData = getOracleData;
