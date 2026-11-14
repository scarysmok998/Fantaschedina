const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('../js/screenshot-layout'),expected=require('./fixtures/sisal-expected.json');
const data={tsv:fs.readFileSync(path.join(__dirname,'fixtures/sisal-baseline.tsv'),'utf8'),text:''};
const geometry=api.plan(data);
assert.equal(geometry.blocks.length,7);
for(const key of ['stake','potentialWin','declaredOdds','date'])assert.equal(geometry[key],expected[key]);
assert.equal(api.plan({text:'unstructured'}),null);
assert.equal(api.plan({tsv:data.tsv.replace(/\b\d+[.,]\d{2}\b/g,'DAMAGED')}),null,'no inferred odds column from corrupt digits');
// Mock recognizer tests validation of structured output; not evidence of OCR quality.
async function simulate(picks,odds){let i=0;const w={setParameters:async()=>{},recognize:async()=>({data:i++===0?data:{text:i%2===0?picks[(i-2)/2]:odds[(i-3)/2]}})};return api.recognize(w,null,async r=>r)}
(async()=>{
 const picks=expected.rows.map(r=>r.pick),odds=expected.rows.map(r=>r.odds.toFixed(2));
 let result=await simulate(picks,odds);assert.deepEqual(result.rows.map(({match,pick,odds})=>({match,pick,odds})),expected.rows);
 odds[0]='1.90';odds[4]='2105!';odds[5]='2.50 2.60';odds[6]='425';picks[2]='U/O 8.5 CORNER: OVER';
 result=await simulate(picks,odds);
 assert.deepEqual(result.rows.map(r=>r.odds),[null,1.57,1.85,2.9,null,null,null]);
 assert.ok(result.rows[0].warnings.some(s=>s.includes('discordanti')));
 assert.ok(result.rows.every(r=>!r.reviewed));
 assert.equal(result.rows[2].pick,picks[2]);
 picks[0]='OVER 2.50';odds[0]='1.80';
 result=await simulate(picks,odds);assert.equal(result.rows[0].pick,'OVER 2.50','do not strip threshold in spatial market crop');
 console.log('PASS: spatial header separation, exact structured contract, missing geometry, unreadable/conflicting odds, threshold and market preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
