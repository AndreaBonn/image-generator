[English](./user-guide.md) | **Italiano**

# Guida utente

Questa guida accompagna nell'uso di Image Generator, dall'avvio a ogni funzione. Si presume che l'app sia già installata: altrimenti segui prima [Installazione](../README.it.md#installazione) nel README.

Pulsanti ed etichette sono citati esattamente come compaiono sullo schermo.

## Indice

- [Avvio e chiusura](#avvio-e-chiusura)
- [L'interfaccia in breve](#linterfaccia-in-breve)
- [Crea: creare un'immagine](#crea-creare-unimmagine)
- [Modifica: modificare un'immagine](#modifica-modificare-unimmagine)
- [Migliora: migliorare un'immagine](#migliora-migliorare-unimmagine)
- [Galleria: galleria e cestino](#galleria-galleria-e-cestino)
- [Impostazioni](#impostazioni)
- [Tastiera](#tastiera)
- [Limiti](#limiti)
- [Dove vengono salvate le immagini](#dove-vengono-salvate-le-immagini)
- [Se qualcosa non va](#se-qualcosa-non-va)

## Avvio e chiusura

**Dal menu delle applicazioni (Linux).** Lancia una volta sola `./scripts/install_launcher.sh` dalla cartella del progetto. Nel menu compaiono due voci:

- **Image Generator** avvia motore e app e li apre in una finestra dedicata (Chrome o Chromium in modalità app; altrimenti il browser predefinito).
- **Chiudi Image Generator** li ferma entrambi e libera la memoria della scheda video.

**Dal terminale.** Lancia `./scripts/start.sh` nella cartella del progetto. Quando compare `Pronto: apri http://127.0.0.1:8000`, apri quell'indirizzo nel browser. Ctrl+C ferma app e motore; da un altro terminale, `./scripts/stop.sh` ferma solo ciò che ha avviato `start.sh`.

L'app è raggiungibile solo da questo computer, su `127.0.0.1`. Gli altri dispositivi della rete non possono aprirla.

## L'interfaccia in breve

La barra in alto contiene le cinque pagine: **Crea**, **Modifica**, **Migliora**, **Galleria** e **Impostazioni**. A destra:

- **Come funziona** (sugli schermi piccoli **Guida**) apre la guida interna: quale lavoro scegliere, perché alcuni lavori vogliono l'inglese, come continuare da un'immagine, come rifare un risultato, cosa fare quando qualcosa non va.
- **Tema chiaro** / **Tema scuro** cambia il tema. Quello predefinito è scuro; la scelta viene ricordata dal browser.

Sempre visibili quando servono:

- **Indicatore dei lavori attivi**: "<lavoro> in corso · NN%" oppure "N lavori in corso". Resta visibile in ogni pagina, quindi puoi lasciare la pagina che ha avviato un lavoro.
- **Banner del motore**: un banner rosso, "Il motore che crea le immagini si è fermato.", con i comandi per riavviarlo. Sparisce da solo quando il motore torna.
- **Avviso sulla scheda video**: sopra "Genera", "Un altro programma sta usando la scheda video." con l'elenco dei processi e della memoria che occupano. Non blocca, ma conviene chiudere quei programmi prima di generare: vedi [Se qualcosa non va](#se-qualcosa-non-va).
- **Pulsanti "?"** accanto a molti controlli mostrano una breve spiegazione al passaggio del mouse, al focus o al clic.

L'impaginazione si adatta agli schermi stretti:

<img src="./assets/create-mobile.webp" alt="La pagina Crea su uno schermo largo 375 px" width="280">

## Crea: creare un'immagine

![La pagina Crea](./assets/create-page.webp)

### 1. Scegli il lavoro

Sotto **Cosa vuoi creare?** i lavori sono divisi in due gruppi.

**Da una descrizione**:

| Lavoro | Serve per | Scrivi in |
|---|---|---|
| Bozza veloce | Provare un'idea in fretta prima di rifinirla (circa 4 s) | inglese |
| Immagine di qualità | Un'immagine curata, con gli stili (circa 30 s) | inglese |
| Creazione libera | Qualsiasi soggetto: la descrizione viene eseguita così com'è, senza filtri aggiunti (circa 30 s) | inglese |
| Scritte nell'immagine e scene complesse | Scritte leggibili e scene con più oggetti (circa 9 s) | italiano o inglese |
| Foto realistica | Foto naturali e credibili, anche di persone (circa 17 s) | italiano o inglese |

**Partendo da tue immagini**:

| Lavoro | Immagini da aggiungere | Scrivi in |
|---|---|---|
| Dallo schizzo | Uno schizzo ("Schizzo"), più una seconda immagine facoltativa per lo stile o il soggetto ("Stile o soggetto") | italiano o inglese |
| In posa | Due immagini: la posa ("Posa") e il personaggio ("Personaggio"). La posa della prima viene applicata al personaggio della seconda | italiano o inglese |
| Crea dai riferimenti | Da 1 a 3 foto dello stesso soggetto o personaggio, per metterlo in una scena nuova | italiano o inglese |

Ogni scheda mostra il tempo previsto, la lingua e **pronto subito** quando il suo modello è già in memoria: la prima immagine non aspetterà il cambio di modello.

**Modelli mancanti.** Se una scheda dice "Mancano dei modelli: clicca per scaricarli.", il clic apre una finestra con l'elenco dei file, la dimensione, il totale e lo spazio che resterà libero. **Scarica** avvia il download; non compare se lo spazio non basta. Durante il download vedi "Modello N di M" con una barra e **Annulla**; in caso di errore, **Riprova**. Alla fine il lavoro viene selezionato da solo.

### 2. Descrivi l'immagine

Scrivi in **Descrivi l'immagine che vuoi**, fino a 2000 caratteri.

- Sopra la casella un'etichetta indica la lingua da usare. **Mostra consigli** apre i suggerimenti per quel lavoro.
- Per i lavori SDXL ("Scrivi in inglese") l'app controlla il testo mentre scrivi. Se sembra italiano lo segnala e propone **Passa a <lavoro>, che capisce l'italiano**.
- **Esempi (clicca per usarli)** riempie la casella con una descrizione d'esempio.

Il modulo resta com'era quando cambi pagina, ma solo nella scheda del browser in uso. Quando viene ripreso compare "Ripresa da dove avevi lasciato." con il pulsante **Svuota la descrizione**. Le immagini di riferimento non vengono conservate.

### 3. Forma, numero, stili

- **Proporzioni**: sei formati comuni sono mostrati con l'uso tipico (storie e telefono, post social, profilo, foto classica, fotografia, schermo e video). Passando il mouse si vedono i pixel. **Altri formati** mostra tutti gli altri.
- **Numero di immagini**: da 1 a 4 per volta. Più immagini danno più scelta e richiedono più tempo.
- **Stili (facoltativi, massimo 5)**, solo per i lavori SDXL. **Sfoglia tutti gli stili** apre il catalogo di 277 stili, ciascuno con un'anteprima. Scrivi nella ricerca ("Cerca fra tutti gli stili", per esempio watercolor, anime, photo) per restringere; una ricerca mostra al massimo 24 risultati. Un clic su uno stile lo aggiunge; la "×" sulla sua etichetta lo toglie. Le anteprime compaiono dopo averle generate da [Impostazioni](#esempi-e-anteprime); fino ad allora ogni stile mostra la sua iniziale.

![Catalogo degli stili filtrato per "anime"](./assets/create-styles.webp)

### 4. Immagini di riferimento e schizzi

Per i lavori che partono dalle tue immagini, **Immagini di riferimento** indica quali immagini servono e mostra un contatore ("N di M").

- **Aggiungi da file** carica un PNG, JPEG o WebP.
- **Aggiungi dalla galleria** apre "Scegli un'immagine dalla galleria" con le tue 24 immagini più recenti.
- La "×" su una miniatura la toglie.

Per **Dallo schizzo** puoi anche disegnare: **Disegna lo schizzo** apre una tela bianca 1024×1024 con **Pennello**, **Gomma**, tre spessori (**Fine**, **Medio**, **Spesso**), **Annulla**, **Cancella tutto** e **Usa come schizzo**.

### 5. Opzioni avanzate

**Opzioni avanzate** è chiuso all'inizio.

![Opzioni avanzate](./assets/create-advanced.webp)

- **Codice del risultato** (il seed). Con **Casuale** spuntato, ogni generazione usa un codice nuovo. **Tieni questo codice** lo fissa: stessa descrizione, stesso lavoro e stesso codice danno di nuovo la stessa immagine. A pannello chiuso, un codice tenuto resta indicato accanto.
- **Passi di generazione**, con il valore consigliato per il lavoro.
- **Aderenza alla descrizione**, quanto seguire la descrizione, con il valore consigliato.
- **Cosa evitare** (il prompt negativo), solo per i lavori che lo supportano. Separa più elementi con una virgola.

### 6. Genera e segui l'avanzamento

**Genera** sta in una barra in fondo alla pagina, con il riepilogo di lavoro, numero di immagini e tempo per immagine. Se manca qualcosa, una riga sotto dice cosa.

Mentre il lavoro procede, l'area dei risultati mostra:

- "In coda..." / "In coda, posizione N."
- "Preparo il modello, circa N secondi.", che compare solo quando passi a un lavoro di tipo diverso
- una barra di avanzamento e l'anteprima dal vivo ("Anteprima in corso")
- "Ci sta mettendo più del previsto." dopo 60 secondi
- **Annulla** per fermare il lavoro; in caso di errore, il messaggio e **Riprova**

Si esegue un lavoro alla volta; gli altri aspettano in coda. Puoi cambiare pagina mentre aspetti: l'indicatore nella barra in alto segue il lavoro.

### 7. Cosa fare con un risultato

Sotto ogni immagine:

- **Aggiungi ai preferiti**
- **Scarica**: il PNG contiene le sue impostazioni, vedi [Riprendere le impostazioni](#riprendere-le-impostazioni-da-unimmagine)
- **Un'altra variante**: stesse impostazioni con un codice nuovo. La variante viene salvata in Galleria e non compare in questa pagina: "Nuova variante avviata: la trovi in Galleria quando è pronta."
- **Modifica**: apre l'immagine nella pagina Modifica, in modalità "Modifica con le parole"
- **Migliora**: apre l'immagine nella pagina Migliora

Prima di generare in questa pagina, l'area dei risultati mostra le ultime quattro immagini sotto **Le tue ultime immagini** e un collegamento alla Galleria.

### Esempi al primo avvio

Finché la galleria è del tutto vuota (cestino compreso), a destra compare **Prova un esempio**: immagini già pronte con il loro lavoro e la descrizione. **Prova questo** compila lavoro, descrizione, codice e proporzioni e porta il focus su **Genera**, senza avviare nulla. Se le immagini d'esempio non sono ancora state generate, si vedono solo le descrizioni.

### Riprendere le impostazioni da un'immagine

**Riprendi le impostazioni da un'immagine creata qui** accetta un file scelto dal disco, oppure un'immagine trascinata sulla casella della descrizione. Per un PNG creato da questa app ripristina lavoro, descrizione, codice (tenuto), proporzioni, stili, passi, aderenza e "cosa evitare", senza avviare la generazione. Le immagini di riferimento non vengono mai riprese: vanno aggiunte di nuovo. Un'immagine senza impostazioni mostra "Questa immagine non contiene impostazioni di Image Generator."

## Modifica: modificare un'immagine

La pagina ha tre passi numerati e l'area dei risultati a destra.

**Passo 1, Cosa vuoi fare?**:

- **Modifica con le parole**: descrivi il cambiamento, anche in italiano
- **Modifica una parte**: colora la zona da rifare
- **Allarga l'immagine**: aggiungi spazio ai lati

**Passo 2, L'immagine**: trascina un'immagine nell'area, oppure usa **Scegli un file** o **Scegli dalla Galleria**. Sono accettati PNG, JPEG o WebP, fino a 20 MB e 4096 px per lato. I pulsanti **Modifica** della Galleria e dei risultati aprono questa pagina con l'immagine già caricata.

### Colorare la zona da cambiare

In **Modifica una parte**, colora la zona da rigenerare; appare in rosso.

![Editor della maschera con la zona colorata sul cappello](./assets/edit-mask.webp)

- **Pennello** e **Gomma**, con **Dimensione** da 8 a 160 px
- **Inverti**: scambia la zona colorata con il resto
- **Cancella tutto**, **Annulla**, **Ripeti**, fino a 20 passi
- **Adatta** e **100%** per lo zoom

Funzionano mouse, touch e penna.

### Allargare l'immagine

In **Allarga l'immagine**, sotto **Direzioni** scegli uno o più lati fra **Sopra**, **Sotto**, **Sinistra**, **Destra**. Ognuno aggiunge il 30% su quel lato. L'anteprima mostra il nuovo riquadro; l'area tratteggiata è quella che verrà generata.

![Allargamento a sinistra e a destra](./assets/edit-outpaint.webp)

**Passo 3, Descrivi la modifica**: obbligatoria per "Modifica con le parole" e "Modifica una parte", facoltativa per "Allarga l'immagine". Solo "Modifica con le parole" offre il codice del risultato e le opzioni avanzate (passi e aderenza).

**Genera** resta disattivato finché il passo non è completo, e la riga sotto dice perché: "Manca l'immagine: aggiungila al passo 2.", "Disegna la zona da modificare prima di generare.", "Scegli almeno una direzione prima di generare.". Se mancano i modelli del lavoro, **Scarica i modelli mancanti** apre la finestra di download. Le modifiche producono un'immagine alla volta.

## Migliora: migliorare un'immagine

![La pagina Migliora](./assets/improve-page.webp)

Carica l'immagine di partenza con **Scegli un file** o trascinandola, oppure con **Migliora** dalla Galleria o da un risultato. Compare come **Immagine di partenza**. Tre schede:

**Cambiala un po'**, una nuova versione simile all'originale:

- **Descrizione** e **Codice del risultato**, facoltativi
- **Variazione leggera** conserva la composizione
- **Variazione forte** reinterpreta l'immagine con più libertà

**Rendila più grande**:

- **Ingrandisci** con **×2** o **×4**; la dimensione finale è indicata ("Diventa L×A pixel"). Il ×4 viene rifiutato se un lato supererebbe 8192 px.
- **Ingrandisci con rifinitura**, sempre ×2: una descrizione facoltativa e un cursore da **Fedele all'originale** a **Più inventiva** che stabilisce quanto possono cambiare i dettagli. Richiede circa 1-2 minuti.

**Togli lo sfondo**: **Rimuovi lo sfondo** tiene solo il soggetto, in un PNG trasparente.

I risultati hanno un cursore **Confronto prima/dopo**, con una scacchiera dietro le immagini trasparenti, e le stesse azioni della pagina Crea.

Questa pagina non ha una scorciatoia per scaricare i modelli mancanti: si installano da [Impostazioni](#modelli).

## Galleria: galleria e cestino

Ogni immagine generata viene salvata in Galleria.

- **Cerca nella descrizione**: trova qualsiasi pezzo del testo che hai scritto
- Filtri: **Tutte**, **Create**, **Modificate**, **Migliorate**, **★ Preferite**
- 24 immagini per pagina; le altre si caricano scorrendo
- Su ogni scheda, al passaggio del mouse (sempre visibili sugli schermi touch): preferito, **Scarica**, **Modifica**

Una galleria vuota mostra "Non hai ancora generato nessuna immagine." con **Vai a Crea**:

![Galleria vuota](./assets/gallery-empty.webp)

### Dettaglio dell'immagine

Il clic su una scheda apre **Dettaglio immagine**: l'immagine, la descrizione, il lavoro, la dimensione e quando è stata creata.

- **Dettagli tecnici**: descrizione completa, codice del risultato, modello, durata
- **Vedi immagine di origine**, quando l'immagine nasce da un'altra
- **Continua da qui**: **Modifica**, **Migliora**, **Un'altra variante**. Una variante avviata da qui viene segnalata in fondo alla pagina e salvata in Galleria quando è pronta.
- **Scarica**, e aggiungi o togli dai preferiti
- **Elimina** chiede "Eliminare questa immagine?"; **Sì, elimina** la sposta nel cestino

Si chiude con **✕**, Esc o un clic fuori.

### Cestino

La scheda **Cestino** elenca le immagini eliminate con la dimensione totale. **Ripristina** rimette un'immagine in Galleria. **Svuota il cestino** chiede conferma, cancella le immagini per sempre e indica lo spazio liberato. Il cestino non si svuota mai da solo.

## Impostazioni

![La pagina Impostazioni](./assets/settings-page.webp)

La pagina si aggiorna ogni 10 secondi.

- **Riepilogo**: "Tutto pronto" oppure "Da sistemare", con motore, lavori disponibili, disco libero e uso della scheda video.
- **Motore**: "Acceso, versione …" oppure "Non risponde.".
- **Scheda video**: nome e memoria occupata, più l'avviso se un altro programma la usa.
- **Disco**: spazio libero, con il minimo consigliato di 5 GB, e la dimensione del cestino con un collegamento.
- **Modello in memoria**: la famiglia di modelli caricata in questo momento, oppure "Nessuno".

### Modelli

**Cosa puoi fare con i modelli installati** elenca, per famiglia di modelli, i lavori che rende possibili, la dimensione, la licenza detta a parole e **✓ Pronto** oppure **! Manca un modello**.

**Tutti i file dei modelli** apre la tabella completa (modello, stato, dimensione, licenza). Per un modello mancante, **Installa · X GB** chiede conferma, poi mostra una barra con **Annulla**, quindi "Verifica in corso..." (controllo del file) e **Installato**. In tutta l'app si scarica un modello alla volta, e un download viene rifiutato se lascerebbe meno dello spazio minimo. **Da terminale** mostra il comando equivalente con il pulsante **Copia**.

### Esempi e anteprime

**Esempi e anteprime** genera, sulla tua scheda video, le immagini degli esempi del primo avvio e del catalogo degli stili:

- **Crea gli esempi mancanti**: pochi minuti
- **Crea le anteprime degli stili mancanti**: circa un'ora se mancano tutte. Intanto puoi continuare a generare: i tuoi lavori passano fra un'anteprima e l'altra.

L'avanzamento ha il pulsante **Annulla**; annullando, le immagini già pronte restano.

### Copie di lavoro del motore

Il motore conserva una seconda copia di ogni immagine che crea. **Cancella le copie di lavoro** libera quello spazio dopo una conferma; le tue immagini restano in Galleria.

### Tema

**Scuro** o **Chiaro**.

## Tastiera

- Schede (modalità di modifica, Galleria/Cestino): frecce sinistra e destra, Home, Fine
- Finestre: Esc le chiude (tranne quella dei modelli durante il download); il Tab resta dentro la finestra
- Suggerimenti "?": Esc li chiude
- Cursori (dimensione del pennello, prima/dopo, rifinitura): tasti freccia

Invio non avvia la generazione, e non si può incollare un'immagine dagli appunti.

## Limiti

| Cosa | Limite |
|---|---|
| Immagine caricata | PNG, JPEG o WebP, fino a 20 MB e 4096 px per lato. Le immagini trasparenti vengono appiattite su bianco |
| File caricati | Cancellati dopo 7 giorni (le immagini generate no) |
| Descrizione e "Cosa evitare" | 2000 caratteri ciascuna |
| Immagini per volta | Da 1 a 4 (modifiche: 1) |
| Stili per immagine | 5 |
| Codice del risultato | Da 0 a 4294967295 |
| Ingrandimento | 8192 px per lato |
| Durata di un lavoro | 600 secondi, poi il lavoro si interrompe con un messaggio |
| Richieste di lavori | 600 al minuto per tutta l'app |

## Dove vengono salvate le immagini

Tutto resta nella cartella `data/` del progetto (si cambia con `DATA_DIR`):

- `data/studio.db`: il database della Galleria
- `data/images/AAAA/MM/`: i PNG a piena risoluzione
- `data/thumbs/`: le miniature della Galleria
- `data/uploads/`, `data/examples/`, `data/style_previews/`, `data/styles/`

Ogni PNG contiene le proprie impostazioni (descrizione, lavoro, modelli, codice, dimensioni, passi, stili e altro) in un blocco di testo chiamato `studio_immagini`. Chi riceve il file può leggerle: se la descrizione è privata, rimuovi i metadati prima di condividerlo.

## Se qualcosa non va

| Cosa vedi | Cosa fare |
|---|---|
| Banner rosso "Il motore che crea le immagini si è fermato." | Chiudi e riapri l'app dal menu, oppure lancia `./scripts/stop.sh` e `./scripts/start.sh`. Il registro del motore è in `engine/comfy.log`. |
| "Memoria della GPU esaurita" | Usa un formato più piccolo, o un'immagine alla volta. |
| "Un altro programma sta usando la scheda video." | Chiudi i programmi indicati. Con Ollama: `ollama ps` mostra il modello caricato, `ollama stop <nome>` lo scarica. Generare mentre un altro programma occupava la scheda video ha già fatto sparire la GPU dal sistema una volta, ed è stato necessario riavviare il computer. |
| "Spazio su disco esaurito" | Libera spazio, usa **Cancella le copie di lavoro** in Impostazioni, oppure svuota il cestino. |
| Una scheda di lavoro è disattivata o dice che mancano modelli | Cliccala per scaricare i modelli, oppure installali da Impostazioni. |
| `nvidia-smi` dice "No devices were found" | Riavvia il computer. |
| "Troppe richieste" | Aspetta un minuto e riprova. |

---

[Torna al README](../README.it.md)
