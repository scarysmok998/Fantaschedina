/* Local OCR contract: {match, pick (complete market + selection), odds: number|null,
 * raw, warnings, reviewed}. Missing or damaged digits are never reconstructed. */
(function(root){
 'use strict';
 const clean=s=>String(s??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
 function decimal(value){
  const s=clean(value);
  if(!/^\d+(?:[.,]\d{1,3})?$/.test(s))return null;
  const n=Number(s.replace(',','.'));return n>1&&n<=1000?n:null;
 }
 function splitOdds(text){
  const raw=clean(text);
  // Only observed icon/currency debris is allowed after a decimal token.
  const m=raw.match(/(?:^|\s)(\d{1,4}[.,]\d{1,3})(\s*(?:[€©®◷◴|]+|\([ÈèÉé][;:]?\)?|\(5\)?|\(\d\)))?\s*$/);
  if(!m)return {pick:raw,odds:null};
  const before=raw.slice(0,m.index).trim(), n=decimal(m[1]);
  if(n===null)return {pick:raw,odds:null};
  // A final number can be a threshold, handicap, score or range. Require a
  // completed selection, explicit odds label, or a separate numeric line.
  const label=/(?:quota\s*[:=]?|@)\s*$/i.test(before);
  const selection=/^(?:1|X|2|1X|X2|12|GOAL|NOGOAL|GG|NG|SI|SÌ|NO)$/i.test(before)||
   /:\s*(?:1|X|2|1X|X2|12|GOAL|NOGOAL|GG|NG|SI|SÌ|NO)$/i.test(before)||
   (/\b(?:U\/O|OVER|UNDER|CORNER)\b.*\d+[.,]\d+/i.test(before)&&/\b(?:OVER|UNDER)$/i.test(before))||
   /\b(?:OVER|UNDER)\s+\d+[.,]\d+$/i.test(before)||
   /\b(?:segna|pali|marcatore)$/i.test(before);
  if(before&&!label&&!selection)return {pick:raw,odds:null};
  return {pick:before.replace(/(?:quota\s*[:=]?|@)\s*$/i,'').trim(),odds:n};
 }
 function normalize(row){
  const pick=clean(row.pick), split=splitOdds(pick), explicit=decimal(row.odds);
  const warnings=[];
  let odds=explicit??split.odds;
  if(explicit!==null&&split.odds!==null&&explicit!==split.odds){odds=null;warnings.push('Quote discordanti: verificare lo screenshot.');}
  if(odds===null)warnings.push('Quota assente o ambigua: inseriscila dallo screenshot, senza dedurla.');
  warnings.push('Verifica testo completo, caratteri OCR e quota sullo screenshot.');
  return {match:clean(row.match),pick:split.pick,odds,player:row.player||'',raw:row.raw||pick,warnings,reviewed:false};
 }
 function extract(raw){
  const rows=[];let current=null;
  const heading=/^(?:il mio tip|sisal|tipster|giocato il|puntata|vincita potenziale|quota totale|il primo social|sis[a-z]*\.it)/i;
  for(const original of String(raw||'').split(/\r?\n/)){
   const line=clean(original);if(/^(?:puntata|vincita potenziale|quota totale|(?:di cui\s+)?bonus)\b/i.test(line)){current=null;continue;}if(!line||heading.test(line)||/^\d{2}\/\d{2}/.test(line))continue;
   const match=line.match(/^(.{2,}?)\s+[-–—]\s+(.{2,}?)(?:\s+\d{2}\/\d{2}.*)?$/);
   if(match&&!/\b(?:over|under|corner|goal|multigol|esito|somma|segna|handicap)\b/i.test(line)){
    current={match:match[1]+' - '+match[2],parts:[]};rows.push(current);
   }else if(current){current.parts.push(line.replace(/\s+\d{2}\/\d{2}\s*[-–]\s*\d{2}:\d{2}\s*$/,''));}
  }
  return rows.map(r=>{
   let odds=null;const parts=[];let conflict=false;
   for(const part of r.parts){const x=splitOdds(part);if(x.odds!==null){if(odds!==null&&odds!==x.odds)conflict=true;odds=x.odds;}if(x.pick)parts.push(x.pick);}
   const result=normalize({match:r.match,pick:parts.join(' '),odds,raw:r.parts.join('\n')});
   if(conflict){result.odds=null;result.warnings.unshift('Quote discordanti: verifica la riga.');}
   return result;
  });
 }
 // Money accepts unambiguous IT/EN grouping, never guesses a missing decimal.
 function money(value){
  let s=clean(value).replace(/^(?:€|EUR)\s*|\s*(?:€|EUR)$/gi,'').trim();
  if(/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(s))s=s.replace(/,/g,'');
  else if(/^\d+(?:[.,]\d{1,2})?$/.test(s))s=s.replace(',','.');
  else return null;
  const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=9999999999.99?n:null;
 }
 function ticket(raw){
  const lines=String(raw||'').replace(/\s+(di cui\s+bonus)/gi,'\n$1').split(/\r?\n/).map(clean).filter(Boolean),amounts=[];
  for(let i=0;i<lines.length;i++){
   const m=lines[i].match(/^vincita\s+potenziale(?:\s*\(?(?:bonus\s+inclus[oi]|inclus[oi]\s+bonus)\)?)?\s*[:=]?\s*(.*)$/i);
   if(m)amounts.push(money(m[1]||lines[i+1]||''));
  }
  const potentialWin=amounts.length&&amounts.every(x=>x!==null&&x===amounts[0])?amounts[0]:null;
  return {rows:extract(raw),potentialWin,potentialWinReviewed:false};
 }
 function bonus(potential,stake,odds){
  const total=money(potential),bet=money(stake);
  if(total===null||bet===null||odds.length!==7)return null;
  const numbers=odds.map(decimal);if(numbers.some(n=>n===null))return null;
  const base=bet*numbers.reduce((a,b)=>a*b,1);
  if(!Number.isFinite(base))return null;
  // Round the unbonused return once, to cents, before subtracting the total.
  return (Math.round(total*100)-Math.round((base+Number.EPSILON)*100))/100;
 }
 function valid(row){return !!(clean(row.match)&&clean(row.pick)&&decimal(row.odds)!==null&&row.reviewed===true);}
 const api={clean,decimal,splitOdds,normalize,extract,valid,money,ticket,bonus};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ScreenshotImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
