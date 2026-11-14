# Importazione schedine: correzione OCR e bonus

Base: main, commit 566955a (correzione precedente dei menu mobile preservata).

## Pipeline effettiva

L'importazione NON chiama Gemini: `readScreenshot` usa Tesseract 5, lingue ita+eng, nel browser. `api/ai.js` serve la chat statistica. Non è stato introdotto un nuovo endpoint AI né un invio remoto degli screenshot.

Il nuovo modulo `js/screenshot-import.js` converte il testo OCR in un contratto strutturato:

- `rows[]`: `match`, `pick` (mercato e selezione completi), `odds` (numero decimale oppure null), `raw`, `warnings`, `reviewed`;
- `potentialWin`: vincita potenziale dichiarata dal bookmaker, bonus già compresi, oppure null.

Questo è il contratto della pipeline locale: non c'è un prompt Gemini di importazione da cambiare. Un'eventuale futura integrazione AI dovrà produrre questi campi separatamente e passare comunque attraverso normalizzazione e revisione.

Il parser ammette i detriti visibili nello screenshot dopo le quote (`©`, `(È;`, `(5`, valuta). Estrae quote soltanto con un contesto compatibile; non scambia Over 2.50, corner 8.50, 1X2, punteggi e handicap per quote. Non trasforma `2105!`, `425` o lettere OCR in decimali presunti. Conserva continuazioni del mercato anche dopo una riga con quota, senza limiti arbitrari alla lunghezza del pronostico. Unicode e spazi sono normalizzati; nomi, lettere ambigue e parole mancanti richiedono correzione umana.

L'anteprima ha campi separati, pronostico multilinea, testo OCR originale e conferma per ogni riga. Ogni modifica revoca la conferma. La navigazione e il salvataggio verificano nuovamente dati e revisione. Restano obbligatori sette giocatori distinti, una selezione ciascuno, giornata senza pronostici già inseriti e stato iniziale A.

## Vincita potenziale e «di cui bonus»

Si legge la vincita potenziale da una voce esplicita, sulla stessa riga o su quella seguente, gestendo importi IT/EN come `1.234,56 €` e `1,234.56 EUR`. Valori discordanti o ambigui rimangono vuoti. Il campo è modificabile; richiede conferma anche quando non disponibile.

Il bonus NON deve essere esplicitato dal bookmaker:

`bonus = vincita potenziale - arrotonda(puntata × quota1 × … × quota7, 2)`

Si usano le sette quote originali, prima di eventuali annullamenti. L'importo senza bonus viene arrotondato una sola volta ai centesimi; la differenza viene calcolata in centesimi. Un risultato negativo blocca l'importazione e richiede correzione. Dati incompleti non generano un bonus. Il bonus è già incluso nella vincita potenziale e non viene aggiunto al totale.

La vincita potenziale e il bonus vengono salvati in `rounds.potential_win` e `rounds.bonus_amount`, recuperati dal caricamento, mostrati in LIVE/archivio e trasmessi anche al contesto della chat. Per le giornate storiche senza totale dichiarato, LIVE conserva la stima precedente, ora indicata come senza bonus. Il totale dichiarato non rappresenta una vincita effettivamente liquidata; in caso di annullamenti va rivalutato.

La modifica della giornata ricalcola il bonus con le quote disponibili. A ogni caricamento il bonus visualizzato viene ricalcolato dalle quote originali correnti: una correzione successiva di una quota non lascia un importo visualizzato obsoleto. Una differenza negativa viene indicata come «da verificare». Il campo bonus_amount conserva la fotografia dell’ultimo salvataggio della giornata; il totale dichiarato resta la fonte del calcolo.

## Database e pubblicazione

Applicare `migrations/20261114_potential_win.sql` in Supabase PRIMA di pubblicare i file. La migrazione aggiunge due colonne nullable con vincoli; non modifica gli importi storici. Distribuire insieme `index.html`, `js/screenshot-import.js` e `api/ai.js`.

La migrazione non è stata eseguita su produzione. La verifica REST in sola lettura restituisce `42703: column rounds.potential_win does not exist`. Pubblicazione bloccata fino alla migrazione. Il push di prova non trova le credenziali HTTPS GitHub del terminale.

## Verifiche eseguite

- `node tests/screenshot-import.cjs`: passato. Trascrizione delle sette righe visibili nell'anteprima Admin, quote 1.80/1.57/1.85/2.90, rumore OCR, decimali IT/EN, soglie e punteggi, righe complesse e multilinea, conflitti, quote mancanti, sintassi JavaScript reale, importi monetari e formula del bonus (zero, positivo, negativo, dati incompleti).
- `node tests/import-ui.cjs`: passato in Chrome desktop con viewport mobile 390×844 e database simulato. Esegue le funzioni reali dell'anteprima e del salvataggio: modifica revoca revisione, campi invalidi bloccano, controllo totale, bonus negativo blocca, sette giocatori distinti, duplicati respinti, payload numerico e stato A, totale e bonus conservati, dicitura in archivio.
- `git diff --check`: passato.

Per il test UI occorrono Playwright e Chromium; `CHROME_PATH` permette di usare Chrome installato. `NODE_PATH` può puntare al runtime condiviso. Il test è stato eseguito con successo anche in WebKit tramite `BROWSER=webkit`. Anche `tests/dropdown.cjs` passa in Chrome.

## Limiti verificabili

Il riferimento contiene lo screenshot dell'anteprima Admin con il difetto, non la schedina originale leggibile per intero. Alcuni campi sono tagliati dall'input: non è possibile ricostruirne con certezza la parte nascosta. Le fixture riproducono i frammenti visibili; i completamenti multilinea sono casi sintetici, non una ricostruzione certificata dell'originale. Il totale vincita non è visibile in quello screenshot: i test monetari usano esempi sintetici.

Non è stato eseguito un benchmark del riconoscimento Tesseract sui pixel della schedina originale, né un accesso Admin autenticato, una scrittura Supabase reale o un test su telefono fisico. I test UI simulano Supabase e i menu dei giocatori; il comportamento dei menu non è stato modificato.

Il salvataggio conserva il flusso esistente in due operazioni (giornata, poi pronostici), non una transazione atomica: se l'inserimento dei pronostici fallisce può restare una giornata vuota; un nuovo tentativo ne aggiorna i metadati. Le protezioni multiutente/concorrenza restano affidate ai vincoli/RLS del database esistente, non verificati in questa sessione.

## Completamento locale del 14 novembre 2026

Confronto dopo fetch: main e origin/main coincidono con 566955a. Nessuna modifica grafica estranea all’importazione e alla visualizzazione dei totali. Ogni modifica a partita, pronostico o quota revoca anche la conferma del totale; rimuovere una riga la revoca e annullare l’importazione pulisce totale e bonus. Navigazione e salvataggio richiedono esattamente sette giocatori registrati. Migrazione racchiusa in BEGIN/COMMIT per applicare entrambe le colonne atomicamente. Revisione SQL statica completata; esecuzione e vincoli su PostgreSQL reale ancora da verificare con accesso amministrativo. Test parser, sintassi, UI Chrome/WebKit e regressione dropdown Chrome superati.
