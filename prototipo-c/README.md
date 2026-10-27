# Chromatic Motion · Prototipo C

Web App statica per iPhone Safari. Riprende il rilevamento persone verificato nel Test 02 e disegna linee animate esclusivamente dentro la sagoma rilevata.

## Pubblicazione

Copia questa cartella nella directory `prototipo-c/` del repository GitHub Pages. Apri quindi:

`https://theplagio.github.io/chromatic-motion/prototipo-c/`

Per l'accesso alla fotocamera la pagina deve essere servita in HTTPS: GitHub Pages soddisfa questo requisito.

## Controlli

- **Linee fluide**, **Tratti liberi** e **Spirali** modificano il disegno generativo.
- **Camera**, **Solo linee** e **Maschera** cambiano la visualizzazione.
- **Densità**, **Dimensione** e **Velocità** modificano il disegno, senza cambiare il rilevamento.
- **Reattività rilevamento** imposta l'intervallo fra le analisi. Valori più bassi sono più pronti ma richiedono più energia.
- **Precisione del bordo** modifica la soglia di confidenza: aumentarla restringe la sagoma e riduce le fuoriuscite; diminuirla preserva più dettagli ma può includere sfondo.
- **Stabilità contorno** media alcuni fotogrammi: riduce il tremolio, ma aggiunge un lieve ritardo.

## Limiti noti

Il modello riconosce persone, non oggetti generici. Ombre forti, movimenti rapidi, capelli e sfondi con colori simili ai vestiti possono produrre bordi imperfetti. Il modello è caricato dal CDN e l'elaborazione grafica avviene localmente nel browser; l'app non carica né salva i video.

## Test Safari iPhone

1. Apri il link in **Safari** (non nell'anteprima di WhatsApp o Instagram).
2. Tocca `Apri posteriore` e autorizza la fotocamera.
3. Inquadra una persona a figura intera, ben illuminata.
4. Controlla prima `Maschera`: il colore verde deve seguire la persona.
5. Torna a `Camera` o prova `Solo linee`; verifica che i tratti non escano dalla sagoma.
6. Prova prima `Reattività` a 140 ms e `Precisione bordo` al 18%. Poi modifica un solo controllo per volta.

Non è stato eseguito un test fisico di questa versione su iPhone prima della pubblicazione; la base della maschera deriva però dal Test 02 effettivamente verificato dall'utente su iPhone.

