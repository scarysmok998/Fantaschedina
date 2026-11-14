const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const engine=process.env.BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const script=html.slice(html.indexOf('let importRows=[]'),html.indexOf('function adminMessage('));
 const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
 await page.setContent(`<style>${css}</style><div id="content"></div>`);
 await page.addScriptTag({path:path.join(__dirname,'../js/screenshot-import.js')});
 await page.addScriptTag({content:`
 const $=s=>document.querySelector(s), players=()=>['A','B','C','D','E','F','G'],allWeeks=()=>[1];
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const enhanceSelects=()=>{},refreshSelects=()=>{},shortErr=String;
 let writes=[],db={bets:[],weeks:[]},tab='admin';
 const write=table=>async payload=>{writes.push({table,payload});return {error:null}};
 const client={from:table=>({upsert:write(table),insert:write(table)})};
 const fetchAll=async()=>{},render=()=>{},adminMessage=()=>{};
 window.confirm=()=>true;
 ${script}
 document.querySelector('#content').innerHTML=screenshotImportPanel();
 importRows=Array.from({length:7},(_,i)=>ScreenshotImport.normalize({match:'Team '+i+' - Other',pick:'Over 2.5 1.80'}));
 renderImportPreview();bindScreenshotImport();
 `});
 assert.equal(await page.locator('[name=imPick]').first().inputValue(),'Over 2.5');
 assert.equal(await page.locator('[name=imOdd]').first().inputValue(),'1.8');
 await page.locator('#imNext').click();
 assert.equal(await page.locator('[name=imPlayer]').count(),0,'unreviewed rows block next');
 await page.locator('[name=imReviewed]').first().check();
 await page.locator('#imPotentialReviewed').check();
 await page.locator('[name=imPick]').first().fill('Over 3.5');
 assert.equal(await page.locator('[name=imReviewed]').first().isChecked(),false,'editing revokes review');
 assert.equal(await page.locator('#imPotentialReviewed').isChecked(),false,'editing a selection revokes total review');
 await page.locator('#imPotentialReviewed').check();
 await page.locator('[name=imOdd]').first().fill('425!');
 assert.equal(await page.locator('#imPotentialReviewed').isChecked(),false,'editing odds revokes bonus review');
 for(const checkbox of await page.locator('[name=imReviewed]').all())await checkbox.check();
 await page.locator('#imNext').click();
 assert.equal(await page.locator('[name=imPlayer]').count(),0,'bad odds block next even reviewed');
 await page.locator('[name=imOdd]').first().fill('1,80');
 await page.locator('[name=imReviewed]').first().check();
 await page.locator('#imNext').click();
 assert.equal(await page.locator('[name=imPlayer]').count(),7);
 assert.equal(await page.locator('#imSave').isDisabled(),true);
 for(let i=0;i<7;i++)await page.locator('[name=imPlayer]').nth(i).selectOption('ABCDEFG'[i]);
 assert.equal(await page.locator('#imSave').isDisabled(),false);
 await page.locator('#imPotential').fill('1.234,56');
 assert.equal(await page.locator('#imBonus').inputValue(),'928.45');
 await page.locator('#imPotential').fill('300');
 await page.locator('#imPotentialReviewed').check();
 await page.evaluate(()=>saveImportedPicks());
 assert.equal(await page.evaluate(()=>writes.length),0,'negative bonus blocks saving');
 await page.locator('#imPotential').fill('1.234,56');
 assert.equal(await page.locator('#imPotentialReviewed').isChecked(),false,'changing payout revokes review');
 // Exercise save validation directly; no Supabase network or production credentials.
 await page.evaluate(()=>saveImportedPicks());
 assert.equal(await page.evaluate(()=>writes.length),0,'unreviewed totals block save');
 await page.locator('#imPotentialReviewed').check();
 await page.evaluate(()=>{importRows[0].reviewed=false;document.querySelector('[name=imReviewed]').checked=false;saveImportedPicks()});
 assert.equal(await page.evaluate(()=>writes.length),0,'save independently rejects unreviewed data');
 await page.evaluate(()=>{document.querySelector('[name=imReviewed]').checked=true;document.querySelectorAll('[name=imPlayer]')[1].value='A';saveImportedPicks()});
 assert.equal(await page.evaluate(()=>writes.length),0,'save rejects duplicate players');
 await page.evaluate(()=>{document.querySelectorAll('[name=imPlayer]')[1].value='B';document.querySelector('#imPayer').value='A';saveImportedPicks()});
 await page.waitForFunction(()=>writes.length===2);
 const round=await page.evaluate(()=>writes[0].payload);
 assert.equal(round.potential_win,1234.56);assert.equal(round.bonus_amount,928.45);
 const payload=await page.evaluate(()=>writes[1].payload);
 assert.equal(payload.length,7);assert.equal(new Set(payload.map(x=>x.player)).size,7);
 assert.ok(payload.every(x=>x.result==='A'&&x.odds===1.8));
 assert.equal(payload[0].pick,'Over 3.5');
 const liveScript=html.slice(html.indexOf('function livePage(){'),html.indexOf('function simPage(){'));
 await page.addScriptTag({content:`
 const money=n=>'€ '+Number(n).toFixed(2),fmt=n=>Number(n).toFixed(2),uiIcon=()=>'',badge=()=>'',btn=()=>'';
 const metric=(label,value,hint)=>label+' '+value+' '+hint;
 const weekData=()=>({w:2,b:[],meta:{potentialWin:1234.56,bonus:100},stake:5,payer:'A'});
 ${liveScript}
 `});
 // Archive uses persisted metadata; potential winnings are not added to bonus again.
 assert.ok(await page.evaluate(()=>weeksPage().includes('Di cui bonus')));
 assert.ok(await page.evaluate(()=>weeksPage().includes('1234.56')));
 console.log('PASS: real preview, edit resets review, invalid/missing review blocks navigation/save, duplicate players rejected, seven structured pending picks saved (mock database)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
