# Chromatic Motion — Prototipo A

Questa è una copia separata del prototipo precedente: aggiunge una vista diagnostica della maschera, senza sostituire il sito già pubblicato. Non integra SAM e non cambia il modello né la soglia di riconoscimento.

Prototipo web mobile per iPhone: osserva la fotocamera, cerca **una sola regione grande** non di sfondo e fa muovere linee libere o forme geometriche soltanto al suo interno.

È un sito statico pronto per GitHub Pages. La fotocamera e l'elaborazione dei suoi fotogrammi rimangono nel browser; l'app non salva, carica o trasmette fotografie e video.

## Cosa fa questa versione

- Chiede la fotocamera posteriore come preferenza (`facingMode: environment`).
- Carica nel browser un modello generico di segmentazione visiva (MediaPipe Image Segmenter con modello DeepLab) e analizza il live a intervalli controllati.
- Tiene soltanto la regione connessa non di sfondo più grande, pari almeno al **18% dell'inquadratura**: gli elementi piccoli vengono ignorati.
- Applica effetti **parziali**, non un riempimento totale. Tre stili di tratto: **Precisa** (quasi retta), **Deformata** (lunga, irregolare e gestuale) e **Spirale** animata. Il ritaglio della maschera impedisce loro di uscire dalla sagoma trovata.
- Offre colori casuali o bianco e nero (predefinito, per richiamare il disegno a tratto), con numero di linee (da 2 a 30), lunghezza e velocità regolabili.
- Consente di scegliere **Camera + linee** oppure **Solo linee**: nella seconda modalità il video viene nascosto, ma la fotocamera continua a fornire la maschera automatica.
- **Mostra maschera** nasconde le linee e sovrappone alla fotocamera, in verde semitrasparente, la stessa maschera usata dall'effetto. Il verde può includere lo sfondo quando la segmentazione sbaglia; se non viene rilevata una regione sufficientemente grande non compare alcuna zona verde. Funziona anche con una sagoma manuale su fotogramma fissato.
- Mantiene l'alternativa affidabile: fissa un fotogramma e disegna manualmente il contorno quando il riconoscimento automatico sbaglia.

## Cosa non promette

La parola “vicino” è qui una scorciatoia visiva: il sito **non misura la distanza** e non usa dati di profondità. Il modello cerca una zona grande e segmentabile, non riconosce qualunque oggetto per nome.

I bordi possono essere instabili con capelli, vetro, trasparenze, ombre, superfici lucide, elementi sottili, soggetti sovrapposti o sfondi simili. Una persona o un oggetto grande ben separato dallo sfondo è il punto di partenza consigliato. Safari può rallentare o consumare più batteria durante l'analisi; per questo il prototipo aggiorna la maschera a circa 4-5 volte al secondo, non a ogni fotogramma.

## Connessione e privacy

Al primo avvio del rilevamento automatico il browser scarica il runtime MediaPipe da jsDelivr e il modello pubblico DeepLab dall'hosting Google. Serve quindi una connessione Internet per quel caricamento. Dopo il caricamento, l'inferenza avviene nel browser sul dispositivo: Chromatic Motion non invia fotogrammi, maschere o coordinate a un proprio server.

Il riferimento tecnico del modello e dell'API è la [documentazione ufficiale MediaPipe Image Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js).

## Pubblicazione su GitHub Pages

