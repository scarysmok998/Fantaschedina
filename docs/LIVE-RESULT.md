# Modifica esiti dalla Schedina LIVE

Base: main 847a67d (clone GitHub del 14 novembre 2026). Nessun intervento OCR o grafico precedente rimosso.

Il badge conserva stile e posizione. Per una sessione Admin verificata con l'RPC esistente `is_admin`, diventa un pulsante con menu Vinto/Perso/In attesa. Conferma nativa esplicita prima di scrivere. Gli altri utenti vedono il badge originale. Nessuna modifica al link Sofascore, al nome partita o al resto della scheda.

Si aggiorna solo `picks.result`, con filtro su ID ed esito letto, e si richiede la riga restituita da Supabase. Zero righe, conflitti, errori RLS e rete non producono successo. Lo stato condiviso viene aggiornato solo dalla risposta confermata, tramite `convertPick`; le funzioni esistenti ricalcolano classifica, Power Ranking, statistiche e Hall of Fame. Durante il salvataggio i badge sono disabilitati. La giornata modificata resta visibile, anche dopo l'ultimo esito, per consentire correzioni. Realtime preesistente continua ad aggiornare gli altri dispositivi.

## Sicurezza: verifica incompleta, prerequisito per pubblicazione

Il repository contiene l'integrazione Supabase Auth e la chiamata `is_admin`, ma non la sua definizione, il registro Admin o le policy di `picks`. Il controllo client e il nuovo controllo RPC prima della scrittura NON dimostrano che il database blocchi un attaccante che chiami direttamente REST. Non è stata attestata la sicurezza RLS in produzione. Nessuna policy o dato reale è stato modificato.

Eseguire le query di sola lettura in `live-result-security.sql` con un account database autorizzato. Verificare RLS attivo, `is_admin` basata su `auth.uid()` e lista Admin protetta (oppure metadati gestiti esclusivamente dal server), privilegi, policy e RPC alternative. Se la funzione è già sicura, la modifica minima proposta è la policy UPDATE restrittiva commentata nello stesso file. Se non è sicura, prima correggere la funzione e proteggere la tabella Admin; non sostituirla alla cieca senza conoscere lo schema. Controllare anche INSERT/DELETE per evitare aggiramenti tramite sostituzione delle righe.

Su un ambiente di test autorizzato verificare: anon non può aggiornare; autenticato non Admin non può aggiornare; Admin può aggiornare e rileggere; account revocato non può aggiornare. Usare dati di prova, non risultati reali. L'integrazione va pubblicata solo dopo questi controlli.

## Verifiche locali

`tests/live-result.cjs` carica la pagina completa con un client Supabase simulato: sintassi JavaScript inline, badge non Admin, conferma annullata, A → V → P → A, nessun aggiornamento anticipato, errore RLS, rete, zero righe, conflitto, permesso negato, contatori statistici, rendering viste derivate, link Sofascore invariato, menu nel viewport, Escape e clic esterno. Desktop e touch mobile simulato. Non sostituisce un test con account Supabase reali o dispositivi fisici.

Eseguire con Playwright disponibile: `node tests/live-result.cjs`; `BROWSER=webkit` seleziona WebKit e `CHROME_PATH` può selezionare Chrome locale.

Esito esecuzione: PASS su Chrome/Chromium e WebKit, entrambi con viewport desktop e mobile touch simulato. `git diff --check` superato. Main ricontrollato con fetch al termine: invariato a 847a67d. Push di sola verifica fallito per assenza di credenziali GitHub: nessun commit, push o deploy eseguito.
