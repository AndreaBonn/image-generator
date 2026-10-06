# Image Generator

Un'applicazione locale, in italiano, per creare e modificare immagini con l'intelligenza artificiale sul proprio computer. Invece di scegliere un modello e regolare decine di parametri, si sceglie il lavoro da fare: una bozza veloce, un'immagine curata, una scritta, la modifica di una parte. L'app usa il modello adatto e dice in che lingua scrivere la descrizione.

Funziona senza internet una volta installata, e le immagini restano sul computer.

## Cosa si può fare

| Pagina | Lavoro | Modello usato | Tempo indicativo* |
|---|---|---|---|
| Crea | Bozza veloce | SDXL Juggernaut + Lightning | 4 s |
| Crea | Immagine di qualità | SDXL Juggernaut | 30 s |
| Crea | Testo nell'immagine e scene complesse | FLUX.2 klein 4B | 9 s |
| Crea | Foto realistica, anche di persone | Z-Image Turbo | 17 s |
| Crea | Stesso soggetto o personaggio in una scena nuova, da 1 a 3 foto di riferimento | FLUX.2 klein 4B | 17-52 s |
| Crea | Dallo schizzo: disegni a mano libera nell'app, o carichi un disegno | FLUX.2 klein 4B | 15 s |
| Crea | In posa: la posa di una figura applicata al personaggio di un'altra foto | FLUX.2 klein 4B | 25 s |
| Modifica | Rigenerare la zona disegnata con il pennello | SDXL + inpaint di Fooocus | 30 s |
| Modifica | Allargare l'immagine verso uno o più lati | SDXL + inpaint di Fooocus | 30 s |
| Migliora | Variazione leggera o forte di un'immagine | SDXL | 15-30 s |
| Migliora | Ingrandire ×2 o ×4 | 4x-UltraSharp | pochi secondi |
| Galleria | Rivedere, cercare, rigenerare, eliminare | | |
| Impostazioni | Stato del motore, memoria della scheda video, disco; installare i modelli mancanti con un clic | | |

\* Misurati su una RTX 4060 Laptop con 8 GB. Il primo lavoro dopo l'avvio, o dopo un cambio di modello, richiede qualche secondo in più. Dettagli in [docs/benchmark.md](docs/benchmark.md).

