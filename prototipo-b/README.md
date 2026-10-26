# Chromatic Motion — Prototipo B

Questa è una prova web separata dedicata alla struttura dell'effetto desiderato: una persona viene trasformata in una **maschera**, la maschera viene filtrata nel tempo e un campo di linee generative viene ritagliato al suo interno.

Non è SAM, non identifica oggetti generici e non usa LiDAR. È una simulazione nel browser dell'architettura corretta per l'effetto; il renderer è Canvas 2D, mentre una versione nativa potrebbe usare Metal per maggiore fluidità.

## Cosa cambia rispetto al prototipo persone

- La maschera non viene mostrata o usata direttamente: viene ammorbidita nel tempo e leggermente erosa lungo il bordo.
- Le linee sono particelle mosse da un campo fluido, non segni casuali indipendenti a ogni fotogramma.
- Il ritaglio finale (`destination-in`) impedisce alle linee di uscire dalla sagoma calcolata.
- Sono disponibili i tre effetti **Flusso**, **Spirali** e **Tratti**, oltre a camera, solo linee e diagnostica maschera.

## Prova su iPhone

1. Apri la pagina HTTPS in **Safari** e autorizza la fotocamera.
2. Avvia con «Mostra maschera»: cerca una persona vicina, ben illuminata e davanti a uno sfondo diverso.
3. Porta «Stabilità maschera» a 7–8 se il bordo vibra; riducila se la sagoma arriva troppo in ritardo.
4. Torna a «Camera + linee» oppure «Solo linee» e regola densità, lunghezza e velocità.
5. Con ombre nette, figura lontana o sfondo simile alla persona osserva prima la maschera verde: se quella è errata, le linee saranno inevitabilmente errate.
6. Per una prova manuale, fissa un fotogramma e traccia il contorno della persona con un dito.

## Limiti noti

La qualità del contorno dipende dal modello MediaPipe Selfie Segmenter e dalla luce; il filtro aumenta la stabilità ma introduce inevitabilmente un piccolo ritardo. Questo prototipo non è stato provato su una fotocamera fisica iPhone durante la pubblicazione: i risultati vanno verificati sul dispositivo reale.

Il primo avvio scarica il runtime MediaPipe 0.10.21 da jsDelivr e il modello da Google. I fotogrammi restano nel browser e non vengono inviati a un server di inferenza.

