# Chromatic Motion — Persone stabile

Pagina di confronto dedicata alla rilevazione delle persone, separata dalla versione con registrazione interna. Usa MediaPipe Image Segmenter con il modello SelfieSegmenter: stima i pixel di persona e di sfondo, non riconosce oggetti generici, non usa LiDAR e non misura la profondità.

## Perché esiste questa pagina

La pagina `persone/` conserva la funzione di registrazione di test. Questa versione elimina quel codice per verificare separatamente il flusso essenziale: fotocamera, caricamento del modello, maschera verde e linee ritagliate. Il suo indirizzo nuovo evita di riutilizzare file vecchi presenti nella cache di Safari.

## Test su iPhone

1. Apri direttamente `https://theplagio.github.io/chromatic-motion/persone-stabile/` in Safari, non nell'app GitHub.
2. Tocca «Apri fotocamera posteriore», autorizza la fotocamera e attendi il messaggio di caricamento del rilevamento.
3. Lascia selezionato «Mostra maschera»: il verde deve corrispondere alla persona.
4. Prova luce uniforme, ombra leggera, sfondo semplice e movimento. Annotare se la maschera include parti dello sfondo.
5. Per allegare un test, usa temporaneamente Registrazione schermo di iPhone; la pagina con il registratore interno rimane disponibile separatamente.

La segmentazione è più affidabile su persone vicine e ben illuminate. Capelli, mani, ombre, soggetti lontani o sfondi simili possono produrre errori. Non è stato svolto un test fisico dell'iPhone durante questa pubblicazione.

L'elaborazione resta nel browser. Al primo avvio sono richiesti Internet e il download del runtime MediaPipe e del modello da fornitori esterni.
