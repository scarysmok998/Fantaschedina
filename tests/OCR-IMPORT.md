# Importazione Sisal: lettura per coordinate e anteprima modificabile

Base verificata all'inizio del lavoro: `origin/main` = `77a11d42c6ede6e2ba91a9c138b0432fdb7df691`. La copia precedente era pulita; le modifiche già presenti, incluse dropdown mobile, vincita potenziale e bonus, sono conservate. Nessuna migrazione nuova e nessuna scrittura al database di produzione.

## Diagnosi e correzione

L'importazione usa Tesseract.js 5 nel browser. Gemini serve la chat statistica: non partecipa all'OCR e non esiste un prompt di estrazione da correggere. Gli screenshot restano nel browser.

La lettura dell'intera immagine originale riproduce `2105!`, `425`, rumore delle icone e parole isolate spurie accanto ai mercati. Il solo testo perde la colonna destra. `js/screenshot-layout.js` usa invece il TSV di Tesseract: riconosce intestazioni delle partite con data/ora, individua la colonna delle quote da più decimali osservati a destra e legge separatamente i ritagli di mercato e quota. Non contiene nomi delle squadre, quote attese o coordinate specifiche della fixture.

I mercati multilinea non sono abbreviati. Le soglie nel ritaglio del mercato rimangono testo. La quota del ritaglio deve essere un decimale integro e leggibile: niente ricostruzione di cifre, niente whitelist numerica che trasformi lettere in numeri. Se prima e seconda lettura producono quote valide discordanti il risultato resta nullo. Valori mancanti e illeggibili richiedono inserimento manuale. I layout senza sufficienti riferimenti usano il parser testuale conservativo e segnalano la necessità di controllo.

Nel caso reale il glifo `|` tra parole in `ENTRAMBI | TEMPI` è normalizzato in `I`, con avviso e testo originale conservato. È una normalizzazione esplicita, non una lettura nativa perfetta di tutti i caratteri.

Puntata, quota totale dichiarata, vincita potenziale e data sono separati dalle selezioni mediante posizione delle etichette e dei valori. Il riepilogo mostra separatamente prodotto delle quote e totale dichiarato; non modifica quote per far tornare i conti. Per questo screenshot il prodotto è 330,2362040625 e il totale dichiarato 360,86: viene richiesta la verifica di eventuali bonus. Rimane la formula preesistente del bonus come differenza tra vincita dichiarata e ritorno senza bonus, con revisione obbligatoria.

Data e quota totale dichiarata sono riferimenti nell'anteprima e non vengono aggiunte al database. `potential_win` e `bonus_amount` usano le colonne già esistenti. Non rieseguire vecchie migrazioni per questa modifica.

## Anteprima richiesta dall'utente

La versione finale mostra una tabella simile a «Pronostici e risultati»: partita, mercato completo, quota con due decimali, controllo di revisione e pulsanti matita/rimozione. I campi sono nascosti fino alla matita; il segno di spunta chiude la modifica e aggiorna il testo. Ogni cambiamento revoca la revisione della riga e del totale. I dettagli OCR sono espandibili.

Sul desktop i dati sono allineati in colonne; sotto 1100 px le righe diventano blocchi verticali senza tabella a larghezza minima e senza scorrimento interno. Il secondo passaggio aggiunge giocatori e stato «IN ATTESA», prima del salvataggio. Restano i controlli su sette righe, sette giocatori distinti, valori validi, totale verificato e giornata vuota. Le operazioni Supabase rimangono quelle precedenti; non sono una transazione atomica.

## Prove eseguite e limiti

