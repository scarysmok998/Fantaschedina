// Real image regression, no transcription supplied to the recognizer.
// Requires Tesseract.js 5.1.1, its matching core, ita+eng language files and sharp.
const assert=require('node:assert/strict'),path=require('node:path');
const {createWorker}=require(process.env.TESSERACT_MODULE||'tesseract.js');
const sharp=require('sharp');
const layout=require('../js/screenshot-layout');
const expected=require('./fixtures/sisal-expected.json');
(async()=>{
 const source=path.join(__dirname,'fixtures/sisal-original.jpeg');
 const options={};
 if(process.env.CORE_PATH)options.corePath=path.resolve(process.env.CORE_PATH);
 if(process.env.LANG_PATH){options.langPath=path.resolve(process.env.LANG_PATH);options.cachePath=options.langPath}
 const worker=await createWorker('ita+eng',1,options);
 try{
  const result=await layout.recognize(worker,source,r=>sharp(source).extract(r).resize({width:r.width*3}).png().toBuffer());
  assert.deepEqual(result.rows.map(({match,pick,odds})=>({match,pick,odds})),expected.rows);
  for(const key of ['stake','potentialWin','declaredOdds','date'])assert.equal(result[key],expected[key]);
  assert.ok(result.rows.every(r=>!r.reviewed));
  console.log('PASS: real Sisal pixels, exact seven rows and all four summary fields. Sharp resizing; browser canvas covered separately by ocr-browser.cjs.');
 }finally{await worker.terminate()}
})().catch(e=>{console.error(e);process.exitCode=1});
