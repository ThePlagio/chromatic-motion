# Chromatic Motion

Prototipo web mobile per iPhone: mostra l'anteprima della fotocamera, consente di disegnare manualmente la sagoma di un oggetto e applica al suo interno un riempimento opaco animato.

Il progetto è statico, senza dipendenze, backend, upload o raccolta dati. È composto da HTML, CSS e JavaScript ed è pronto per GitHub Pages.

## Funzioni incluse

- Richiesta della fotocamera posteriore con `facingMode: "environment"` come preferenza.
- Fotogramma fissato, così il contorno manuale non si sposta mentre viene disegnato.
- Sagoma freehand: un solo gesto lungo il bordo, chiusura automatica al rilascio del dito.
- Riempimento completamente opaco all'interno della sagoma.
- Due effetti: **strisce** diagonali in movimento e **cerchi** animati.
- Palette **colori random** rigenerabile oppure **bianco e nero**.
- Controlli per densità e velocità.
- Gestione essenziale degli errori di permesso, assenza della camera, pagina non HTTPS e camera occupata.

## Pubblicazione su GitHub Pages

1. Crea un nuovo repository GitHub, ad esempio `chromatic-motion`.
2. Carica il **contenuto** di questa cartella nel repository: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest` e `.nojekyll` devono essere nella radice del repository.
3. In GitHub apri **Settings → Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**, la branch `main` e la cartella `/(root)`, quindi salva.
5. Attendi la pubblicazione e apri l'URL `https://<utente>.github.io/chromatic-motion/` con Safari su iPhone.

GitHub Pages usa HTTPS: questo è indispensabile per la fotocamera. Un file aperto direttamente dal telefono o un server HTTP sulla rete locale non è una condizione affidabile per l'accesso alla fotocamera su Safari.

## Avvio locale per il layout

Non c'è una fase di build. Per vedere l'interfaccia su computer basta servire questi file come sito statico. La fotocamera potrà però essere concessa soltanto in un contesto sicuro: HTTPS oppure `localhost` sullo stesso dispositivo. Per il test su iPhone conviene usare direttamente GitHub Pages.

## Piano di test — Safari su iPhone 16

Questa è la procedura da eseguire sul dispositivo reale. Il prototipo non dichiara un test fisico della fotocamera finché questi passaggi non vengono svolti.

| Caso | Azione | Risultato atteso | Esito iniziale |
| --- | --- | --- | --- |
| HTTPS | Apri l'URL GitHub Pages in Safari | Nessun avviso di contesto non sicuro | Da eseguire su iPhone |
| Permesso | Tocca “Apri fotocamera posteriore” e consenti l'accesso | Anteprima attiva; viene preferita la camera posteriore | Da eseguire su iPhone |
| Negazione | Ricarica dopo aver negato il permesso | Messaggio chiaro con indicazione delle impostazioni Safari | Da eseguire su iPhone |
| Sagoma | Fissa il fotogramma, traccia un oggetto con un gesto continuo | Contorno chiuso e riempimento confinato alla sagoma | Da eseguire su iPhone |
| Strisce | Seleziona “Strisce”, varia densità e velocità | Bande opache animate cambiano spaziatura e ritmo | Da eseguire su iPhone |
| Cerchi | Seleziona “Cerchi”, varia densità e velocità | Cerchi opachi animati restano nella sagoma | Da eseguire su iPhone |
| Palette | Alterna colori random / bianco e nero, poi “Genera nuovi colori” | Cambia la palette colorata; B/N resta monocromatico | Da eseguire su iPhone |
| Rotazione | Ruota l'iPhone con una sagoma attiva | La sagoma viene rimossa con un messaggio che richiede di ridisegnarla | Da eseguire su iPhone |
| Uscita | Tocca “Chiudi” oppure lascia la pagina | La camera viene fermata quando si usa “Chiudi”; il browser interrompe le tracce in uscita dalla pagina | Da eseguire su iPhone |

Durante il test, prova soggetti ben separati dallo sfondo, bordi sottili, superfici lucide e luce bassa. Verifica anche il comportamento dopo una chiamata o dopo che un'altra app ha usato la camera: Safari può richiedere di ricaricare la pagina o di rilasciare la camera dall'altra app.

## Limiti della selezione e segmentazione automatica

La prima versione usa intenzionalmente una selezione manuale su fotogramma fissato: è prevedibile, controllabile dall'utente e non richiede di caricare un modello di intelligenza artificiale. Non è un ritaglio professionale al pixel; la precisione dipende dalla mano e dal contrasto del soggetto.

La segmentazione automatica non è inclusa in questo prototipo. In un browser mobile può avere contorni instabili su capelli, vetro, ombre, elementi molto sottili, soggetti parzialmente coperti e sfondi con colori simili. Può inoltre ridurre fluidità e autonomia della batteria, specialmente se il modello lavora a ogni fotogramma. Un'evoluzione possibile è aggiungere una segmentazione locale assistita (per esempio con un modello eseguito nel browser) mantenendo sempre “Fissa fotogramma + correzione manuale” come percorso affidabile.

## Privacy

Il video e il fotogramma fissato restano nel browser. L'app non invia immagini o coordinate di disegno a server e non registra automaticamente video o foto. Chiudere la camera interrompe le tracce attive.

## Compatibilità prevista

Richiede un browser moderno con `getUserMedia`, Canvas 2D e Pointer Events. Il bersaglio di test è Safari aggiornato su iPhone 16 via HTTPS. I dettagli esatti della scelta della lente posteriore dipendono da Safari, dalle autorizzazioni e dalle camere disponibili sul dispositivo.