Il repository pubblicato è: [ThePlagio/chromatic-motion](https://github.com/ThePlagio/chromatic-motion).

1. Per mantenere la versione originale separata, carica questi file in una nuova cartella del repository, ad esempio `prototipo-a/`, senza sostituire i file alla radice.
2. In GitHub apri **Settings → Pages**.
3. In **Build and deployment**, scegli **Deploy from a branch**, branch `main` e cartella `/(root)`.
4. Dopo la pubblicazione, apri in Safari su iPhone `https://theplagio.github.io/chromatic-motion/prototipo-a/` (solo se i file sono stati effettivamente caricati in quella cartella).

GitHub Pages usa HTTPS, necessario per la fotocamera. Aprire il file direttamente dal telefono o da HTTP in rete locale non è una condizione affidabile per Safari.

## Piano di test — Safari su iPhone 16

Questo piano deve essere eseguito sul dispositivo reale. Nessun test fisico della fotocamera o della segmentazione viene dichiarato completato finché non viene fatto qui.

| Caso | Azione | Risultato atteso | Esito iniziale |
| --- | --- | --- | --- |
| HTTPS | Apri il sito pubblicato in Safari | Nessun avviso di pagina non sicura | Da eseguire su iPhone |
| Permesso | Tocca “Apri fotocamera posteriore” e consenti | Anteprima attiva; viene preferita la camera posteriore | Da eseguire su iPhone |
| Primo caricamento | Con rete attiva, attendi il messaggio “Cerco un oggetto grande” | Runtime e modello diventano pronti senza bloccare la pagina | Da eseguire su iPhone |
| Oggetto grande | Inquadra una persona o un oggetto che occupi almeno circa un quinto dello schermo e sia staccato dallo sfondo | Compare “Oggetto grande agganciato”; le forme restano nella sua maschera | Da eseguire su iPhone |
| Oggetto piccolo | Tieni nell'inquadratura un elemento piccolo | Nessun aggancio stabile e nessun effetto applicato a quell'elemento | Da eseguire su iPhone |
| Stile | Alterna “Precisa”, “Deformata” e “Spirale” | Il tratto cambia stile e rimane ritagliato nel bordo stimato | Da eseguire su iPhone |
| Quantità e misura | Porta “Numero di linee” fino a 30 e varia “Lunghezza delle linee” | Aumentano il numero e l'estensione dei segni, senza uscire dalla maschera | Da eseguire su iPhone |
| Solo linee | Attiva “Solo linee” mentre l'oggetto è agganciato | Il video sparisce, lo sfondo resta scuro e sono visibili soltanto le linee ritagliate nella sagoma | Da eseguire su iPhone |
| Mostra maschera | Inquadra una persona, poi tocca “Mostra maschera” | La fotocamera resta visibile, le linee spariscono e il verde evidenzia l'area realmente usata per ritagliarle; eventuali parti di sfondo incluse mostrano un errore del modello | Da eseguire su iPhone |
| Maschera e condizioni | Prova la stessa persona al sole e all'ombra, da vicino e più lontano, con sfondi diversi | Annota se il verde include lo sfondo, perde parti della persona, sfarfalla o scompare; confronta con “Camera + linee” | Da eseguire su iPhone |
| Maschera manuale | Fissa un fotogramma, disegna una sagoma e seleziona “Mostra maschera” | L'interno della sagoma manuale è verde, sovrapposto al fotogramma fissato | Da eseguire su iPhone |
| Palette | Alterna colori random / bianco e nero e usa “Genera nuovi colori” | La palette cambia; B/N resta monocromatico | Da eseguire su iPhone |
| Caso difficile | Prova vetro, capelli, riflessi, poca luce o due soggetti sovrapposti | Possibili errori di bordo: passa alla sagoma manuale | Da eseguire su iPhone |
| Fallback | Tocca “Fissa fotogramma”, poi “Disegna a mano” | Il contorno manuale sostituisce l'automatico e confina l'effetto | Da eseguire su iPhone |
| Uscita | Tocca “Chiudi” | Le tracce della camera vengono fermate | Da eseguire su iPhone |

## Compatibilità

Richiede Safari moderno, HTTPS, `getUserMedia`, Canvas 2D, Pointer Events e supporto ai moduli JavaScript. L'app preferisce la camera posteriore, ma la lente effettiva dipende da Safari, dai permessi e dalle camere disponibili sul dispositivo.
