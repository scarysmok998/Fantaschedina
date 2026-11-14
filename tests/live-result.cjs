const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(code);
(async()=>{
 const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
 await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script[^>]+src=[^>]+><\/script>/g,'').replace('render();boot();','render();'));
 await page.evaluate(()=>{
  loadRows('bets',[{id:1,week:11,player:'Andrea',match:'Inter - Milan',pick:'1',odds:2,result:'A',date:'',market:''}]);loadRows('players',['Andrea']);loadRows('weeks',[{week:11,stake:5}]);
  window.writes=0;window.mode='ok';window.saved={...db.bets[0]};
  client={rpc:async()=>({data:window.mode!=='denied'}),from:()=>({update:patch=>{window.writes++;let filters={};const query={eq:(k,v)=>{filters[k]=v;return query},select:()=>query,single:async()=>{await new Promise(r=>setTimeout(r,100));if(window.mode==='network')throw Error('offline');if(window.mode==='rls')return {error:{message:'RLS denied'}};if(window.mode==='empty')return {data:null};if(window.mode==='conflict'||filters.result!==window.saved.result)return {error:{message:'conflict'}};window.saved={...window.saved,...patch};return {data:window.saved}}};return query}})};
  tab='live';render();
 });
 assert.equal(await page.locator('[data-live-result]').count(),0);
 await page.evaluate(()=>{adminSession={};hasAdminPermission=true;render()});
 const trigger=page.locator('[data-live-result]');
 const activate=async l=>mobile?l.tap():l.click();
 const choose=async(label,accept=true)=>{await activate(trigger);page.once('dialog',d=>accept?d.accept():d.dismiss());await activate(page.getByRole('option',{name:label,exact:true}));};
 const link=await page.locator('.live-match-link').getAttribute('href');
 await choose('Vinto',false);assert.equal(await page.evaluate(()=>writes),0);
 for(const [label,result] of [['Vinto','V'],['Perso','P'],['In attesa','A']]){
  const before=await page.evaluate(()=>db.bets[0].result);
  await choose(label);assert.equal(await page.evaluate(()=>db.bets[0].result),before,'no optimistic update');
  await page.waitForFunction(r=>db.bets[0].result===r,result);
  assert.equal(await page.locator('.live-pick').getAttribute('class'),'live-pick '+result);
  assert.equal(await page.evaluate(()=>playerStat('Andrea').n),result==='V'?1:0);
  assert.equal(await page.locator('.live-match-link').getAttribute('href'),link);
  assert.ok(await page.evaluate(()=>[overview(),playersPage(),awardsPage(),powerRanking(),weeksPage()].every(x=>typeof x==='string')));
 }
 for(const mode of ['rls','network','empty','conflict','denied']){
  await page.evaluate(m=>{window.mode=m;status('TEST')},mode);await choose('Vinto');
  await page.waitForFunction(()=>!liveSaving);
  assert.equal(await page.evaluate(()=>db.bets[0].result),'A');assert.match(await page.locator('#systemNotice').textContent(),/Esito non confermato/);
  assert.equal(await page.locator('#connectionStatus').textContent(),'TEST');
 }
 await page.evaluate(()=>window.mode='ok');await activate(trigger);
 const box=await page.locator('.fs-select-menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=(mobile?390:1440));
 await page.keyboard.press('Escape');assert.equal(await page.locator('.fs-select-menu').count(),0);
 await activate(trigger);await page.locator('h1').click();assert.equal(await page.locator('.fs-select-menu').count(),0);
 await page.evaluate(()=>{hasAdminPermission=false;adminSession=null;render()});assert.equal(await trigger.count(),0);
 await page.close();console.log('PASS syntax, '+(mobile?'mobile touch':'desktop')+', transitions, cancel, failures, permission, derived views, link, Escape, outside click');
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