- `tests/screenshot-import.cjs`: PASS, parser originale, soglie/rumore/conflitti, importi e bonus, compilazione dello script finale dell'app.
- `tests/screenshot-layout.cjs`: PASS, TSV realmente ottenuto dall'immagine; riconoscimento della geometria e riepilogo; test simulati separati per quote illeggibili/discordanti e conservazione delle soglie.
- `tests/ocr-real.cjs`: PASS sui pixel di `tests/fixtures/sisal-original.jpeg`, Tesseract 5.1.1 con core corrispondente e lingue ita+eng. Confronta esattamente le sette righe e i quattro campi di `sisal-expected.json`. Eseguito nuovamente dopo le modifiche finali. Il ridimensionamento di questo test usa Sharp.
- `tests/ocr-browser.cjs`: PASS in Chrome e WebKit sulla pipeline browser reale, caricamento dell'immagine e ritagli canvas. Verificati sette mercati, sette quote, tutti i campi riepilogativi e geometria a 390 e 1440 px. La lettura inizialmente sbagliava 2.50 con interpolazione: per le quote l'ingrandimento ora evita l'interpolazione. Queste esecuzioni precedono la richiesta finale di una tabella con matita.
- `tests/import-ui.cjs`: PASS in Chrome prima dell'ultima revisione grafica: revisione obbligatoria, revoca dopo modifica, quote invalide, bonus negativo, assegnazioni duplicate, payload finale con database simulato.
- I due test browser sono aggiornati per la nuova tabella, ma NON sono stati rieseguiti con successo sulla grafica finale: il processo Chrome è bloccato dal sandbox e il browser integrato rifiuta l'URL del file locale. Non si attribuisce alle esecuzioni precedenti una verifica della grafica successiva.
- `git diff --check`: PASS. Nessun accesso Admin autenticato, scrittura Supabase reale o test su telefono fisico.

La fixture è una sola immagine Sisal: il risultato non garantisce ogni formato, risoluzione o ritaglio. Le distanze tra blocchi e la colonna destra richiedono un layout compatibile; la revisione umana rimane necessaria.

## Riproduzione

Servono Node.js, Playwright con Chrome/WebKit, Tesseract.js 5.1.1/core 5.1.1, lingua ita+eng e Sharp. Nessuna dipendenza di produzione è aggiunta: l'app continua a caricare Tesseract dal CDN già usato.

```sh
node tests/screenshot-import.cjs
node tests/screenshot-layout.cjs
TESSERACT_MODULE=/percorso/tesseract5 CORE_PATH=/percorso/core5/tesseract-core-simd-lstm.wasm.js LANG_PATH=/percorso/lingue node tests/ocr-real.cjs
CHROME_PATH=/percorso/chrome node tests/import-ui.cjs
OCR_ASSETS=/percorso/assets CHROME_PATH=/percorso/chrome ARTIFACT_DIR=/percorso/risultati node tests/ocr-browser.cjs
```

`OCR_ASSETS` contiene `tesseract5/dist`, `core5` e i file `ita.traineddata.gz`, `eng.traineddata.gz`. Il test browser serve queste risorse solo su localhost; non invia l'immagine a servizi remoti. Per WebKit impostare `BROWSER=webkit` e il percorso dei browser Playwright, omettendo `CHROME_PATH`.

## Consegna

Patch binaria rispetto a main e archivio completo del repository senza `.git`, più anteprima HTML autonoma con dati OCR reali e salvataggio simulato. Nessun push o deploy completato; il lavoro non è online. Il tentativo di verifica push senza scrittura si è fermato sulla risoluzione di rete, quindi non dimostra la disponibilità di credenziali GitHub.

## Verifica finale nel repository GitHub locale

La patch è stata applicata su main 77a11d4 in /Users/Leo/Documents/GitHub/Fantaschedina. Superati i test screenshot-import, screenshot-layout e import-ui (Chrome). Rieseguito ocr-browser sulla grafica finale sia in Chrome sia in WebKit: sette mercati e quote esatti, quattro campi riepilogativi, nessun errore di pagina, nessun overflow a 390 e 1440 px. Le colonne potential_win e bonus_amount sono ora presenti: verifica REST in sola lettura con limit=0 riuscita (HTTP 200). Non è stata eseguita alcuna migrazione né scrittura di dati in questa verifica.
