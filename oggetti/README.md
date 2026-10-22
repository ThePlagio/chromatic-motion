# Chromatic Motion — prova oggetti

Versione sperimentale separata dal Prototipo A. Cerca di isolare un soggetto visivamente evidente, che può essere un oggetto o una persona, usando il modello leggero U²-Net/U2NETP e una maschera binaria. Non è SAM, non misura la distanza, non riconosce il nome dell'oggetto e può includere lo sfondo o più soggetti. Seleziona una regione connessa sufficientemente grande (almeno il 4% del fotogramma completo). I risultati vanno confrontati con il Prototipo A nelle stesse condizioni.

## Uso

1. Apri la pagina HTTPS in Safari, consenti la fotocamera e aspetta il caricamento del modello.
2. Inquadra un oggetto abbastanza grande, possibilmente su uno sfondo semplice e contrastante.
3. Tocca **Mostra maschera**: il verde indica l'area stimata su cui vengono ritagliate le linee. Torna a **Camera + linee** o **Solo linee** per l'effetto.
4. Muovi l'oggetto lentamente e prova al sole, all'ombra, vicino e più lontano. Annota se il verde include lo sfondo, salta o arriva in ritardo. Confronta le stesse scene nel Prototipo A.
5. Se il riconoscimento non è utile, puoi fissare un fotogramma e disegnare la sagoma a mano.

Non è presente una selezione dell'oggetto tramite tocco: è una possibile evoluzione, non una funzione di questa prova. Il modello elabora singoli fotogrammi; non segue l'oggetto con un tracker dedicato. L'analisi può essere più lenta dell'anteprima; le maschere troppo vecchie vengono nascoste per ridurre sovrapposizioni fuorvianti. Non è garantito che le linee restino entro il bordo reale, specialmente durante il movimento.

## Tecnologia e privacy

La fotocamera viene elaborata sul dispositivo. Il codice scarica ONNX Runtime Web 1.20.1 da jsDelivr e il modello [U2NETP](https://huggingface.co/edgetools/u2netp), circa 4,6 MB, da Hugging Face. Il modello viene verificato con SHA-256; i fornitori dei file possono ricevere le normali richieste di rete. La pagina non invia immagini, fotogrammi o maschere a servizi di elaborazione remoti. La prima apertura richiede rete; la disponibilità successiva dipende dalla cache del browser.

Il modello U²-Net è distribuito con licenza Apache-2.0; dettagli, attribuzioni e riferimento al lavoro di Qin et al. sono nella [scheda del modello](https://huggingface.co/edgetools/u2netp) e nel [progetto originale](https://github.com/xuebinqin/U-2-Net).

## Pubblicazione e test iPhone

Per non sostituire le versioni esistenti, pubblicare i file di questa cartella in `oggetti/` nella radice del repository GitHub Pages, mantenendo anche `foreground-worker.js`. Dopo la pubblicazione l'indirizzo previsto è `https://theplagio.github.io/chromatic-motion/oggetti/`.

Da eseguire su Safari iPhone 16: permesso fotocamera posteriore; caricamento runtime e modello; visualizzazione maschera e confronto con le linee; prova oggetto fermo e in movimento, sole/ombra, diverse distanze e sfondi; solo linee; sagoma manuale; cambio orientamento; chiusura fotocamera. In caso di errore o lentezza, annotare il messaggio visualizzato. Nessun test sulla fotocamera fisica è dichiarato effettuato.
