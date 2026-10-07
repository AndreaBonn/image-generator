# Benchmark della Fase 0

Misure del 4 ottobre 2026 su RTX 4060 Laptop (8 GB), ComfyUI v0.38.2, PyTorch 2.14.1+cu130. Script: `scripts/benchmark.py`, risultati grezzi in `docs/benchmark/results.json`, immagini a confronto in `docs/benchmark/contact_sheet.jpg` (le singole immagini restano locali in `docs/benchmark/images/`, escluse da git).

Condizioni: 1152×896, una immagine per esecuzione, seed 42, nessun altro programma sulla GPU (Ollama inattivo). Il primo tentativo del benchmark si è interrotto per un errore Xid 79 della GPU mentre Ollama aveva un modello caricato: vedi SPEC § 5.3.

## Tempi per immagine

| Compito | Modello | Primo avvio | A regime | Picco VRAM |
|---|---|---|---|---|
| `bozza` | Juggernaut XL + Lightning, 4 passi | 5,8 s | 4,0 s | ~7,5 GB |
| `qualita` | Juggernaut XL + offset LoRA, 30 passi | 34,3 s | 28-32 s | ~7,4 GB |
| `testo` | FLUX.2 [klein] 4B fp8, 4 passi | 14,1 s | 9,0 s | ~7,6 GB |

Il picco di VRAM resta alto per tutti perché ComfyUI usa la memoria disponibile in modo dinamico, non perché i modelli la richiedano tutta.

## Cambio di modello

| Passaggio | Tempo della prima immagine |
|---|---|
| SDXL → FLUX.2, senza `/free` | 10,0 s (contro 9,0 a regime) |
| FLUX.2 → SDXL, senza `/free` | 5,4 s (contro 4,0 a regime) |
| FLUX.2 dopo `/free` | 9,8 s |

Nessun out-of-memory al cambio. Decisione: `free_on_family_switch: false`, e il tempo stimato mostrato all'utente al cambio di famiglia è di qualche secondo, non di decine.

## Determinismo

Stesso prompt e stesso seed, rigenerati dopo `/free` (che svuota anche la cache dei nodi): immagini **identiche pixel per pixel** sia per SDXL sia per FLUX.2. "Rigenera" con lo stesso seed riproduce quindi la stessa immagine.

Nota tecnica: senza `/free`, ComfyUI restituisce lo stesso grafo dalla cache in 0,04 s senza rigenerare.

## Limiti di memoria

| Prova | Esito |
|---|---|
| SDXL 1728×1152, 4 immagini | Nessun errore, ma 300 s: ComfyUI scarica parte del modello in RAM |
| FLUX.2 2048×2048, 4 immagini | Out-of-memory su `SamplerCustomAdvanced` |

Testo dell'errore (Q6): `exception_type` = `torch.OutOfMemoryError`, `exception_message` contiene "out of memory". Il backend lo riconosce da questi due campi.

## Qualità e lingua del prompt

Dal confronto visivo delle 24 immagini:

- **Relazioni spaziali** ("cubo rosso sopra la sfera blu, cono giallo a sinistra"): solo FLUX.2 le rispetta.
- **Scritta sull'insegna** ("APERTO TUTTI I GIORNI"): FLUX.2 scrive "APETO TUTTI GIORNI", vicino ma non esatto; SDXL produce lettere senza senso. Il 4B aiuta ma non garantisce testo corretto.
- **Prompt in italiano**: FLUX.2 li segue bene (pescatore con la canna, lago nella nebbia). SDXL coglie il soggetto ma perde dettagli.
- Difetto osservato: FLUX.2 ha disegnato una tazza con due manici nel prompt "prodotto".

Decisioni conseguenti, applicate in `config/tasks.yaml`:

- `testo` (FLUX.2): lingua "Italiano o inglese".
- `bozza`, `qualita` e i compiti SDXL: "Scrivi in inglese", con il motivo corretto ("in italiano coglie il soggetto ma perde molti dettagli").
- `foto` (Z-Image): "Inglese consigliato" finché l'italiano non viene provato.

## Scelta del modello nuovo

**FLUX.2 [klein] 4B** (candidato A), scelto senza fermata perché l'utente ha chiesto di implementare tutto il piano. È più veloce di SDXL qualità (9 s contro 30 s), segue molto meglio i prompt complessi e capisce l'italiano. Z-Image Turbo resta registrato e disattivato: si attiva con `uv run --script scripts/install_models.py --install zimage_turbo zimage_vae` e un template `workflows/zimage_txt2img.json` (non ancora scritto).

## Riferimenti multipli (O5)

Misure del 6 ottobre 2026 su RTX 4060 Laptop (8 GB), ComfyUI v0.38.2. Template provati:
`workflows/flux2_klein_refs_{1,2,3}.json` (catena di `VAEEncode` → `ReferenceLatent` sul
positivo e sul negativo azzerato, uno per riferimento). Condizioni: 1024×1024, latente vuoto
alle stesse proporzioni, seed fisso per riferimento, nessun altro processo sulla GPU
(`nvidia-smi --query-compute-apps` mostrava solo il processo di ComfyUI). `/free` eseguito
prima di ogni esecuzione per svuotare la cache dei nodi e forzare una rigenerazione reale, non
una risposta cache-hit in 0,04 s (stesso comportamento osservato in Fase 0).

