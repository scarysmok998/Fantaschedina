/* Geometry-based second pass. Coordinates come from OCR, never from team names
 * or expected odds. Unsupported layouts retain the conservative text fallback. */
(function(root){
'use strict';
const api=typeof module==='object'&&module.exports?require('./screenshot-import.js'):root.ScreenshotImport;
function words(tsv){return String(tsv||'').split('\n').map(line=>line.split('\t')).filter(c=>c[0]==='5'&&c.length>=12&&c[11].trim()).map(c=>({text:c.slice(11).join('\t').trim(),x:+c[6],y:+c[7],w:+c[8],h:+c[9],confidence:+c[10],line:c.slice(1,5).join(':')}));}
function lines(ws){const groups=new Map();for(const w of ws){if(!groups.has(w.line))groups.set(w.line,[]);groups.get(w.line).push(w)}return [...groups.values()].map(a=>{a.sort((x,y)=>x.x-y.x);return {words:a,text:a.map(w=>w.text).join(' '),x:Math.min(...a.map(w=>w.x)),y:Math.min(...a.map(w=>w.y)),bottom:Math.max(...a.map(w=>w.y+w.h))}}).sort((a,b)=>a.y-b.y);}
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
function plan(data){
 const ws=words(data.tsv),ls=lines(ws);
 const anchors=ls.map(l=>({...l,match:l.text.match(/^(.+?\s[-–—]\s.+?)\s+\d{2}\/\d{2}\s*[-–—]\s*\d{2}:\d{2}\s*$/)})).filter(l=>l.match);
 if(anchors.length<2)return null;
 const left=median(anchors.map(a=>a.x));
 const right=median(anchors.map(a=>Math.max(...a.words.map(w=>w.x+w.w))));
 const candidates=ws.filter(w=>w.y>anchors[0].bottom&&w.x>left+(right-left)*.8&&/^\d+[.,]\d{2}$/.test(w.text)&&api.decimal(w.text)!==null);
 if(candidates.length<2)return null;
 const ox=median(candidates.map(w=>w.x)),end=median(candidates.map(w=>w.x+w.w));
 const gap=median(anchors.slice(1).map((a,i)=>a.y-anchors[i].y));
 const rect=(x,y,x1,y1)=>({left:Math.max(0,Math.floor(x)),top:Math.max(0,Math.floor(y)),width:Math.ceil(x1-x),height:Math.ceil(y1-y)});
 const blocks=anchors.map((a,i)=>{
  const bottom=anchors[i+1]?anchors[i+1].y-15:a.y+gap-15;
  const top=a.bottom+10;
  const observed=ws.filter(w=>w.y>=top&&w.y<bottom&&w.x>=ox-10&&w.x+w.w<=end+8&&/^\d+[.,]\d{2,3}$/.test(w.text)).map(w=>api.decimal(w.text)).filter(v=>v!==null);
  return {match:a.match[1],observed,market:rect(left-8,top,ox-25,bottom),odds:rect(ox-10,top,end+8,bottom),raw:ls.filter(l=>l.y>=a.y&&l.y<bottom).map(l=>l.text).join('\n')};
 });
 // Header amounts belong to their label's column, not to any selection.
 const header=ws.filter(w=>w.y<anchors[0].y);
 function below(label){const l=header.find(w=>label.test(w.text));if(!l)return null;const values=header.filter(w=>w.y>l.y+l.h&&w.y<l.y+l.h*4&&Math.abs(w.x+w.w/2-(l.x+l.w/2))<l.w*1.6&&api.money(w.text)!==null);return values.length===1?api.money(values[0].text):null;}
 const quota=header.find(w=>/^quota$/i.test(w.text));
 const totals=quota?header.filter(w=>Math.abs(w.y-quota.y)<quota.h&&w.x>quota.x+quota.w&&api.money(w.text)!==null):[];
 const dates=header.filter(w=>/^\d{2}\/\d{2}\/\d{4}$/.test(w.text));
 return {blocks,stake:below(/^puntata$/i),potentialWin:below(/^potenziale$/i),declaredOdds:totals.length===1?api.money(totals[0].text):null,date:dates.length===1?dates[0].text:null};
}
async function recognize(worker,source,crop,onProgress=()=>{}){
 await worker.setParameters({tessedit_pageseg_mode:'6'});
 const {data}=await worker.recognize(source,{}, {text:true,tsv:true,blocks:true});
 const geometry=plan(data);
 if(!geometry)return {...api.ticket(data.text),method:'text',warnings:['Disposizione non riconosciuta: verifica manualmente tutti i campi.']};
 const rows=[];
 for(const [i,b] of geometry.blocks.entries()){
  onProgress(i+1,geometry.blocks.length);
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  const market=await worker.recognize(await crop(b.market,'market'),{}, {text:true});
  const odd=await worker.recognize(await crop(b.odds,'odds'),{}, {text:true});
  // No whitelist: do not coerce letters or damaged digits into numbers.
  const token=api.clean(odd.data.text);
  const value=/^\d+[.,]\d{2,3}$/.test(token)?api.decimal(token):null;
  const conflict=b.observed.some(n=>value!==null&&n!==value);
  const row=api.normalize({match:b.match,pick:api.clean(market.data.text),odds:value,raw:b.raw});
  // The market crop is authoritative as text; never strip its trailing threshold.
  row.pick=api.clean(market.data.text).replace(/:\s*/g,': ');row.odds=value;
  if(/(?<=[A-Za-z])\s+\|\s+(?=[A-Za-z])/.test(row.pick)){row.pick=row.pick.replace(/(?<=[A-Za-z])\s+\|\s+(?=[A-Za-z])/g,' I ');row.warnings.unshift('Glifo OCR | normalizzato in I fra parole: controlla il testo originale.');}
  row.raw+='\nRilettura mercato: '+api.clean(market.data.text)+'\nRilettura quota: '+token;
  if(conflict){row.odds=null;row.warnings.unshift('Quote discordanti fra le due letture: verifica lo screenshot.');}
  if(value===null)row.warnings.unshift('Quota del ritaglio illeggibile: inseriscila manualmente.');
  rows.push(row);
 }
 return {rows,stake:geometry.stake,potentialWin:geometry.potentialWin,declaredOdds:geometry.declaredOdds,date:geometry.date,method:'layout',potentialWinReviewed:false};
}
const exported={words,lines,plan,recognize};
if(typeof module==='object'&&module.exports)module.exports=exported;else root.ScreenshotLayout=exported;
})(typeof globalThis!=='undefined'?globalThis:this);
