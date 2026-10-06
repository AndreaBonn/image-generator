/**
 * Plain-language explanations shown by InfoTip next to form controls and
 * settings cards. One sentence or two, no jargon, always say the concrete
 * effect of raising/lowering a value rather than naming the underlying
 * mechanism (F3/A9: tooltip inventory for a non-technical user).
 *
 * Keys below "Crea / Modifica / Migliora" and "Galleria / Impostazioni"
 * are wired to a control today. Keys under "Funzioni future" have no
 * control yet: other agents add trash, recipe import, live preview,
 * "Modifica con le parole", "Rimuovi lo sfondo" and "Ingrandisci con
 * rifinitura" and should reuse these instead of writing new copy.
 */
export const HELP_TEXTS = {
  // Crea / Modifica / Migliora: condiviso
  taskSelector:
    "Il tipo di immagine che vuoi creare o modificare. Ogni compito usa un modello diverso, pensato per quel risultato.",
  batch:
    "Quante immagini generare insieme con la stessa descrizione. Più immagini danno più scelta, ma la generazione richiede più tempo.",
  aspectRatio:
    "La forma dell'immagine finale: quadrata, verticale o orizzontale. Scegli il formato più adatto a dove la userai.",
  styles:
    "Applica uno stile visivo predefinito al risultato, come acquerello, foto o fumetto. Puoi scegliere al massimo 5 stili insieme.",
  seed: "Il numero che determina la parte casuale del risultato. Con lo stesso seed e lo stesso testo ottieni immagini simili; lascialo su Casuale per avere ogni volta un risultato diverso.",
  seedLock:
    "Blocca il seed attuale per riusarlo nella prossima generazione: utile per confrontare piccole modifiche al testo mantenendo lo stesso punto di partenza.",
  steps:
    "Quante volte il motore raffina l'immagine prima di mostrarla. Più passi: più dettagli ma più lento. Il valore consigliato va bene quasi sempre.",
  cfg: "Quanto l'immagine deve seguire fedelmente il testo scritto. Valori alti seguono di più il testo ma possono saturare i colori; valori bassi lasciano più libertà al motore.",
  negativePrompt:
    "Elenca, separati da virgola, gli elementi che non vuoi vedere nel risultato, ad esempio sfocato, testo, watermark.",
  references:
    "Da 1 a 3 foto dello stesso soggetto o personaggio: verranno mantenuti nella scena nuova che descrivi nel testo.",

  // Modifica
  maskTools:
    "Il pennello disegna la zona da modificare, la gomma la cancella. Solo l'area colorata verrà rigenerata.",
  maskBrushSize:
    "Quanto è largo il tratto del pennello o della gomma. Aumenta per coprire aree grandi più in fretta, riduci per i dettagli piccoli.",
  maskInvert:
    "Scambia la zona selezionata con quella non selezionata: utile se è più facile disegnare la parte da mantenere invece di quella da cambiare.",
  maskClear: "Cancella tutto il disegno e ricomincia da una tela vuota.",
  maskZoom:
    "Adatta mostra l'intera immagine nello spazio disponibile; 100% la mostra alla sua dimensione reale, utile per disegnare i dettagli piccoli con precisione.",
  outpaintDirections:
    "Scegli su quali lati allargare l'immagine. Il motore inventerà contenuto coerente nella nuova area, intorno a quella esistente.",

  // Migliora
  variationSubtle:
    "Crea una nuova immagine molto simile a quella di partenza, con piccoli cambiamenti casuali.",
  variationStrong:
    "Crea una nuova immagine ispirata a quella di partenza, ma con cambiamenti più marcati nei dettagli.",
  upscaleFactor:
    "Quante volte aumentare la risoluzione dell'immagine. ×4 produce un'immagine più grande e dettagliata, ma richiede più tempo di ×2.",

  // Galleria
  gallerySearch:
    "Cerca fra le immagini generate in base al testo della descrizione usata per crearle.",

  // Impostazioni
  engineStatus:
    "Indica se il motore di generazione è acceso e raggiungibile. Se non risponde, avvialo da terminale come indicato nel banner in alto.",
  gpuVram:
    "Quanta memoria video è occupata in questo momento. Se è quasi piena, altre applicazioni possono rallentare le generazioni o farle fallire.",
  diskSpace:
    "Spazio libero sul disco dove vengono salvate le immagini generate e i modelli. Se scende sotto la soglia minima consigliata, libera spazio prima di continuare.",
  loadedModel:
    "Il modello attualmente caricato in memoria dal motore. Cambiare compito può richiedere di caricarne un altro, con un breve ritardo.",
  modelsTable:
    "L'elenco dei modelli disponibili con il loro stato, la dimensione su disco e la licenza d'uso.",

  // Funzioni future (nessun controllo ancora in UI): trash, recipe import,
  // live preview, modifica libera, rimuovi sfondo, ingrandisci rifinito.
  trashRestore:
    "Riporta questa immagine nella Galleria, come se non fosse mai stata eliminata.",
  trashEmpty:
    "Elimina per sempre tutte le immagini nel cestino e libera lo spazio su disco che occupavano. Questa operazione non si può annullare.",
  recipeImport:
    "Trascina qui un'immagine creata con questa app per ricaricare automaticamente la descrizione e le impostazioni usate per generarla.",
  livePreview:
    "Un'anteprima sfocata dell'immagine mentre viene generata, che si affina progressivamente fino al risultato finale.",
  modificaLibera:
    "Descrivi il cambiamento che vuoi ottenere, in italiano o in inglese: non serve disegnare una maschera. La composizione originale dell'immagine resta invariata.",
  rimuoviSfondo:
    "Mantiene il soggetto principale dell'immagine e rimuove tutto il resto, producendo un file PNG con sfondo trasparente.",
  ingrandisciRifinito:
    "Raddoppia la risoluzione dell'immagine e rifinisce i dettagli più piccoli. Più lento di un ingrandimento semplice: circa 1-2 minuti.",
  intensitaRifinitura:
    "Quanto il motore può modificare i dettagli fini durante la rifinitura, da 0.1 a 0.5. Valori più alti aggiungono più dettaglio inventato, valori più bassi restano più fedeli all'originale.",
} as const;

export type HelpTextKey = keyof typeof HELP_TEXTS;
