// Real pixels -> Tesseract 5 -> application's readScreenshot -> editable preview.
// OCR_ASSETS contains tesseract5/, core5/, ita.traineddata.gz, eng.traineddata.gz.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),assets=path.resolve(process.env.OCR_ASSETS||'..');
const expected=require('./fixtures/sisal-expected.json');
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html></html>');return}const p=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(assets,'.'+p);if(!file.startsWith(assets+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
 const engine=process.env.BROWSER==='webkit'?webkit:chromium;
 browser=await engine.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const script=html.slice(html.indexOf('let importRows=[]'),html.indexOf('function adminMessage('));
 const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n').replace(/@import\s+url\([^)]*\);/g,'');
 await page.setContent(`<style>${css}</style><main class="main"><div id="content"></div></main>`);
 for(const f of ['screenshot-import.js','screenshot-layout.js'])await page.addScriptTag({path:path.join(root,'js',f)});
 await page.addScriptTag({url:base+'/tesseract5/dist/tesseract.min.js'});
 await page.addScriptTag({content:`
 const create=window.Tesseract.createWorker;window.Tesseract.createWorker=(lang,oem,opts)=>create(lang,oem,{...opts,workerPath:'${base}/tesseract5/dist/worker.min.js',corePath:'${base}/core5',langPath:'${base}',cacheMethod:'none'});
 const $=s=>document.querySelector(s),players=()=>['A','B','C','D','E','F','G'],allWeeks=()=>[1];
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const enhanceSelects=()=>{},refreshSelects=()=>{},shortErr=String;
 ${script}
 $('#content').innerHTML=screenshotImportPanel();bindScreenshotImport();
 `});
 await page.locator('#imFile').setInputFiles(path.join(__dirname,'fixtures/sisal-original.jpeg'));
 await page.locator('#imRead').click();
 await page.waitForFunction(()=>!importBusy,{},{timeout:120000});
 assert.match(await page.locator('#imMessage').innerText(),/Lettura completata/);
 const rows=await page.evaluate(()=>importRows.map(({match,pick,odds})=>({match,pick,odds})));
 assert.deepEqual(rows,expected.rows);
 for(const [id,key] of [['imStake','stake'],['imPotential','potentialWin'],['imDeclaredOdds','declaredOdds']])assert.equal(Number(await page.locator('#'+id).inputValue()),expected[key]);
 assert.equal(await page.locator('#imTicketDate').inputValue(),expected.date);
 const artifact=process.env.ARTIFACT_DIR;if(artifact)fs.mkdirSync(artifact,{recursive:true});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
  for(const el of await page.locator('.im-cell-pick .im-display,[name=imReviewed],[data-im-edit]').all()){
   const b=await el.boundingBox();assert.ok(b.width>0&&b.x>=0&&b.x+b.width<=width,'control within viewport');
  }
  const textFits=await page.locator('.im-cell-pick .im-display').evaluateAll(xs=>xs.every(x=>x.scrollHeight<=x.clientHeight+2));assert.ok(textFits,'complete markets visible');
  if(artifact){await page.screenshot({path:path.join(artifact,`preview-${width}.png`),fullPage:true});await page.locator('#imPreview').screenshot({path:path.join(artifact,`table-${width}.png`)});}
 }
 if(artifact)fs.writeFileSync(path.join(artifact,'real-ocr-result.json'),JSON.stringify(await page.evaluate(()=>importRows),null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS: real browser OCR, exact seven complete rows, four summary fields, desktop/mobile geometry, no page errors');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
