# Image Generator

Un'applicazione locale, in italiano, per creare e modificare immagini con l'intelligenza artificiale sul proprio computer. Invece di scegliere un modello e regolare decine di parametri, si sceglie il lavoro da fare: una bozza veloce, un'immagine curata, una scritta, la modifica di una parte. L'app usa il modello adatto e dice in che lingua scrivere la descrizione.

Funziona senza internet una volta installata, e le immagini restano sul computer.

## Cosa si può fare

| Pagina | Lavoro | Modello usato | Tempo indicativo* |
|---|---|---|---|
| Crea | Bozza veloce | SDXL Juggernaut + Lightning | 4 s |
| Crea | Immagine di qualità | SDXL Juggernaut | 30 s |
| Crea | Testo nell'immagine e scene complesse | FLUX.2 klein 4B | 9 s |
| Modifica | Rigenerare la zona disegnata con il pennello | SDXL + inpaint di Fooocus | 30 s |
| Modifica | Allargare l'immagine verso uno o più lati | SDXL + inpaint di Fooocus | 30 s |
| Migliora | Variazione leggera o forte di un'immagine | SDXL | 15-30 s |
| Migliora | Ingrandire ×2 o ×4 | 4x-UltraSharp | pochi secondi |
| Galleria | Rivedere, cercare, rigenerare, eliminare | | |
| Impostazioni | Stato del motore, memoria della scheda video, disco, modelli | | |

\* Misurati su una RTX 4060 Laptop con 8 GB. Il primo lavoro dopo l'avvio, o dopo un cambio di modello, richiede qualche secondo in più. Dettagli in [docs/benchmark.md](docs/benchmark.md).

**Lingua della descrizione.** Ogni lavoro indica sopra la casella come scrivere. I modelli SDXL sono stati addestrati in inglese: in italiano capiscono il soggetto ma perdono dettagli, e l'app avvisa se la descrizione sembra italiana. FLUX.2 klein capisce bene anche l'italiano.

## Requisiti

- Linux con scheda video NVIDIA da almeno 8 GB e driver recente (CUDA 13).
- [uv](https://docs.astral.sh/uv/) per Python e Node.js 20 o successivo per l'interfaccia.
- Circa 20 GB liberi su disco: 7 GB per il motore e 8-9 GB per i modelli nuovi.
- Una copia di [Fooocus](https://github.com/lllyasviel/Fooocus) con i suoi modelli già scaricati: l'app li riusa senza copiarli. Il percorso predefinito è `~/Fooocus`; se è altrove, va indicato in `.env` alla voce `FOOOCUS_DIR` (vedi `.env.example`).

## Installazione

Dalla cartella del progetto:

```bash
./engine/install_engine.sh                                   # motore ComfyUI (circa 7 GB)
uv run --script scripts/install_models.py --install-enabled  # modelli nuovi (circa 8,5 GB)
cd frontend && npm ci && npm run build && cd ..              # interfaccia
```

Per vedere quali modelli sono presenti e quanto spazio serve: `uv run --script scripts/install_models.py --list`. L'installazione si rifiuta di scaricare se dopo il download resterebbero meno di 5 GB liberi.

## Avvio

```bash
./scripts/start.sh
```

Quando compare `Pronto: apri http://127.0.0.1:8000`, apri quell'indirizzo nel browser. Con Ctrl+C si fermano l'app e il motore.

L'app ascolta solo su questo computer (`127.0.0.1`): non è raggiungibile da altri dispositivi della rete.

## Se qualcosa non va

| Cosa vedi | Cosa fare |
|---|---|
| Banner "Il motore non risponde" | Il motore ComfyUI è spento: riavvia con `./scripts/start.sh`. Il registro è in `engine/comfy.log`. |
| "Memoria della scheda video esaurita" | Prova un formato più piccolo o una sola immagine alla volta. |
| Avviso "Un altro programma sta usando la scheda video" | Chiudi il programma indicato. Con Ollama: `ollama ps` per vedere il modello caricato, `ollama stop <nome>` per scaricarlo. Generare mentre un altro programma usa la scheda video ha già bloccato la GPU una volta (si è dovuto riavviare il computer). |
| "Spazio su disco esaurito" | Libera spazio, oppure da Impostazioni usa "Svuota cartella output del motore". |
| Un lavoro risulta "non disponibile" | Manca un modello: Impostazioni mostra il comando esatto per installarlo. |
| La scheda video non viene più trovata (`nvidia-smi` dice "No devices were found") | Riavvia il computer. |

## Aggiungere un modello

I modelli sono elencati in `config/models.yaml` e i lavori in `config/tasks.yaml`. Il lavoro "Foto realistica" con Z-Image Turbo è già previsto ma disattivato: serve installare il modello (`uv run --script scripts/install_models.py --install zimage_turbo zimage_vae`) e aggiungere il suo schema in `workflows/zimage_txt2img.json`.

## Licenze dei modelli

FLUX.2 klein 4B e Z-Image Turbo sono Apache 2.0. SDXL-Lightning e la LoRA offset sono OpenRAIL++. 4x-UltraSharp è CC BY-NC-SA 4.0, quindi non utilizzabile a scopo commerciale. Le licenze di Juggernaut XL e della patch di inpaint di Fooocus vanno verificate prima di qualsiasi uso commerciale delle immagini.

## Per chi sviluppa

La specifica completa è in [SPEC.md](SPEC.md), le convenzioni in [CLAUDE.md](CLAUDE.md). Test: `cd backend && uv run pytest`, `cd frontend && npm test`. Il backend può girare senza scheda video con `ENGINE_MODE=fake`, che genera immagini segnaposto.
