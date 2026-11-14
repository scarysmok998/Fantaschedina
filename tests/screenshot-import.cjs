const assert=require('node:assert/strict');
const api=require('../js/screenshot-import.js');
const real=`Norvegia - Galles
U/O 2.5 SQUADRA 1: OVER 1.80 (È;
Portogallo - Danimarca
GOAL/NOGOAL: GOAL 1.57 ©
Romania - Polonia
U/O 8.5 CORNER: OVER 1.85 (5
Salernitana - Catania
1X2 ESITO FINALE: 1 2.90 (È;
Cavese - Crotone
1X2 ESITO FINALE: 1 2105! (È
Spagna - Inghilterra
KANE H. O SOSTITUTO SEGNA O PRENDE i P.
Belgio - Italia
PORTA IN ENTRAMBI TEMPI SI/NO: SI 425 (È;`;
const rows=api.extract(real);
assert.equal(rows.length,7);
assert.deepEqual(rows.map(r=>r.odds),[1.8,1.57,1.85,2.9,null,null,null]);
assert.deepEqual(rows.slice(0,4).map(r=>r.pick),['U/O 2.5 SQUADRA 1: OVER','GOAL/NOGOAL: GOAL','U/O 8.5 CORNER: OVER','1X2 ESITO FINALE: 1']);
assert.ok(rows.every(r=>!api.valid(r)&&r.warnings.length));
for(const pick of ['Over 2.5','Over 2.50','corner 8.5','corner 8.50','1X2','Risultato esatto 2-1','Multigol 1-3','Handicap -1.50','U/O 2.5','1 2105! (È','SI 425 (È;','Kane H. o sostituto segna o prende i P.']){
 assert.equal(api.splitOdds(pick).odds,null,pick);
 assert.equal(api.splitOdds(pick).pick,pick,pick);
}
for(const [pick,n,expected] of [['Over 2.5 1,80',1.8,'Over 2.5'],['GOAL 1.57 ©',1.57,'GOAL'],['1 2.90 (È;',2.9,'1'],['GOAL 1,570 €',1.57,'GOAL'],['Kane H. o sostituto segna o prende i pali 2.10',2.1,'Kane H. o sostituto segna o prende i pali'],['Corner 8.5 quota 1.85',1.85,'Corner 8.5']])assert.deepEqual(api.splitOdds(pick),{pick:expected,odds:n});
for(const n of ['','1','0','-2','Infinity','1e2','2,1.5','2.10x','2O5','425!','1001'])assert.equal(api.decimal(n),null,n);
assert.equal(api.decimal('2,90'),2.9);
const multiline=api.extract('Spagna - Inghilterra\nKane H. o sostituto segna\no prende i pali\n2,10 ©\nquota totale 2,10');
assert.equal(multiline[0].pick,'Kane H. o sostituto segna o prende i pali');
assert.equal(multiline[0].odds,2.1);
const early=api.extract('Spagna - Inghilterra\nKane H. o sostituto segna 2.10\no prende i pali');
assert.equal(early[0].pick,'Kane H. o sostituto segna o prende i pali');
assert.equal(api.normalize({match:'A - B',pick:'GOAL 1.57',odds:1.8}).odds,null);
assert.equal(api.extract('Team A - Team B\nGOAL 1.57\n2.10')[0].odds,null);
assert.equal(api.valid({...rows[0],reviewed:true}),true);
assert.equal(api.valid({...rows[4],reviewed:true}),false);
// Compile the real application script, in addition to unit-testing the shared parser.
const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(script[1]);
console.log('PASS: screenshot transcription, ambiguous thresholds, noise, decimals, multiline, conflicts, review gate and application syntax');
for(const text of ['€ 1.234,56','1,234.56 EUR','1234,56','1234.56'])assert.equal(api.money(text),1234.56);
for(const text of ['1.234','1,234','12O,00','100 + 10','10%','-1','1e3'])assert.equal(api.money(text),null);
const ticket=api.ticket('Team A - Team B\nGOAL 1.57\nVincita potenziale\n€ 1.234,56\nDi cui bonus: 100,00 €');
assert.equal(ticket.potentialWin,1234.56);
assert.equal(ticket.rows[0].odds,1.57);assert.equal(ticket.rows[0].pick,'GOAL');
assert.equal(api.ticket('Vincita potenziale: 100\nVincita potenziale: 200').potentialWin,null);
assert.equal(api.ticket('Vincita potenziale: 100\nBonus: 10%').potentialWin,100);
console.log('PASS: declared potential payout and included bonus, IT/EN currencies, ambiguous money rejected, totals excluded from picks');
assert.equal(api.bonus('1234,56','5',Array(7).fill(1.8)),928.45);
assert.equal(api.bonus('306.11','5',Array(7).fill(1.8)),0);
assert.equal(api.bonus('300','5',Array(7).fill(1.8)),-6.11);
assert.equal(api.bonus('1234,56','5',[1.8,1.8,null,1.8,1.8,1.8,1.8]),null);
assert.equal(api.bonus('1234,56','5',Array(6).fill(1.8)),null);
assert.equal(api.bonus('','5',Array(7).fill(1.8)),null);
console.log('PASS: bonus = declared payout minus stake × seven odds, cents rounding, missing odds and negative discrepancy');