**Stili con anteprima.** Per i lavori SDXL si sceglie lo stile guardando una miniatura dello stesso soggetto in ciascuno dei 277 stili. Le miniature si generano una volta sola, sul proprio computer, con `cd backend && uv run python -m app.cli.assets styles` (circa un'ora di scheda video).

**Esempi al primo avvio.** Finché la galleria è vuota, la pagina Crea mostra esempi già pronti con "Prova questo", che compila compito, descrizione e seed senza avviare nulla. Anche gli esempi si generano in locale: `cd backend && uv run python -m app.cli.assets examples` (pochi minuti).

**Lingua della descrizione.** Ogni lavoro indica sopra la casella come scrivere. I modelli SDXL sono stati addestrati in inglese: in italiano capiscono il soggetto ma perdono dettagli, e l'app avvisa se la descrizione sembra italiana. FLUX.2 klein capisce bene anche l'italiano.

## Requisiti

- Linux con scheda video NVIDIA da almeno 8 GB e driver recente (CUDA 13). Windows e macOS: vedi la sezione più sotto.
- [uv](https://docs.astral.sh/uv/) per Python e Node.js 20 o successivo per l'interfaccia.
- Circa 31 GB liberi su disco per l'installazione completa (7 GB per il motore, 24 GB per i
  modelli); con `--profile base` bastano circa 16 GB (solo SDXL e l'upscaler).
- Nessuna installazione di Fooocus è richiesta: motore, modelli e stili si scaricano da soli
  (vedi Installazione). Una copia di Fooocus già presente resta utile solo come scorciatoia
  opzionale per evitare qualche download.

## Installazione

Dalla cartella del progetto, un solo comando installa motore, dipendenze di backend e
frontend, stili e tutti i modelli del profilo `completo`:

```bash
uv run --script scripts/install.py
```

Salta da solo i passi già fatti: si può rilanciare in sicurezza in qualsiasi momento, anche
dopo un'interruzione. Per installare solo i modelli essenziali (circa 16 GB invece di 31):

```bash
uv run --script scripts/install.py --profile base
```

Per vedere cosa farebbe, senza scaricare né installare nulla:

```bash
uv run --script scripts/install.py --dry-run
```

Per rieseguire un solo passo (`engine`, `backend_deps`, `frontend_build`, `styles` o
`models`), se è ancora necessario: `uv run --script scripts/install.py --only <passo>`.

Per vedere quali modelli sono presenti e quanto spazio occupano:
`uv run --script scripts/install_models.py --list`. L'installazione si rifiuta di scaricare se
dopo il download resterebbero meno di 5 GB liberi, e mostra il conto in italiano.

### Hai già una copia di Fooocus sul disco?

Non serve per installare: `install.py` scarica tutto da solo. Se però hai già
[Fooocus](https://github.com/lllyasviel/Fooocus) installato, puoi evitare di riscaricare i
modelli che condivide con questa app copiandoli invece:

```bash
uv run --script scripts/migrate_from_fooocus.py --fooocus-dir ~/Fooocus --apply
```

Prima senza `--apply` per vedere cosa farebbe. Se Fooocus è sulla stessa partizione i modelli
vengono spostati, istantaneamente e senza spazio in più; altrimenti vengono copiati e
verificati, e l'originale resta. Dopo, la cartella di Fooocus si può cancellare.

## Avvio

Dal menu delle applicazioni (consigliato). Una volta sola, dalla cartella del progetto:

```bash
./scripts/install_launcher.sh
```

Nel menu compaiono **Image Generator**, che avvia app e motore e apre una finestra dedicata, e **Chiudi Image Generator**, che li ferma e libera la memoria della scheda video. Per toglierle: `./scripts/install_launcher.sh --uninstall`.

Dal terminale:

```bash
./scripts/start.sh
```

Quando compare `Pronto: apri http://127.0.0.1:8000`, apri quell'indirizzo nel browser. Con Ctrl+C si fermano l'app e il motore. Da un altro terminale, `./scripts/stop.sh` ferma solo i processi avviati da `start.sh`.

L'app ascolta solo su questo computer (`127.0.0.1`): non è raggiungibile da altri dispositivi della rete.

## Windows e macOS: non provato

Gli script di installazione, avvio e arresto sono scritti in Python e scelgono da soli percorsi e comandi per il sistema operativo. Su Windows si usano `scripts\install.cmd`, `scripts\start.cmd` e `scripts\stop.cmd`; su macOS gli stessi comandi del terminale di Linux. Sono stati provati solo su Linux.

Limiti già noti:

- Windows: serve una scheda NVIDIA; PyTorch viene installato per CUDA 13 come su Linux. Il menu delle applicazioni (`install_launcher.sh`) esiste solo per Linux.
- macOS: niente CUDA, la scheda grafica dei Mac con chip Apple si usa tramite MPS. Non è garantito che FLUX.2 klein in formato fp8 e i nodi di inpaint funzionino, e i tempi saranno diversi da quelli della tabella.

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

I modelli sono elencati in `config/models.yaml`, i lavori in `config/tasks.yaml` e gli schemi del motore in `workflows/`. Un lavoro nuovo richiede la sua voce in `tasks.yaml`, lo schema in `workflows/` e i modelli registrati e installati con `scripts/install_models.py`.

## Licenze dei modelli

FLUX.2 klein 4B e Z-Image Turbo sono Apache 2.0. SDXL-Lightning e la LoRA offset sono OpenRAIL++. 4x-UltraSharp è CC BY-NC-SA 4.0, quindi non utilizzabile a scopo commerciale. Le licenze di Juggernaut XL e della patch di inpaint di Fooocus vanno verificate prima di qualsiasi uso commerciale delle immagini.

## Per chi sviluppa

La specifica completa è in [SPEC.md](SPEC.md), le convenzioni in [CLAUDE.md](CLAUDE.md). Test: `cd backend && uv run pytest`, `cd frontend && npm test`. Il backend può girare senza scheda video con `ENGINE_MODE=fake`, che genera immagini segnaposto.
