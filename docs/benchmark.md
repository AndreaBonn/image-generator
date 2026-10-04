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
