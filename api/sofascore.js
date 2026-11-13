// Resolves public indexed Sofascore match URLs without accessing Sofascore's private APIs.
// Searches public Bing RSS index; unverified/ambiguous matches fall back to a web search.
const BASE = 'https://www.google.com/search?q=';
const strip = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim();
const escapeXml = s => String(s).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0] === 'x' ? parseInt(n.slice(1),16) : Number(n))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const aliases = {
 'ungheria':'hungary', 'israele':'israel', 'norvegia':'norway', 'galles':'wales',
 'germania':'germany', 'francia':'france', 'spagna':'spain', 'italia':'italy',
 'inghilterra':'england', 'scozia':'scotland', 'svizzera':'switzerland',
 'austria':'austria', 'belgio':'belgium', 'olanda':'netherlands',
 'paesi bassi':'netherlands', 'polonia':'poland', 'portogallo':'portugal',
 'croazia':'croatia', 'serbia':'serbia', 'slovenia':'slovenia',
 'slovacchia':'slovakia', 'repubblica ceca':'czechia', 'cechia':'czechia',
 'turchia':'turkey', 'grecia':'greece', 'ucraina':'ukraine',
 'romania':'romania', 'bulgaria':'bulgaria', 'svezia':'sweden',
 'finlandia':'finland', 'danimarca':'denmark',
 'irlanda':'ireland', 'irlanda del nord':'northern ireland',
 'stati uniti':'usa', 'brasile':'brazil', 'giappone':'japan',
 'corea del sud':'south korea', 'costa d avorio':'ivory coast',
 'arabia saudita':'saudi arabia', 'marocco':'morocco', 'egitto':'egypt',
 'algeria':'algeria', 'tunisia':'tunisia', 'georgia':'georgia',
 'kosovo':'kosovo', 'moldavia':'moldova', 'lussemburgo':'luxembourg'
};
const canonical = value => aliases[strip(value)] || strip(value);
const tokens = s => canonical(s).split(' ').filter(Boolean);
function teamsFromMatch(match) {
  const pieces = String(match || '').split(/\s+(?:vs?\.?|contro)\s+|\s*[–—−]\s*|\s+-\s+/i).map(s => s.trim()).filter(Boolean);
  return pieces.length === 2 ? pieces : null;
}
function preciseUrl(url, teamA, teamB) {
  let target;
  try { target = new URL(escapeXml(url)); } catch { return null; }
  if (!['www.sofascore.com','sofascore.com'].includes(target.hostname)) return null;
  const match = target.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?football\/match\/([^/]+)\/([a-z0-9]+)\/?$/i);
  if (!match) return null;
  const slug = tokens(match[1]);
  const contains = team => {
    const words = tokens(team).filter(t=>!['fc','cf','ac','ssc','afc','calcio','football','club','national','team'].includes(t));
    return words.length > 0 && words.every(w => slug.includes(w));
  };
  return contains(teamA) && contains(teamB) ? `https://www.sofascore.com/it/football/match/${match[1]}/${match[2]}` : null;
}
function candidateLinks(feed) {
  const items = feed.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const link = item.match(/<link\s*>([\s\S]*?)<\/link\s*>/i);
    return link ? escapeXml(link[1]).trim() : '';
  }).filter(Boolean);
}
async function lookup(teams, date) {
  // Two query variations improve coverage for sites that index the reverse ordering.
  const q = `site:sofascore.com/football/match/ "${canonical(teams[0])}" "${canonical(teams[1])}"`;
  const u = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(q);
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 4800);
  try {
    const response = await fetch(u, {headers:{'Accept':'application/rss+xml, application/xml;q=0.9','User-Agent':'Mozilla/5.0 (compatible; FantaSchedina/1.0)'},signal:controller.signal});
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 500000) return null;
    const matches = [...new Set(candidateLinks(body).map(link=>preciseUrl(link,...teams)).filter(Boolean))];
    // For an ambiguous pairing never guess; multiple hits might represent other competitions.
    return matches.length === 1 ? matches[0] : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
module.exports = async function handler(req,res) {
  const match = typeof req.query?.match === 'string' ? req.query.match.slice(0,180) : '';
  const date = typeof req.query?.date === 'string' ? req.query.date.slice(0,25) : '';
  const teams = teamsFromMatch(match);
  const fallback = BASE + encodeURIComponent(['site:sofascore.com/football/match',match,date].filter(Boolean).join(' '));
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  if(!teams){ res.writeHead(302,{Location:fallback}); return res.end(); }
  const result = await lookup(teams, date);
  res.writeHead(302, {Location:result || fallback});
  res.end();
};
module.exports._test = {teamsFromMatch, preciseUrl, candidateLinks, lookup};
