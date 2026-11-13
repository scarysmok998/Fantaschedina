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
async function finishReservation(deviceHash, reservationId, confirmed) {
  if (!reservationId) return;
  const response = await fetch(SUPABASE + '/rest/v1/rpc/fantaschedina_oracle_finalize', {
    method:'POST', headers:headers({'Content-Type':'application/json'}),
    body:JSON.stringify({p_device_hash:deviceHash,p_call_id:reservationId,p_confirm:!!confirmed}),
    signal:AbortSignal.timeout(9000)
  });
  if (!response.ok) {
    const err=await response.json().catch(()=>null);
    console.error('Oracolo finalize:',response.status,err?.code||err?.message||'unknown');
    throw new Error('Impossibile aggiornare il contatore API-Football.');
  }
}
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function cleanTeam(s, left = false) {
  let v = String(s || '').replace(/[“”"'()]/g, ' ').trim();
  if (left) v = v.replace(/^(?:(?:analizza|confronta|considera|valuta|tra|fra|sulla|sulle|su|la|le|il|gli|per|partita|partite|match|incontro|vorrei|voglio|scegli|dimmi|quota|quote|di|del|della|dei|delle|mi|puoi|trovami|una|un|e)\s+)+/gi, '');
  else v = v.replace(/[.!?;].*$/s, '').replace(/\s+(?:per|cerco|voglio|vorrei|con|quota|quote|soprattutto|sui|sugli|e|dove|quale|quali|scegli|analizza|dammi|consigliami|tra|fra|over|under|gol|goal|corner|cartellini|calci|tiri|domani|oggi)\b.*$/i, '');
  return v.trim().slice(0, 60);
}
// Natural-language fixture identification. Users should not need to type a hyphen.
// Longer multi-word team names are tested before shorter aliases.
const TEAM_ALIASES = [
  ['repubblica d irlanda','Republic of Ireland'], ['irlanda del nord','Northern Ireland'],
  ['irlanda','Republic of Ireland'], ['eire','Republic of Ireland'],
  ['bosnia erzegovina','Bosnia and Herzegovina'], ['bosnia','Bosnia and Herzegovina'],
  ['repubblica ceca','Czech Republic'], ['cechia','Czech Republic'],
  ['macedonia del nord','North Macedonia'], ['stati uniti','USA'], ['usa','USA'],
  ['inghilterra','England'], ['scozia','Scotland'], ['galles','Wales'],
  ['austria','Austria'], ['italia','Italy'], ['francia','France'], ['germania','Germany'],
  ['spagna','Spain'], ['portogallo','Portugal'], ['belgio','Belgium'],
  ['olanda','Netherlands'], ['paesi bassi','Netherlands'], ['svizzera','Switzerland'],
  ['croazia','Croatia'], ['serbia','Serbia'], ['slovenia','Slovenia'],
  ['slovacchia','Slovakia'], ['ucraina','Ukraine'], ['polonia','Poland'],
  ['romania','Romania'], ['ungheria','Hungary'], ['grecia','Greece'],
  ['turchia','Turkey'], ['turkye','Turkey'], ['norvegia','Norway'],
  ['svezia','Sweden'], ['finlandia','Finland'], ['dan imarca','Denmark'],
  ['danimarca','Denmark'], ['islanda','Iceland'], ['albania','Albania'],
  ['montenegro','Montenegro'], ['kosovo','Kosovo'], ['georgia','Georgia'],
  ['armenia','Armenia'], ['azerbaigian','Azerbaijan'], ['israele','Israel'],
  ['marocco','Morocco'], ['egitto','Egypt'], ['senegal','Senegal'],
  ['nigeria','Nigeria'], ['camerun','Cameroon'], ['ghana','Ghana'],
  ['brasile','Brazil'], ['argentina','Argentina'], ['uruguay','Uruguay'],
  ['colombia','Colombia'], ['ecuador','Ecuador'], ['cile','Chile'],
  ['messico','Mexico'], ['canada','Canada'], ['giappone','Japan'],
  ['corea del sud','South Korea'], ['australia','Australia'],
  ['real madrid','Real Madrid'], ['atletico madrid','Atletico Madrid'],
  ['manchester united','Manchester United'], ['manchester city','Manchester City'],
  ['bayern monaco','Bayern Munich'], ['borussia dortmund','Borussia Dortmund'],
  ['paris saint germain','Paris Saint Germain'], ['psg','Paris Saint Germain'],
  ['inter milano','Inter'], ['inter','Inter'], ['milan','AC Milan'],
  ['napoli','Napoli'], ['roma','AS Roma'], ['lazio','Lazio'],
  ['juventus','Juventus'], ['atalanta','Atalanta'], ['fiorentina','Fiorentina'],
  ['bologna','Bologna'], ['torino','Torino'], ['udinese','Udinese'],
  ['genoa','Genoa'], ['como','Como'], ['parma','Parma'],
  ['arsenal','Arsenal'], ['chelsea','Chelsea'], ['liverpool','Liverpool'],
  ['tottenham','Tottenham'], ['newcastle','Newcastle'], ['aston villa','Aston Villa'],
  ['brighton','Brighton'], ['everton','Everton'], ['fulham','Fulham'],
  ['barcellona','Barcelona'], ['barcelona','Barcelona'], ['valencia','Valencia'],
  ['siviglia','Sevilla'], ['sevilla','Sevilla'], ['betis','Real Betis'],
  ['villarreal','Villarreal'], ['athletic bilbao','Athletic Club'],
  ['benfica','Benfica'], ['porto','FC Porto'], ['sporting lisbona','Sporting CP'],
  ['ajax','Ajax'], ['psv','PSV Eindhoven'], ['feyenoord','Feyenoord'],
  ['monaco','Monaco'], ['marsiglia','Marseille'], ['lione','Lyon'],
  ['lille','Lille'], ['lens','Lens'], ['celtic','Celtic'], ['rangers','Rangers'],
  ['leverkusen','Bayer Leverkusen'], ['stoccarda','Stuttgart'],
  ['eintracht francoforte','Eintracht Frankfurt'], ['rb lipsia','RB Leipzig']
].map(([alias, name]) => ({alias, name})).sort((a,b) => b.alias.length-a.alias.length);
function namesInQuestion(question) {
  const source = normalize(question);
  const found = [];
  for (const team of TEAM_ALIASES) {
    const pattern = new RegExp('(?:^| )' + team.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$| )','g');
    for (const m of source.matchAll(pattern)) {
      const start = m.index + (m[0].startsWith(' ') ? 1 : 0), end = start+team.alias.length;
      if (found.some(t => start < t.end && end > t.start)) continue;
      found.push({start, end, name: team.name});
    }
  }
  found.sort((a,b) => a.start-b.start);
  return found;
}
function extractMatches(question) {
  const text = String(question || '').slice(0, 700);
  // The decimal comma in '8,5' is not a match delimiter.
  const parts = text.split(/[;\n]|,(?=\s*[A-Za-zÀ-ÿ])|\s+e\s+(?=[A-ZÀ-Ý])/);
  const matches = [];
  function add(home, away) {
    if (!home || !away || normalize(home) === normalize(away)) return;
    if (home.length < 2 || away.length < 2 || home.length > 45 || away.length > 45) return;
    if (!matches.some(p => normalize(p.home) === normalize(home) && normalize(p.away) === normalize(away))) matches.push({home, away});
  }
  for (const part of parts) {
    const m = part.match(/(.{2,90}?)\s*(?:\s+[vV][sS]\.?(?:\s+)|\s+contro\s+|\s*[-–—]\s*)(.{2,90})/);
    if (!m) continue;
    const home=cleanTeam(m[1], true), away=cleanTeam(m[2]);
    const recognized=namesInQuestion(part);
    if (recognized.length===2) add(recognized[0].name, recognized[1].name);
    else add(home,away);
  }
  // Accept natural phrasing such as "over 8,5 corner di Austria Irlanda di domani".
  // Only infer an unseparated pair if exactly two recognizable team names are present.
  if (!matches.length) {
    const detected = namesInQuestion(text);
    if (detected.length === 2) add(detected[0].name, detected[1].name);
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
// Diagnostic details are server-side only: never print the API key or full request headers.
function safeProviderErrors(errors) {
  const entries = Array.isArray(errors) ? errors.map((value, index) => [String(index), value]) :
    errors && typeof errors === 'object' ? Object.entries(errors) : [];
  return entries.slice(0, 8).map(([code, value]) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    const key = String(process.env.API_FOOTBALL_KEY || '');
    let detail = raw || '';
    if (key) detail = detail.split(key).join('[REDACTED]');
    // Redact typical JWTs, api keys and authorization fields if echoed by an upstream error.
    detail = detail.replace(/eyJ[A-Za-z0-9_-]{18,}\.[A-Za-z0-9._-]+/g,'[REDACTED]')
      .replace(/(?:api[_-]?key|token|authorization|secret)\s*[:=]\s*[^\s,;]+/gi,'[REDACTED]');
    return {code: String(code).slice(0,50), detail: detail.slice(0,500)};
  });
}
async function footballGet(path, deviceHash, context, ttlSeconds) {
  const cacheKey = crypto.createHash('sha256').update('v1:' + path).digest('hex');
  const hit = await readCache(cacheKey);
  if (hit !== null) { context.cacheHits++; return hit; }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error('API_FOOTBALL_KEY non configurata su Vercel.');
  const reservation = await quota(deviceHash, true, path);
  context.quota = reservation;
  if (!reservation.allowed) throw new Error(reservation.reason || 'Budget Oracolo esaurito.');
  const reservationId=reservation.reservationId;
  if (!reservationId) throw new Error('Prenotazione chiamata non confermata dal database. Esegui il nuovo script SQL.');
  let confirmed=false, completed=false;
  try {
    // Reservation is NOT a consumed call: finalize only after the provider responds.
    const response = await fetch(BASE + '/' + path, {
      headers: {'x-apisports-key': apiKey}, signal: AbortSignal.timeout(12000)
    });
    const remaining=response.headers.get('x-ratelimit-requests-remaining');
    // API-Football exposes the actual remaining daily quota in its response headers.
    // A normal HTTP response from the provider is counted unless it expressly reports
    // a non-charged rate-limit/auth failure. Network failures are not assumed consumed.
    confirmed = response.ok || (response.status !== 401 && response.status !== 403 && response.status !== 429 && remaining !== null);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || (body.errors && Object.keys(body.errors).length)) {
      const detail=safeProviderErrors(body?.errors);
      const codes=detail.map(x=>x.code);
      // The code `plan` without its message is not enough to diagnose an API issue.
      console.error('API-Football DIAGNOSTICA:', JSON.stringify({
        endpoint: path.slice(0,180), httpStatus: response.status,
        providerErrors: detail, providerRemaining: remaining,
        providerDailyLimit: response.headers.get('x-ratelimit-requests-limit')
      }));
      if (codes.some(x => /requests|rate|limit|token|key|subscription/i.test(x))) confirmed=false;
      const planMessage=detail.find(x=>x.code==='plan')?.detail;
      throw new Error(response.status===429 ? 'API-Football ha raggiunto il limite temporaneo di richieste.' :
        (response.status===401||response.status===403) ? 'API-Football rifiuta la chiave o il piano: verifica API_FOOTBALL_KEY su Vercel.' :
        planMessage ? 'API-Football segnala una limitazione del piano: '+planMessage.slice(0,250) :
        'API-Football ha risposto con un errore ('+response.status+(codes.length?', '+codes.join(', '):'')+').');
    }
    const value = Array.isArray(body.response) ? body.response : body.response || {};
    if (confirmed) context.apiCalls++;
    await finishReservation(deviceHash,reservationId,confirmed);
    completed=true;
    await saveCache(cacheKey, value, ttlSeconds);
    return value;
  } catch(e) {
    if (!completed) {
      // Once a HTTP response was received, keep its verified charge state.
      try { await finishReservation(deviceHash,reservationId,confirmed); }
      catch(finishErr) { console.error('Oracolo finalize recovery:',finishErr.message); }
    }
    throw e;
  }
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
function romeDate(d) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit'}).format(d);
}
function requestedDay(question) {
  const text=String(question||'');
  const now=new Date();
  const today=romeDate(now);
  const [ty,tm,td]=today.split('-').map(Number);
  const offset= /\b(dopodomani|day after tomorrow)\b/i.test(text) ? 2 : /\b(domani|tomorrow)\b/i.test(text) ? 1 : /\b(oggi|today)\b/i.test(text) ? 0 : null;
  if(offset!==null) return romeDate(new Date(Date.UTC(ty,tm-1,td+offset,12)));
  const iso=text.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if(iso) return validDate(+iso[1],+iso[2],+iso[3]);
  const numeric=text.match(/\b([0-3]?\d)[\/.]([01]?\d)[\/.](20\d{2})\b/);
  if(numeric) return validDate(+numeric[3],+numeric[2],+numeric[1]);
  const months={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12,
    january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  const names=Object.keys(months).join('|');
  const written=text.match(new RegExp('\\b([0-3]?\\d)\\s+(?:di\\s+)?('+names+')\\s*(20\\d{2})?\\b','i'));
  if(written) {
    let year=written[3]?+written[3]:ty;
    const month=months[written[2].toLowerCase()];
    if(!written[3] && (month<tm || (month===tm && +written[1]<td))) year++;
    return validDate(year,month,+written[1]);
  }
  return null;
}
function validDate(year,month,day) {
  const date=new Date(Date.UTC(year,month-1,day,12));
  if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function likelyTeam(actual, wanted) {
  const a=normalize(actual), b=normalize(wanted);
  if (!a || !b) return false;
  const equivalents = {'republic of ireland':['ireland','republic of ireland'],'as roma':['roma','as roma'],
    'ac milan':['milan','ac milan'],'bayern munich':['bayern munchen','bayern munich'],
    'inter':['inter milan','inter'],'fc porto':['porto','fc porto']};
  const names=[b,...(equivalents[b]||[])];
  return names.some(n=>a===n || a==='republic of '+n || (n.length>=5 && (a.includes(n)||n.includes(a))));
}
function matchTeams(f, pair) {
  const home=f.teams?.home?.name, away=f.teams?.away?.name;
  return (likelyTeam(home,pair.home)&&likelyTeam(away,pair.away)) ||
    (likelyTeam(home,pair.away)&&likelyTeam(away,pair.home));
}
async function findFixture(pair, deviceHash, context, requiredDay) {
  // On the Free plan API-Football rejects fixtures?team=ID&next=N.
  // A date-scoped call is supported and avoids wasting the device budget.
  if (!requiredDay) throw new Error('Per cercare '+pair.home+' – '+pair.away+' senza consumare chiamate inutili, indica la data (es. 14 novembre 2026 o domani).');
  const fixtures=await footballGet('fixtures?date='+requiredDay,deviceHash,context,3600);
  const found=(fixtures||[]).find(f=>matchTeams(f,pair));
  if(found) return found;
  throw new Error('Non risulta '+pair.home+' – '+pair.away+' nel calendario API-Football del '+requiredDay+'. Verifica la data o la denominazione delle squadre.');
}
async function recentFixtures(teamId, match, deviceHash, context) {
  const league=match.league?.id, season=match.league?.season;
  if(!league || !season) return [];
  // The free plan may reject last=N too; use regular team/league/season filters.
  const path='fixtures?league='+encodeURIComponent(league)+'&season='+encodeURIComponent(season)+'&team='+encodeURIComponent(teamId);
  const fixtures=await footballGet(path,deviceHash,context,3600*12);
  const kickoff=Date.parse(match.fixture?.date||'')||Date.now();
  return (fixtures||[]).filter(f=>['FT','AET','PEN'].includes(f.fixture?.status?.short) && Date.parse(f.fixture?.date||'') < kickoff)
    .sort((a,b)=>Date.parse(b.fixture?.date||'')-Date.parse(a.fixture?.date||'')).slice(0,5);
}
async function buildMatch(pair, deviceHash, context, requiredDay) {
  const match=await findFixture(pair,deviceHash,context,requiredDay);
  const fixtureId = match.fixture?.id;
  const homeId = match.teams?.home?.id, awayId = match.teams?.away?.id;
  if (!fixtureId||!homeId||!awayId) throw new Error('Partita trovata ma identificativo non disponibile.');
  // Odds can be unavailable or restricted even when the fixture is accessible.
  // Keep partial verified data, clearly label omissions and never invent a price.
  const missing=[];
  let odds=[];
  try { odds=await footballGet('odds?fixture='+fixtureId,deviceHash,context,3600*3); }
  catch(e) { missing.push('Quote non disponibili: '+e.message); }
  const [homeResult,awayResult]=await Promise.allSettled([
    recentFixtures(homeId,match,deviceHash,context),
    recentFixtures(awayId,match,deviceHash,context)
  ]);
  const lastHome=homeResult.status==='fulfilled'?homeResult.value:[];
  const lastAway=awayResult.status==='fulfilled'?awayResult.value:[];
  if(homeResult.status==='rejected')missing.push('Storico squadra casa non disponibile: '+homeResult.reason.message);
  if(awayResult.status==='rejected')missing.push('Storico squadra ospite non disponibile: '+awayResult.reason.message);
  const homeRecent=(lastHome||[]).slice(0,5);
  const awayRecent=(lastAway||[]).slice(0,5);
  const stats=[];
  for(const recent of [homeRecent[0],awayRecent[0]]) {
    if(!recent?.fixture?.id) continue;
    try {
      const rows=await footballGet('fixtures/statistics?fixture='+recent.fixture.id,deviceHash,context,86400*7);
      stats.push({partita:scoreFixture(recent),statistiche:fixtureStats(rows)});
    } catch(e) { missing.push('Statistiche recenti non disponibili: '+e.message); }
  }
  return {incontro:{id:fixtureId,data:match.fixture?.date,competizione:match.league?.name,
    casa:match.teams?.home?.name,ospite:match.teams?.away?.name},
    quoteVerificate:flattenOdds(odds),recentiCasa:homeRecent.map(scoreFixture),
    recentiOspite:awayRecent.map(scoreFixture),statisticheUltimePartite:stats,
    datiMancanti:missing};
}
async function getOracleData(question, deviceId) {
  const deviceHash = validDevice(deviceId);
  if (!process.env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY non configurata su Vercel.');
  const matches = extractMatches(question);
  if (!matches.length) throw new Error('Non riesco a riconoscere con certezza le due squadre. Scrivi i nomi delle squadre (per esempio Austria Irlanda o Napoli - Roma).');
  if (matches.length > 2) throw new Error('Per preservare il budget, analizza al massimo due partite per richiesta.');
  const context = {apiCalls: 0, cacheHits: 0, quota: await quota(deviceHash)};
  const requiredDay = requestedDay(question);
  const data = [];
  const warnings = [];
  for (const pair of matches) {
    try { data.push(await buildMatch(pair, deviceHash, context, requiredDay)); }
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

module.exports._extractMatches = extractMatches;