| Riferimenti | Esecuzione | Tempo | Picco VRAM | Immagine identica all'altra esecuzione |
|---|---|---|---|---|
| 1 | 1/2 | 17,6 s | 7,8 GB | sì (0 differenza, max diff pixel 0) |
| 1 | 2/2 | 17,1 s | 7,6 GB | sì |
| 2 | 1/2 | 30,9 s | 7,4 GB | sì |
| 2 | 2/2 | 34,6 s | 7,5 GB | sì |
| 3 | 1/2 | 52,2 s | 7,2 GB | sì |
| 3 | 2/2 | 52,1 s | 7,4 GB | sì |

Nessun out-of-memory a 3 riferimenti a 1 MP: il picco resta entro 7,8 GB su 8 GB disponibili,
quindi non è stata necessaria la prova di ripiego a 0,5 MP. Determinismo verificato a confronto
pixel per pixel (`numpy`, `array_equal`) fra le due esecuzioni di ciascun conteggio: identiche
byte per byte in tutti e tre i casi.

**Massimo riferimenti: 3** (AS-P8). La misura permetterebbe margine anche oltre (7,2-7,8 GB di
picco contro 8 GB totali), ma il tetto resta 3 come fissato nel piano (AS-P8), non dalla
capacità osservata. I tempi includono il caricamento del modello, perché `/free` precede ogni
esecuzione: con il modello già in memoria il tempo scende.

Verifica reale dall'interfaccia (T053, 6 ottobre 2026): pagina Crea, compito "Crea dai
riferimenti", 2 foto della galleria dello stesso soggetto (un pescatore anziano), descrizione
"L'uomo delle foto seduto in un caffè di Parigi, luce del mattino, fotografia realistica",
1152×896. Generazione completata in 36,0 s, soggetto riconoscibile nella scena nuova.
"Rigenera" con lo stesso seed (`POST /generations/{id}/rerun`, `new_seed: false`) ha prodotto
un'immagine identica pixel per pixel all'originale.

## Schizzo e posa (O6)

Campioni del gate di qualità (T065), 6 ottobre 2026, RTX 4060 Laptop, ComfyUI v0.38.2, FLUX.2
klein 4B, 1024×1024, seed 20261006, prefisso del compito separato dal prompt da uno spazio. Gli schizzi e gli omini delle pose sono disegnati a tratto
nero su bianco da `docs/benchmark/o6/draw_inputs.py`; il personaggio delle pose è la foto del
pescatore usata anche in O5. Griglia (ingresso a sinistra, risultato a destra):
`docs/benchmark/o6/gate_sheet.jpg`.

| # | Compito | Ingresso | Descrizione | Tempo |
|---|---|---|---|---|
| 1 | `da_schizzo` | casa | Una casetta di campagna in pietra con giardino, fotografia realistica al tramonto | 15,1 s |
| 2 | `da_schizzo` | gatto | Un gatto rosso seduto, illustrazione ad acquerello | 15,1 s |
| 3 | `da_schizzo` | montagne e lago | Lago alpino con una barca e montagne innevate, fotografia di paesaggio | 15,2 s |
| 4 | `da_schizzo` | tazza | Una tazza di caffè fumante su un tavolo di legno accanto a un biscotto, foto di prodotto | 15,1 s |
| 5 | `da_schizzo` | auto | Un'auto d'epoca rossa su una strada di campagna, fotografia realistica | 15,2 s |
| 6 | `in_posa` | braccia alzate | Il personaggio in piedi su una spiaggia con le braccia alzate al cielo | 24,8 s |
| 7 | `in_posa` | seduto | Il personaggio seduto su una panchina in un parco | 25,2 s |
| 8 | `in_posa` | corsa | Il personaggio che corre su un sentiero di campagna | 25,2 s |

Osservazioni di chi ha generato i campioni, da non confondere col verdetto: nel n. 3 le linee
dello schizzo restano visibili sopra la foto, e nel n. 7 l'omino compare come oggetto nella
scena invece di dare la posa al personaggio. Gli altri seguono composizione o posa.

**Verdetto del gate (soglia 4/5 schizzi, 2/3 pose): superato, giudizio dell'utente del 7 ottobre 2026.** `da_schizzo` e `in_posa` restano su FLUX.2 klein; l'uscita verso ControlNet (task T0A1-T0A7) non serve.

## Anteprime degli stili (O9)

Misura del 7 ottobre 2026, RTX 4060 Laptop. Il piano (AS-P9) prevedeva le anteprime col compito
`bozza` (SDXL-Lightning, 4 passi, CFG 1) per contenere il tempo a circa 20 minuti. Prova con lo
stesso prompt ("a woman sitting by a window with a cup of tea") e seed 1 su due stili molto
riconoscibili:

| Stile | `bozza` | `qualita` (30 passi) | `qualita` (12 passi) |
|---|---|---|---|
| Action Figure | foto realistica, stile assente | figura d'azione | figura d'azione |
| Adorable 3D Character | foto realistica, stile assente | personaggio 3D | personaggio 3D |

Con `bozza` lo stile non si vede, quindi le anteprime non servivano allo scopo: generate con
`qualita` a 12 passi, circa 13,5 s ciascuna (27 s misurati per due), circa 62 minuti per tutti
gli stili. Effetto collaterale da sapere: anche quando l'utente sceglie degli stili sul compito
`bozza`, l'effetto è debole.
