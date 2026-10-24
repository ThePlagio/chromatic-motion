# Chromatic Motion — prova persone

Prototipo web separato dedicato alla maschera delle persone. Usa MediaPipe Image Segmenter e il modello Google SelfieSegmenter quadrato, invece del modello generico DeepLab del Prototipo A. Non è SAM e non usa la profondità o LiDAR. Il verde mostra esattamente la maschera impiegata per ritagliare le linee. La vista iniziale è «Mostra maschera».

Il modello identifica pixel di persona e sfondo, non identità o istanze individuali. Può unire più persone o includere lo sfondo; non identifica oggetti generici e non misura la distanza. Secondo la documentazione Google è pensato principalmente per selfie e videoconferenze con soggetti vicini (meno di circa 2 m): figura intera, distanza maggiore, luce esterna, movimenti e sfondi complessi richiedono prove e potrebbero funzionare male. Bordo stimato e linee possono risultare in ritardo rispetto alla scena reale; non è garantito che restino dentro la persona reale. La sagoma manuale opera solo su un fotogramma fermo.

## Prova su iPhone 16

1. Apri la pagina HTTPS in Safari, avvia la fotocamera posteriore, consenti l'accesso e attendi il download del modello.
2. Con «Mostra maschera», osserva il verde intorno a una persona vicina, ferma e in movimento: controlla capelli, mani, arti e possibili porzioni di sfondo.
3. Ripeti a figura intera e a distanze maggiori, al sole e all'ombra, davanti a sfondi semplici e complessi. Prova con una seconda persona.
4. Prova «Camera + linee» e «Solo linee» e verifica fluidità, scostamenti e ritardo. Confronta le stesse scene e distanze con il Prototipo A.
5. Tocca «Registra test» per acquisire al massimo 30 secondi della scena visualizzata, senza audio. Al termine usa «Condividi il video» oppure «Salva il video» e allegalo alla conversazione. Il formato dipende dal supporto di Safari; se la registrazione non parte, usa la registrazione schermo dell'iPhone come alternativa.
6. Se appare un errore, annota il messaggio; prova anche pausa, riavvio, chiusura e rotazione dell'iPhone.

Non è stato effettuato un test sulla fotocamera fisica dell'iPhone: risultati, prestazioni e affidabilità vanno verificati sul dispositivo reale.

## Privacy, dipendenze e pubblicazione

Il video è elaborato nel browser, senza invio di fotogrammi a un servizio di inferenza. Il primo caricamento richiede Internet: runtime MediaPipe 0.10.21 da jsDelivr e modello da Google; questi fornitori ricevono le normali richieste di rete. Il modello è caricato dal percorso `latest` di Google e può essere aggiornato dal fornitore. I file possono essere pubblicati nella cartella `persone/` del repository GitHub Pages, senza sostituire gli altri prototipi.

Riferimenti: [Image Segmenter e modelli Google](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter), [limiti d'uso della segmentazione selfie](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/selfie_segmentation.md).

