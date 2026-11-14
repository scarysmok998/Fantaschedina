// Run with Playwright installed: node tests/dropdown.cjs
// CHROME_PATH optionally selects a locally installed Chromium browser.
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
 const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
 const browser = await engine.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
 const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const html = fs.readFileSync(process.env.SOURCE_HTML || path.join(__dirname,'../index.html'),'utf8');
 const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
 const script = html.slice(html.indexOf('let openFsSelect=null;'),html.indexOf('const shortErr='));
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div style="padding:60px 20px;height:2200px"><label>Giocatore<select>${Array.from({length:60},(_,i)=>`<option value="${i}" ${i===1?'disabled':''}>Giocatore ${i}</option>`).join('')}</select></label><button id="outside" style="position:fixed;bottom:10px">Esterno</button></div>`);
 await page.addScriptTag({content:script+';enhanceSelects(document.body);window.changes=0;document.querySelector("select").addEventListener("change",()=>window.changes++);'});
 const menu=page.locator('.fs-select-menu'),trigger=page.locator('.fs-select-trigger');
 await trigger.tap();
 // A real scroll event is the regression: the original capture listener removes the menu.
 await menu.evaluate(el=>el.scrollTop=200);
 await page.waitForTimeout(150);
 assert.equal(await menu.count(),1,'internal scrolling must keep menu open');
 assert.ok(Math.abs(await menu.evaluate(el=>el.scrollTop)-200)<=2,'scroll position retained within browser rounding');
 assert.equal(await page.evaluate(()=>changes),0);
 if(engine===chromium){
  const cdp=await page.context().newCDPSession(page);
  const r=await menu.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+60,y:r.y+r.height-30}]});
  for(let d=20;d<=180;d+=20){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+60,y:r.y+r.height-30-d}]});
   await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(400);
  assert.equal(await menu.count(),1,'touch swipe must keep menu open');
  assert.ok(await menu.evaluate(el=>el.scrollTop)>200,'touch swipe must scroll options');
  assert.equal(await page.evaluate(()=>changes),0,'swipe must not select');
 }
 await menu.evaluate(el=>el.scrollTop=el.scrollHeight);
 await page.waitForTimeout(150);
 await menu.getByRole('option',{name:'Giocatore 59',exact:true}).tap();
 assert.equal(await page.locator('select').inputValue(),'59');
 assert.equal(await page.evaluate(()=>changes),1);
 assert.equal(await menu.count(),0);
 await trigger.tap();
 await page.evaluate(()=>window.scrollTo(0,20));
 await page.waitForTimeout(150);
 assert.equal(await menu.count(),1,'page scrolling must not dismiss');
 await page.setViewportSize({width:390,height:780});
 assert.equal(await menu.count(),1,'viewport resizing must not dismiss');
 await page.locator('#outside').tap();
 assert.equal(await menu.count(),0,'outside tap closes');
 await page.evaluate(()=>window.scrollTo(0,0));
 await trigger.focus();
 await page.keyboard.press('ArrowDown');
 await page.keyboard.press('End');
 assert.equal(await menu.count(),1,'keyboard focus scrolling keeps menu open');
 await page.keyboard.press('Escape');
 assert.equal(await menu.count(),0);
 assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 console.log('PASS: internal scroll, touch swipe (Chromium), last-option tap, change event, page scroll, resize, outside tap, keyboard and Escape');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
