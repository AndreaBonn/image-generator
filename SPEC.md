# Studio Immagini: specifica tecnica e funzionale

Versione 1.0 del 2026-10-04. Documento destinato a Claude Code, che svilupperà il sistema in autonomia partendo da questa specifica. Dove la specifica lascia un'incognita, la marca come **DA VERIFICARE** e indica la fase in cui va risolta: non va riempita con un valore plausibile. I DA VERIFICARE tecnici (sampler, nomi di nodi, schemi di messaggi, limiti di memoria) si chiudono con una misura nella fase indicata. Quelli sulle licenze non bloccano lo sviluppo: si annotano nel report per l'utente (§ 14, AS5).

---

## 1. Contesto e obiettivo

### 1.1 Il problema

L'utente usa [Fooocus](https://github.com/lllyasviel/Fooocus) (clonato in `/home/bonn/Documenti/00_Lavoro/ProgettiEsterni/Fooocus`) per generare immagini in locale. Fooocus ha tre limiti:

- è fermo: il progetto è in "Limited LTS, bug fixes only", ultimo commit di codice a gennaio 2025;
- supporta solo modelli SDXL, mentre esistono modelli aperti più recenti che seguono meglio i prompt (FLUX.2 [klein], Z-Image Turbo);
- l'interfaccia è in inglese e piena di parametri tecnici: non dice quale modello usare per quale lavoro né in che lingua scrivere il prompt.

### 1.2 La soluzione

Un'applicazione web locale, **Studio Immagini**, con interfaccia in italiano, che:

1. fa scegliere all'utente **il compito** ("bozza veloce", "foto di qualità", "immagine con testo", "modifica una parte", ...) invece del modello;
2. associa a ogni compito il modello e i parametri giusti tramite una tabella di configurazione;
3. usa **ComfyUI** come motore di generazione headless, pilotato via API HTTP + WebSocket. L'app non contiene codice di inferenza;
4. riusa i modelli già scaricati da Fooocus (checkpoint SDXL, patch di inpaint, LoRA) senza copiarli.

### 1.3 Utente e ambiente

- **Un solo utente**, sulla propria macchina. Nessun accesso da rete in v1.
- Hardware misurato il 2026-10-04:

| Risorsa | Valore |
|---|---|
| OS | Ubuntu 24.04.5 LTS |
| GPU | NVIDIA GeForce RTX 4060 Laptop, **8 GB VRAM** |
| Driver | 580.178.04, CUDA supportato 13.0 |
| RAM | 38 GB |
| CPU | 16 thread |
| Disco | **23 GB liberi** su 350 GB (94% occupato) |
| Toolchain | uv 0.9.26, Node 24.12.0 |

I due vincoli che guidano l'architettura sono **8 GB di VRAM** (un modello grande caricato alla volta) e **23 GB di disco** (set minimo di modelli, vedi § 6).

### 1.4 Risorse esistenti da riusare (senza copiarle)

Nel clone di Fooocus, `models/`:

| Risorsa | Path relativo | Dimensione | Uso in Studio Immagini |
|---|---|---|---|
| Juggernaut XL v8 | `models/checkpoints/juggernautXL_v8Rundiffusion.safetensors` | 6,7 GB | checkpoint SDXL di tutti i compiti SDXL |
| Offset LoRA | `models/loras/sd_xl_offset_example-lora_1.0.safetensors` | 48 MB | LoRA di default a peso 0.1, come Fooocus |
| Fooocus inpaint head | `models/inpaint/fooocus_inpaint_head.pth` | 52 kB | inpaint/outpaint |
| Fooocus inpaint patch | `models/inpaint/inpaint_v26.fooocus.patch` | 1,3 GB | inpaint/outpaint |
| Stili SDXL | `sdxl_styles/*.json` (6 file) | KB | catalogo stili, letto da disco a runtime |

Fooocus è GPL-3.0: gli stili si **leggono dal path configurato**, non si copiano nel repo.

---

## 2. Ambito

### 2.1 Dentro la v1

| ID | Funzione |
|---|---|
| FN1 | Testo → immagine, con scelta del compito, proporzioni, seed, numero di immagini (1-4), stili |
| FN2 | Inpaint: rigenera la zona disegnata con una maschera |
| FN3 | Outpaint: estende l'immagine verso uno o più lati |
| FN4 | Variazioni di un'immagine esistente (sottile / forte) |
| FN5 | Upscale ×2 / ×4 con modello dedicato |
| FN6 | Galleria e storico: archivio locale con prompt, parametri, seed, "rigenera", "usa come input" |
| FN7 | Guida al prompt per compito: lingua richiesta, consigli, esempi, avviso se la lingua sembra sbagliata |
| FN8 | Stato del sistema: motore attivo, VRAM, disco libero, modello caricato, modelli installati |

### 2.2 Fuori dalla v1 (decisioni prese, non dimenticanze)

| Escluso | Motivo |
|---|---|
| Traduzione automatica del prompt | Scelta dell'utente: l'app dice in che lingua scrivere, non traduce |
| Prompt expansion GPT-2 stile "Fooocus V2" | Nessun nodo ComfyUI mantenuto che la replichi in modo affidabile; rivalutare dopo la v1 |
| Accesso da LAN, autenticazione, multi-utente | Uso solo locale; ComfyUI non ha autenticazione reale (§ 9) |
| Gestione LoRA da UI, training, video | Non richiesti |
| Upscale "con rifinitura" (img2img a 2048 px su SDXL) | Rischio di out-of-memory su 8 GB; candidato v1.1 dopo misura |
| Replica identica dell'output Fooocus | Fooocus applica correzioni di sampling proprie (sharpness, adaptive CFG) che ComfyUI non ha: le immagini SDXL saranno simili, non identiche |

---

## 3. Catalogo dei compiti (cuore del prodotto)

L'utente sceglie un compito. Il compito determina modello, workflow, parametri di default e lingua del prompt.

Ogni compito appartiene a una **famiglia di modello**: l'insieme dei pesi che il motore deve tenere in memoria per eseguirlo. Le famiglie sono quattro: `sdxl` (Juggernaut con le sue LoRA e la patch di inpaint), `flux2_klein`, `zimage`, `upscale`. Due compiti della stessa famiglia si alternano senza ricaricare pesi; cambiare famiglia costa un caricamento (§ 5.3). Il catalogo vive in `config/tasks.yaml` (§ 7.4) e un compito il cui modello non è installato appare **disattivato** con il motivo ("modello non installato, vedi Impostazioni").

### 3.1 Compiti di generazione (FN1)

| ID compito | Etichetta UI | Modello | Parametri di default | Lingua del prompt |
|---|---|---|---|---|
| `bozza` | Bozza veloce | Juggernaut XL v8 + LoRA SDXL-Lightning 4-step | 4 step, CFG 1.0, sampler `euler`, scheduler `sgm_uniform` | Inglese |
| `qualita` | Immagine di qualità | Juggernaut XL v8 + offset LoRA 0.1 | 30 step, CFG 4.0, sampler `dpmpp_2m_sde_gpu`, scheduler `karras` (default Fooocus "Speed") | Inglese |
| `testo` | Testo nell'immagine e prompt complessi | FLUX.2 [klein] 4B distilled fp8 | 4 step, CFG 1.0, sampler `euler` con `Flux2Scheduler` (grafo del template ufficiale distilled: `CFGGuider`, negativo azzerato con `ConditioningZeroOut`, nessun prompt negativo) | Inglese consigliato; italiano **DA VERIFICARE** in Fase 0 |
| `foto` | Foto realistica | Z-Image Turbo fp8, **solo se installato** (§ 6) | 8 step, CFG 1.0, sampler **DA VERIFICARE** in Fase 0 | Inglese; italiano **DA VERIFICARE** |

Note:
- `bozza` e `qualita` condividono il checkpoint: passare dall'uno all'altro non ricarica il modello.
- I parametri di FLUX.2 klein vengono dalla [guida ufficiale ComfyUI](https://docs.comfy.org/tutorials/flux/flux-2-klein): oltre 4 step o con CFG alto l'immagine si degrada.
- I parametri SDXL-Lightning vengono dal [README ByteDance](https://huggingface.co/ByteDance/SDXL-Lightning/blob/main/README.md): CFG 0 nella pipeline originale, in ComfyUI si usa 1.0.

### 3.2 Compiti di modifica e miglioramento

| ID compito | Etichetta UI | Modello e metodo | Parametri | Lingua del prompt |
|---|---|---|---|---|
| `inpaint` | Modifica una parte | Juggernaut XL + patch Fooocus inpaint (nodi `comfyui-inpaint-nodes`) | 30 step, CFG 4.0, denoise 1.0, maschera espansa di 12 px, pre-riempimento navier-stokes; il risultato si ricompone sull'originale a piena risoluzione | Inglese, descrivi solo ciò che va nella zona |
| `outpaint` | Allarga l'immagine | Come `inpaint`, con padding dell'immagine e pre-fill della zona nuova | Espansione 30% del lato per ogni direzione scelta (come Fooocus), denoise 1.0 | Inglese, facoltativo |
| `variazione_sottile` | Variazione leggera | img2img sul checkpoint SDXL | denoise 0.5 (valore Fooocus "Vary Subtle") | Inglese, facoltativo |
| `variazione_forte` | Variazione forte | img2img sul checkpoint SDXL | denoise 0.85 (valore Fooocus "Vary Strong") | Inglese, facoltativo |
| `upscale` | Ingrandisci | Modello 4x-UltraSharp, nodi core `UpscaleModelLoader` + `ImageUpscaleWithModel`, poi ridimensionamento al fattore scelto | fattore ×2 o ×4 | Nessun prompt |

Le variazioni si applicano a qualsiasi immagine (anche non generata da SDXL), ma passano sempre dal checkpoint SDXL. Il bordo dell'immagine di input si adatta alle proporzioni SDXL più vicine (§ 3.4).

Per inpaint e outpaint il backend porta l'immagine di input a circa 1 megapixel (lati multipli di 8, proporzioni mantenute) prima di caricarla nel motore: SDXL lavora bene a quella scala. Il risultato viene ricomposto sull'originale con la maschera sfumata, quindi i pixel fuori dalla zona restano identici a quelli di partenza (alla risoluzione di lavoro).

### 3.3 Guida alla lingua del prompt (FN7)

La lingua dipende dal **text encoder** del modello, e l'utente deve saperlo prima di scrivere:

- SDXL usa encoder CLIP addestrati su testo inglese: un prompt in italiano viene in gran parte ignorato.
- FLUX.2 klein e Z-Image usano Qwen3-4B, un LLM multilingua: probabilmente capiscono l'italiano, ma va misurato (Fase 0).

Ogni compito in `tasks.yaml` dichiara:

```yaml
prompt_language:
  required: en            # en | it | any
  label: "Scrivi in inglese"
  reason: "Questo modello capisce bene solo l'inglese: le parole italiane vengono in gran parte ignorate."
prompt_tips:
  - "Descrivi soggetto, ambiente, luce e stile, in quest'ordine."
  - "Frasi brevi separate da virgole funzionano meglio di un paragrafo."
prompt_examples:          # illustrativi: almeno 2, diversi per lunghezza e soggetto
  - "portrait of an old fisherman, weathered face, golden hour, 85mm photo"
  - "cozy reading corner, wooden shelves, rain on the window, soft warm light, illustration"
```

In UI, sopra la casella del prompt: un badge con la lingua ("Scrivi in: inglese"), il motivo in una riga, i consigli in un elemento espandibile, gli esempi cliccabili (riempiono la casella).

**Avviso di lingua non bloccante**: se il compito richiede `en` e il prompt contiene almeno 2 parole funzionali italiane comuni (lista chiusa di circa 40 voci: "il", "lo", "della", "con", "una", "che", ...) e meno parole funzionali inglesi, sotto la casella compare: "Sembra italiano: questo modello capisce bene solo l'inglese." Non impedisce l'invio. È una funzione pura, testata con casi positivi e negativi.

### 3.4 Proporzioni

- Compiti SDXL: le 26 risoluzioni di Fooocus (`modules/flags.py:101`), default `1152×896`. In UI mostrate come nome + rapporto ("Orizzontale 4:3 · 1152×896"), con i 6 formati più usati in evidenza (1:1, 4:3, 3:4, 16:9, 9:16, 3:2) e gli altri in "Altri formati".
- FLUX.2 klein e Z-Image: stesse etichette, risoluzioni intorno a 1 megapixel con lati multipli di 16. **DA VERIFICARE** in Fase 0 il limite di risoluzione su 8 GB.

### 3.5 Stili (solo compiti SDXL)

- Catalogo letto dai 6 JSON in `<FOOOCUS_DIR>/sdxl_styles/`. Ogni voce ha `name`, `prompt` (con segnaposto `{prompt}`), `negative_prompt`.
- Applicazione in backend, prima di costruire il workflow: il prompt dell'utente sostituisce `{prompt}` nel template; i negative prompt degli stili si concatenano con virgola, senza duplicati.
- "Fooocus V2" non è uno stile ma la prompt expansion: escluso (§ 2.2).
- Default per `qualita`: "Fooocus Enhance" + "Fooocus Sharp", come il preset di Fooocus.
- Nei compiti non SDXL il selettore stili è nascosto.
- UI: ricerca per nome, massimo 5 stili selezionati. Le anteprime visive sono fuori dalla v1.

---

## 4. Architettura

### 4.1 Vista d'insieme

```
Browser (React)  --HTTP /api/v1 + SSE-->  Backend FastAPI  --HTTP + WebSocket-->  ComfyUI (headless)
     :5173 dev / servito dal backend        127.0.0.1:8000                           127.0.0.1:8188
                                                 |                                         |
                                       SQLite + immagini                    modelli (Fooocus + nuovi)
                                         (data/)                            via extra_model_paths.yaml
```

- **ComfyUI** è un processo separato, avviato con `--listen 127.0.0.1 --port 8188 --disable-auto-launch`. Il browser non lo raggiunge mai direttamente: passa tutto dal backend.
- **Backend**: unico punto di verità su compiti, job, galleria. Traduce una richiesta "compito + parametri" in un workflow ComfyUI, lo invia, segue l'avanzamento sul WebSocket di ComfyUI e lo inoltra al browser via **SSE** (flusso solo server → client, quindi niente WebSocket verso il browser).
- **Frontend**: SPA React. In produzione la build statica è servita da FastAPI: un solo processo web, una sola porta.

### 4.2 Stack

| Livello | Tecnologia | Note |
|---|---|---|
| Motore | ComfyUI **v0.38.2** (tag fissato), Python 3.12, PyTorch wheel `cu130` | Installazione con `uv venv` + `uv pip install` (§ 6.2) |
| Custom node | `Acly/comfyui-inpaint-nodes` (commit fissato) | Unico custom node della v1 |
| Backend | Python 3.12, FastAPI, httpx (async), `websockets`, pydantic v2, pydantic-settings, SQLAlchemy 2 + SQLite, Pillow, sse-starlette | Gestito con uv |
| Frontend | React 19 + TypeScript + Vite, TanStack Query, React Router, Tailwind CSS | Editor maschera su `<canvas>` nativo, nessuna libreria di disegno |
| Test | pytest, pytest-asyncio, respx; Vitest + Testing Library; Playwright | § 10 |

Prima di usare un'API di una libreria, Claude Code consulta la documentazione aggiornata (Context7). Le versioni esatte si fissano al momento dell'installazione, non vanno prese da questo documento.

### 4.3 Struttura del repository

```
foocus-personal/
  SPEC.md                      # questo documento
  README.md                    # avvio rapido per l'utente (italiano)
  CLAUDE.md                    # convenzioni del progetto per Claude Code
  .env.example
  config/
    tasks.yaml                 # catalogo compiti (§ 7.4)
    models.yaml                # registro modelli: file, cartella, dimensione, URL, licenza (§ 6.3)
    comfy/extra_model_paths.yaml.template
  engine/                      # ComfyUI installato qui (in .gitignore), solo script versionati
    install_engine.sh
  workflows/                   # template ComfyUI in API format, uno per famiglia
    sdxl_txt2img.json
    sdxl_lightning_txt2img.json
    sdxl_img2img.json
    sdxl_inpaint.json
    sdxl_outpaint.json
    flux2_klein_txt2img.json
    zimage_txt2img.json
    upscale.json
  backend/
    pyproject.toml
    app/
      main.py                  # FastAPI app, mount statici, router
      config.py                # Settings (pydantic-settings), unica fonte di config
      api/v1/                  # routes: tasks, jobs, uploads, generations, styles, system
      services/                # job_service, task_service, style_service, prompt_language
      engine/                  # comfy_client.py, workflow_builder.py, events.py
      repositories/            # generation_repository.py, upload_repository.py
      models/                  # SQLAlchemy + schemi pydantic
      errors.py                # AppError e sottoclassi
    tests/                     # mirror di app/
  frontend/
    package.json
    src/
      pages/                   # Crea, Modifica, Migliora, Galleria, Impostazioni
      components/
      api/                     # client tipizzato verso /api/v1
      lib/
    tests/
  scripts/
    start.sh                   # avvia motore + backend (+ frontend in dev)
    install_models.py          # scarica i modelli abilitati, con controllo spazio disco
    benchmark.py               # Fase 0
                               # gli script in scripts/ sono standalone: dichiarano le dipendenze
                               # in testa al file (PEP 723) e si lanciano con `uv run --script`,
                               # senza usare l'ambiente di backend/ né un pyproject in root
  data/                        # in .gitignore: db SQLite, immagini, upload
  docs/
    benchmark.md               # esito della Fase 0
    REPORT_ATTIVITA.md
```

### 4.4 Configurazione

Unico modulo `backend/app/config.py` con `BaseSettings`; nessun `os.getenv` sparso. Variabili (in `.env.example` con questi default):

| Variabile | Default | Significato |
|---|---|---|
| `COMFY_URL` | `http://127.0.0.1:8188` | indirizzo del motore |
| `ENGINE_MODE` | `comfy` | `comfy` oppure `fake` (§ 10.3) |
| `FOOOCUS_DIR` | `/home/bonn/Documenti/00_Lavoro/ProgettiEsterni/Fooocus` | sorgente di modelli e stili |
| `MODELS_DIR` | `<repo>/engine/models` | cartella dei modelli nuovi |
| `DATA_DIR` | `<repo>/data` | db, immagini, upload |
| `MIN_FREE_DISK_GB` | `5` | margine sotto cui l'installer rifiuta un download |
| `JOB_TIMEOUT_S` | `600` | oltre questo tempo un job è marcato fallito |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | bind del backend; `127.0.0.1` è un vincolo di sicurezza (§ 9) |

---

## 5. Motore ComfyUI: integrazione

### 5.1 API usate

Fonte: [docs.comfy.org, server routes](https://docs.comfy.org/development/comfyui-server/comms_routes).

| Uso | Endpoint ComfyUI |
|---|---|
| Inviare un workflow | `POST /prompt` con `{"prompt": <workflow API format>, "client_id": "<uuid>"}` → `prompt_id`, `node_errors` |
| Seguire l'esecuzione | WebSocket `/ws?clientId=<uuid>`: messaggi `status`, `execution_start`, `execution_cached`, `executing`, `progress`, `executed`, `execution_error`, più frame binari di anteprima |
| Recuperare il risultato | `GET /history/{prompt_id}` → elenco output; `GET /view?filename=&subfolder=&type=` → bytes |
| Caricare input | `POST /upload/image` (multipart), `POST /upload/mask` |
| Annullare | `POST /interrupt` (job in esecuzione); `POST /queue` con `delete` (job in coda) |
| Liberare memoria | `POST /free` con `{"unload_models": true, "free_memory": true}` |
| Diagnostica | `GET /system_stats` (VRAM, device), `GET /object_info` (nodi disponibili) |

**DA VERIFICARE in Fase 1**: lo schema esatto dei campi di ogni messaggio WebSocket e il formato dei frame binari di anteprima. Claude Code li cattura da un'esecuzione reale, li salva come fixture in `backend/tests/fixtures/ws/` e scrive il parser su quelle, non su supposizioni.

### 5.2 Template di workflow

- Ogni file in `workflows/` è un workflow in **API format**, esportato dalla UI di ComfyUI (Settings → Dev Mode → "Export (API)") dopo averlo costruito e provato a mano, oppure scritto a mano e poi verificato.
- I nodi che il codice può toccare hanno un `_meta.title` con prefisso `@` che nomina il **nodo** (`@prompt_pos`, `@prompt_neg`, `@sampler`, `@latent`, `@noise`, `@scheduler`, `@guider`, `@input_image`, `@input_mask`, `@pad`, `@resize`, `@scale`, `@output`, ...). In `tasks.yaml` ogni parametro elenca i punti in cui va scritto, nel formato `@titolo.input`: `width: ["@latent.width", "@scheduler.width"]`. Un parametro può scrivere in più nodi.
- `workflow_builder.py` carica il template, trova i nodi per titolo (mai per ID numerico, che cambia a ogni esportazione), scrive i valori nei campi indicati da `tasks.yaml`, restituisce un nuovo dict senza mutare il template in cache. È logica pura e va testata con golden file.
- Un binding che punta a un titolo assente o a un input inesistente fa fallire l'avvio del backend con un messaggio che nomina file e titolo. I nodi `@` non referenziati sono ammessi: sono nodi fissi (loader dei modelli).

**Test di contratto** (marcato `engine`, gira solo con ComfyUI attivo): per ogni template, ogni `class_type` esiste in `GET /object_info`, e i campi bindati esistono negli input di quel nodo. Protegge dagli aggiornamenti di ComfyUI e del custom node.

I nomi esatti delle classi di nodo di `comfyui-inpaint-nodes` (patch Fooocus, VAE encode con inpaint conditioning, expand mask, pre-fill) vanno letti da `/object_info` dopo l'installazione: questa specifica non li fissa.

### 5.3 Gestione della VRAM e cambio di modello

- ComfyUI gestisce offload e caricamento in automatico (VRAM dinamica nelle versioni recenti). Non si aggiungono flag di memoria all'avvio se non quelli che la Fase 0 dimostra necessari.
- Il backend tiene traccia della **famiglia di modello caricata** (`sdxl`, `flux2_klein`, `zimage`, `upscale`), derivata dall'ultimo job completato.
- Quando un job richiede una famiglia diversa, il backend:
  1. emette l'evento SSE `model_switch` con il tempo stimato misurato in Fase 0 ("Cambio modello, circa N secondi");
  2. chiama `POST /free` prima di inviare il workflow, **solo se** la Fase 0 mostra che senza `/free` il cambio va in out-of-memory o è più lento. Altrimenti lascia fare a ComfyUI. Il valore si fissa in `config/tasks.yaml` dopo la Fase 0 (`free_on_family_switch: true | false`); finché la misura non c'è, il default è `false`.
- La UI mostra il modello caricato in Impostazioni e, nel selettore dei compiti, un'icona "pronto subito" sui compiti della famiglia già in memoria.
- **GPU condivisa**: sulla macchina gira anche Ollama, che carica modelli da 6 GB su richiesta di altri programmi. Il 2026-10-04 una generazione SDXL in contemporanea a un modello Ollama caricato ha portato a un errore Xid 79 ("GPU has fallen off the bus"), recuperabile solo con un riavvio. Per questo `/system` riporta la VRAM libera e i processi che la usano; quando un processo diverso dal motore usa la scheda video, la UI mostra un avviso ("Un altro programma sta usando la scheda video") prima di generare. La sola VRAM libera bassa non conta: il motore stesso tiene i modelli in memoria, e `scripts/start.sh` avvisa se `ollama ps` elenca modelli caricati.

### 5.4 Coda e concorrenza

- Una GPU, un job alla volta: la coda è quella di ComfyUI. Il backend non esegue job in parallelo.
- Stati di un job: `queued` → `running` → `completed` | `failed` | `cancelled`.
- Un job con `batch` > 1 è **un solo** prompt ComfyUI con batch size N per SDXL; per FLUX.2 klein e Z-Image, N esecuzioni sequenziali con seed consecutivi se il batch nativo supera la VRAM (**DA VERIFICARE** in Fase 0).
- Il doppio invio dalla UI è impedito dal client (bottone in stato di attesa) e dal server: header `Idempotency-Key` su `POST /jobs`; una seconda richiesta con la stessa chiave entro 60 s restituisce il job esistente.
- All'avvio il backend riconcilia i job rimasti `running` o `queued` da una sessione precedente: li marca `failed` con codice `ENGINE_RESTARTED`.

### 5.5 Recupero e salvataggio dei risultati

1. All'evento `executed` del nodo `@output` (o a fine job, da `/history`), il backend scarica ogni immagine con `/view`.
2. Salva in `data/images/YYYY/MM/<uuid>.png`, con i metadati (compito, prompt, parametri, seed, modello) anche nel chunk PNG `tEXt` `studio_immagini`, così un file portato fuori dall'app conserva la sua ricetta.
3. Genera la miniatura WebP lato lungo 384 px in `data/thumbs/`.
4. Inserisce la riga in `generations` (§ 8).
5. Le immagini nella cartella output di ComfyUI non vengono cancellate in automatico in v1. Su un disco al 94% è un rischio: l'impostazione "Svuota cartella output del motore" in Impostazioni le elimina su richiesta, con conferma.

---

## 6. Modelli e spazio disco

### 6.1 Set della v1 (scelta dell'utente: set minimo sul disco attuale)

Regola: SDXL già presente + **un solo** modello nuovo, scelto in Fase 0 dopo il confronto. L'altro resta registrato in `models.yaml` ma disattivato.

Conseguenza sul catalogo: il compito del candidato scartato resta in `tasks.yaml` e appare in UI disattivato con il motivo "modello non installato". Se vince A (FLUX.2 klein), `foto` è disattivato; se vince B (Z-Image), è disattivato `testo`. In Fase 1 si scrive e si testa solo il template del candidato scelto. Quello dell'altro si aggiunge quando l'utente lo installa.

| Modello | File | Cartella ComfyUI | GB | Licenza | Stato in v1 |
|---|---|---|---|---|---|
| Juggernaut XL v8 | già in Fooocus | `checkpoints` | 0 (riuso) | da Fooocus/RunDiffusion, **DA VERIFICARE** | attivo |
| Offset LoRA | già in Fooocus | `loras` | 0 (riuso) | Stability, OpenRAIL++ | attivo |
| Fooocus inpaint head + patch | già in Fooocus | `inpaint` | 0 (riuso) | **DA VERIFICARE** | attivo |
| SDXL-Lightning 4-step LoRA | `sdxl_lightning_4step_lora.safetensors` ([ByteDance/SDXL-Lightning](https://huggingface.co/ByteDance/SDXL-Lightning)) | `loras` | 0,39 | OpenRAIL++ | attivo |
| 4x-UltraSharp | `4x-UltraSharp.safetensors` ([Kim2091/UltraSharp](https://huggingface.co/Kim2091/UltraSharp)) | `upscale_models` | 0,07 | CC BY-NC-SA 4.0 (solo uso non commerciale) | attivo |
| FLUX.2 [klein] 4B distilled fp8 | `flux-2-klein-4b-fp8.safetensors` ([black-forest-labs/FLUX.2-klein-4b-fp8](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8)) | `diffusion_models` | 4,07 | Apache 2.0 (da fonte secondaria, rileggere la model card) | candidato A |
| Text encoder Qwen3-4B fp4 | `qwen_3_4b_fp4_flux2.safetensors` ([Comfy-Org/vae-text-encorder-for-flux-klein-4b](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b)) | `text_encoders` | 3,85 | Apache 2.0 (Qwen3) | serve ad A e a B |
| VAE FLUX.2 | `flux2-vae.safetensors` | `vae` | 0,34 | come FLUX.2 | serve ad A |
| Z-Image Turbo int8 | `z_image_turbo_int8_convrot.safetensors` ([Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo), ufficiale) | `diffusion_models` | 6,2 | Apache 2.0 (da fonte secondaria) | candidato B |
| VAE Z-Image | `ae.safetensors` ([Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo)) | `vae` | 0,34 | Apache 2.0 | serve a B; verificare se identico al VAE FLUX.2 |

**Non usare FLUX.2 [klein] 9B**: licenza non commerciale BFL.

Budget disco stimato (BASIS: inferred, somma di dimensioni lette sulle model card; il peso dell'ambiente PyTorch non è misurato):

| Voce | GB |
|---|---|
| Ambiente ComfyUI + PyTorch cu130 | 5-8 (stima) |
| Lightning LoRA + UltraSharp | 0,5 |
| Candidato A (FLUX.2 klein + encoder fp4 + VAE) | 8,3 |
| **Totale con A** | **circa 14-17** su 23 liberi |
| Candidato B al posto di A (Z-Image fp8 + encoder fp4 + VAE) | 10,4 |
| A e B insieme | non ci stanno con margine: si richiede di liberare spazio |

Nota per l'utente, non per Claude Code: `~/.cache/huggingface` occupa 7,9 GB e potrebbe contenere modelli non più usati.

### 6.2 Installazione del motore (`engine/install_engine.sh`)

Idempotente, rieseguibile, si ferma al primo errore (`set -euo pipefail`):

1. Controlla lo spazio libero: se è sotto 10 GB, si ferma con un messaggio. La soglia è più alta dei 5 GB di `MIN_FREE_DISK_GB` perché l'ambiente PyTorch da solo occupa 5-8 GB. `MIN_FREE_DISK_GB` resta il margine da lasciare libero dopo ogni download di modello.
2. `git clone https://github.com/Comfy-Org/ComfyUI.git engine/ComfyUI` e checkout del tag `v0.38.2`.
3. `uv venv --python 3.12 engine/ComfyUI/.venv`.
4. `uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130` (il driver 580 supporta CUDA 13.0, misurato).
5. `uv pip install -r engine/ComfyUI/requirements.txt`.
6. Clona `Acly/comfyui-inpaint-nodes` in `engine/ComfyUI/custom_nodes/` a un commit fissato, e installa le sue dipendenze (`opencv-python`).
7. Genera `engine/ComfyUI/extra_model_paths.yaml` dal template, puntando a `FOOOCUS_DIR/models/{checkpoints,loras,inpaint,upscale_models}` e a `MODELS_DIR` per i modelli nuovi.
8. Avvia ComfyUI per 60 s al massimo, aspetta che `GET /system_stats` risponda (attesa su condizione, non sleep fisso), stampa device e VRAM, lo ferma.

Il percorso uv non è quello documentato da Comfy-Org (che usa pip), ma installa gli stessi pacchetti. Se fallisce, il fallback è `comfy-cli` (`uv tool install comfy-cli`), da dichiarare nel report.

### 6.3 Installer dei modelli (`scripts/install_models.py`)

- Legge `config/models.yaml`: per ogni modello id, famiglia, file, repo HF, cartella di destinazione, dimensione attesa, licenza, `enabled`.
- `uv run --script scripts/install_models.py --list` mostra lo stato (installato / mancante / riusato da Fooocus) e lo spazio necessario.
- `--install <id>`: prima di scaricare verifica `spazio_libero - dimensione >= MIN_FREE_DISK_GB`, altrimenti rifiuta con il conto esplicito. Scarica con `huggingface_hub` (`hf_hub_download`, `local_dir` nella cartella giusta, niente copia in cache). Dopo il download verifica la dimensione.
- **Se l'installer rifiuta per spazio**, Claude Code non libera spazio da solo e non cancella nulla, né modelli né cache. Si ferma e riporta all'utente il conto (spazio libero, dimensione richiesta, margine), chiedendogli come procedere.
- `--remove <id>`: cancella i file di un modello non riusato da Fooocus, chiedendo conferma.
- Non scarica mai nulla senza un `--install` esplicito.

---

## 7. Backend

### 7.1 Strati

`api/v1` (route sottili: validazione, serializzazione) → `services` (logica, indipendente dal framework) → `repositories` (SQLite, file system) ed `engine` (client ComfyUI). Le dipendenze puntano verso l'interno; il client ComfyUI si inietta con `Depends()`, così nei test si sostituisce con il fake.

### 7.2 API REST

Base `/api/v1`. Formato di successo `{"data": ..., "meta": {...}}`, di errore `{"error": {"code", "message", "details": [{"field", "message"}]}}`. `message` è in italiano, perché arriva all'utente.

| Metodo | Path | Scopo |
|---|---|---|
| GET | `/health` | `{"backend": "ok", "engine": "ok" \| "unreachable"}` |
| GET | `/system` | VRAM totale/libera, disco libero, famiglia di modello caricata, modelli installati |
| GET | `/tasks` | Catalogo compiti con disponibilità, guida al prompt, schema parametri (default, min, max, opzioni) |
| GET | `/styles` | Stili SDXL `{id, name, source_file}` con ricerca `?q=` |
| POST | `/uploads` | Multipart `file`, `kind=image\|mask` → `{upload_id, width, height}`. Solo PNG/JPEG/WebP, massimo 20 MB, massimo 4096 px per lato |
| POST | `/jobs` | Crea un job (corpo in § 7.3) → `202` con `{job_id}` |
| GET | `/jobs/{id}` | Stato del job |
| GET | `/jobs/{id}/events` | SSE: `queued{position}`, `model_switch{family, eta_s}`, `progress{step, total, preview_url?}`, `completed{generation_ids}`, `failed{code, message}`, `cancelled` |
| POST | `/jobs/{id}/cancel` | Annulla: rimuove dalla coda o interrompe |
| GET | `/generations` | Galleria paginata: `page`, `per_page` (default 24, massimo 100), filtri `task_id`, `q` (testo nel prompt), `favorite`. `meta`: `page`, `per_page`, `total`, `total_pages` |
| GET | `/generations/{id}` | Dettaglio con parametri completi e `parent_id` |
| GET | `/generations/{id}/image` e `/thumbnail` | File |
| PATCH | `/generations/{id}` | `{"favorite": bool}` |
| DELETE | `/generations/{id}` | Soft delete (`deleted_at`) |
| POST | `/generations/{id}/rerun` | Nuovo job con gli stessi parametri; `{"new_seed": bool}` |
| POST | `/maintenance/clear-engine-output` | Svuota la cartella output di ComfyUI |

### 7.3 Corpo di `POST /jobs`

```json
{
  "task_id": "qualita",
  "prompt": "portrait of an old fisherman, golden hour",
  "negative_prompt": "",
  "params": {
    "aspect_ratio": "1152*896",
    "seed": null,
    "batch": 2,
    "style_ids": ["Fooocus Enhance", "Fooocus Sharp"],
    "steps": null,
    "cfg": null
  },
  "input_upload_id": null,
  "mask_upload_id": null,
  "source_generation_id": null,
  "outpaint_directions": [],
  "upscale_factor": null
}
```

Regole di validazione (errore `422` con dettaglio per campo):

- `task_id` esistente e disponibile, altrimenti `409 MODEL_NOT_INSTALLED`.
- `prompt` obbligatorio per i compiti di generazione e per `inpaint`; massimo 2000 caratteri.
- `seed` nullo → casuale nel range 0..2^32-1, salvato nella generazione.
- `batch` 1-4. `steps` e `cfg` nulli → default del compito; valorizzati → dentro il range dichiarato in `tasks.yaml` (visibili in UI solo in "Opzioni avanzate").
- `aspect_ratio` dentro la lista del compito.
- `inpaint` richiede immagine (`input_upload_id` o `source_generation_id`) e maschera; `outpaint` richiede immagine e almeno una direzione fra `top`, `bottom`, `left`, `right`; variazioni e upscale richiedono un'immagine; `upscale_factor` è 2 o 4.

### 7.4 `config/tasks.yaml`

Un compito dichiara: `id`, `label`, `description` (una riga, italiano), `group` (`crea` | `modifica` | `migliora`), `model_ids` richiesti, `family`, `workflow` (file template), `bindings` (titolo `@` → campo input → sorgente del valore), `defaults`, `limits`, `aspect_ratios`, `supports_styles`, `prompt_language`, `prompt_tips`, `prompt_examples`. Il file si valida all'avvio con un modello pydantic: un errore ferma l'avvio e nomina il campo.

### 7.5 Errori

Gerarchia `AppError(code, message, http_status)` in `errors.py`, catturata solo nell'handler globale.

| Codice | HTTP | Messaggio all'utente (esempio) |
|---|---|---|
| `VALIDATION_ERROR` | 422 | per campo |
| `NOT_FOUND` | 404 | "Generazione non trovata." |
| `MODEL_NOT_INSTALLED` | 409 | "Il modello per «Foto realistica» non è installato." |
| `ENGINE_UNAVAILABLE` | 503 | "Il motore non risponde. Avvialo con scripts/start.sh." |
| `ENGINE_REJECTED` | 502 | `node_errors` di ComfyUI riassunti; dettaglio completo nel log |
| `OUT_OF_MEMORY` | 507 | "Memoria della GPU esaurita. Prova un formato più piccolo o 1 immagine alla volta." Riconosciuto dal testo di `execution_error` (pattern **DA VERIFICARE** con un OOM provocato in Fase 0) |
| `JOB_TIMEOUT` | 504 | "La generazione ha superato i 10 minuti ed è stata interrotta." |
| `ENGINE_RESTARTED` | 500 | "Il motore si è riavviato durante la generazione." |
| `DISK_FULL` | 507 | "Spazio su disco esaurito: libera spazio o svuota la cartella output del motore." Controllato prima di salvare |

### 7.6 Logging

Progetto personale e locale: `logging` standard, leggibile in console, livello da config. Si logga ogni job (id, compito, durata, esito) e ogni errore del motore con il `prompt_id`. Il testo dei prompt sta a DEBUG. Niente metriche Prometheus né tracing in v1.

---

## 8. Dati

SQLite in `data/studio.db`, SQLAlchemy 2, schema creato con migrazioni Alembic (`up` e `down`).

**`generations`**

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (text) | PK |
| `job_id` | UUID | job di origine |
| `task_id` | text | |
| `model_ids` | JSON | |
| `prompt`, `negative_prompt` | text | prompt effettivo dopo gli stili in `prompt_final` |
| `prompt_final` | text | |
| `params` | JSON | tutti i parametri risolti, seed incluso |
| `seed` | integer | duplicato fuori da JSON per ricerca e "rigenera" |
| `width`, `height` | integer | |
| `image_path`, `thumb_path` | text | relativi a `DATA_DIR` |
| `parent_id` | UUID null | immagine di input per modifica/variazione/upscale |
| `duration_ms` | integer | |
| `favorite` | boolean | default false |
| `created_at`, `updated_at` | datetime | |
| `deleted_at` | datetime null | soft delete |

Indici: `idx_generations_created_at`, `idx_generations_task_id`, `idx_generations_parent_id`.

**`jobs`**: `id`, `task_id`, `status`, `comfy_prompt_id`, `request` (JSON), `error_code`, `error_message`, `idempotency_key` (indice unico), `created_at`, `updated_at`.

**`uploads`**: `id`, `kind`, `path`, `width`, `height`, `created_at`. Gli upload non collegati a nessuna generazione dopo 7 giorni si eliminano all'avvio.

---

## 9. Sicurezza

- Backend e ComfyUI ascoltano solo su `127.0.0.1`. ComfyUI non ha autenticazione reale (`--multi-user` è impersonabile via header): esporre la porta 8188 in LAN equivale a regalare il motore a chiunque sia sulla rete. Un futuro accesso da LAN richiede autenticazione nel backend e ComfyUI sempre su localhost.
- Upload: si controlla il tipo reale aprendo il file con Pillow (non l'estensione), si rispettano i limiti di dimensione, si salva con nome generato (UUID), mai con il nome del client.
- Path: ogni file servito si risolve dentro `DATA_DIR`; un path che ne esce dà `404`.
- I prompt entrano nel workflow come valori JSON, mai concatenati in codice o comandi.
- Nessun `subprocess` con `shell=True` negli script; nessun segreto richiesto in v1. Se un modello richiede token HF, va in `.env` (escluso da git) e in `.env.example` come variabile vuota.
- CORS: in sviluppo, solo l'origine del dev server Vite; in produzione nessuno, perché frontend e API hanno la stessa origine.

---

## 10. Testing

### 10.1 Backend (pytest, TDD)

- Unità, logica pura: `workflow_builder` (golden file per ogni template e compito), rilevatore di lingua (casi italiani, inglesi, misti, vuoto, una parola sola), applicazione degli stili, risoluzione dei parametri e dei default, mappatura degli errori ComfyUI → `AppError`, parser dei messaggi WebSocket sulle fixture reali catturate in Fase 1.
- Servizi e API: con `ENGINE_MODE=fake` e con il client ComfyUI simulato (respx per HTTP, server WebSocket finto per gli eventi). Casi obbligatori: job completato, job fallito con `node_errors`, OOM, motore spento, annullamento in coda e in esecuzione, idempotenza, riconciliazione all'avvio, disco pieno.
- Contratto (`pytest -m engine`, richiede ComfyUI attivo): § 5.2.
- Copertura minima 80% su `services` ed `engine`.

### 10.2 Frontend

Vitest + Testing Library su: selettore compiti (disattivato con motivo), guida al prompt e avviso di lingua, form parametri (validazione on blur, stati), editor maschera (pennello, gomma, inversione, esportazione PNG bianco/nero corretta), galleria (vuota, piena, errore, paginazione).

### 10.3 Modalità fake ed E2E

`ENGINE_MODE=fake` sostituisce il client ComfyUI con un'implementazione che emette eventi realistici (coda, cambio modello, 4 step di progresso) e restituisce un PNG generato con Pillow delle dimensioni richieste, con il seed scritto sopra. Serve a sviluppare e testare la UI senza GPU.

Playwright, in modalità fake, a 375 px e 1280 px: genera un'immagine → appare in galleria → "Modifica una parte" con maschera → risultato collegato al padre → "Rigenera" con nuovo seed → elimina. Console senza errori.

### 10.4 Verifica reale

A fine di ogni fase con ComfyUI attivo: esecuzione vera di ogni compito toccato, con tempo e immagine osservati, riportata nel report di fase. I test verdi in modalità fake non sostituiscono questa verifica.

---

## 11. Interfaccia utente

### 11.1 Direzione

Strumento di lavoro personale, usato a lungo con l'immagine al centro. Il layout lascia spazio all'immagine, i controlli stanno da parte e si leggono in fretta.

```
DIAL: strumento creativo personale per un utente non tecnico, linguaggio da tool di lavoro - ENERGY 1 / RHYTHM 1 / MOTION 1
```

- Font Inter. Tema scuro di default (l'immagine si giudica meglio su fondo scuro) e tema chiaro selezionabile. Colori in OKLCH, superfici con chroma minima, mai `#000`/`#fff` puri.
- Desktop-first nell'uso reale, ma il layout regge a 375 px (§ 10.3).
- Tutti i testi in italiano, scritti per chi non conosce i termini tecnici: "Passi di generazione" con spiegazione in tooltip, non "steps"; "Aderenza al prompt", non "CFG".
- Usare la skill `hallmark` (o `ui-designer`) per il sistema visivo e `a11y-gate` prima di consegnare.

### 11.2 Pagine

**Crea** (pagina iniziale)
- A sinistra (in alto su mobile): selettore del compito a schede con etichetta, descrizione di una riga, modello usato in piccolo, icona "pronto subito" se il modello è in memoria, stato disattivato con motivo.
- Guida al prompt (§ 3.3), casella prompt, prompt negativo in "Opzioni avanzate".
- Proporzioni, numero di immagini, stili (solo SDXL), seed (campo + "casuale" + lucchetto per fissarlo).
- "Opzioni avanzate" chiuse di default: passi, aderenza, negativo.
- Bottone "Genera" con stato di attesa e "Annulla" durante il job.
- A destra: area risultato con avanzamento (barra con passo N di M, anteprima se disponibile, messaggio di cambio modello con tempo stimato), poi griglia dei risultati con azioni: scarica, preferito, modifica, variazione, ingrandisci, rigenera.

**Modifica** (inpaint e outpaint)
- Input: trascina un file, oppure "usa come input" dalla galleria o da Crea.
- Editor maschera su canvas sopra l'immagine: pennello con dimensione regolabile, gomma, "inverti", "cancella tutto", annulla/ripeti (almeno 20 passi), zoom adatta/100%. Zona mascherata in sovrapposizione semitrasparente. Esportazione: PNG della stessa risoluzione dell'immagine, bianco = da rigenerare.
- Modalità "Allarga": 4 interruttori (sopra, sotto, sinistra, destra) con anteprima del nuovo riquadro.
- Prompt con guida della lingua del compito.

**Migliora**: input come sopra; azioni "Variazione leggera", "Variazione forte", "Ingrandisci ×2 / ×4", con risultato affiancato all'originale e cursore di confronto prima/dopo.

**Galleria**: griglia di miniature, filtri per compito e preferiti, ricerca nel prompt, paginazione a scorrimento. Il dettaglio mostra l'immagine grande, prompt originale e finale, parametri, seed, modello, durata, catena padre → figli, azioni.

**Impostazioni**: stato del motore, VRAM, disco libero (in rosso sotto `MIN_FREE_DISK_GB`), modello in memoria, elenco modelli con stato installato/mancante/riusato e spazio richiesto (l'installazione resta dallo script da terminale, la pagina mostra il comando esatto), "Svuota cartella output del motore", tema.

### 11.3 Stati obbligatori

Ogni superficie dati ha Loading, Empty, Error, Populated, Edge (`ui-ux.md` dell'utente). Casi specifici:

- Motore spento: banner persistente in testa con il comando per avviarlo; "Genera" disattivato con il motivo.
- Galleria vuota (primo uso): spiegazione e bottone verso Crea.
- Errore di generazione: messaggio in italiano dalla tabella § 7.5, **prompt e parametri preservati**, bottone "Riprova".
- Job oltre 60 s senza progresso: "Ci sta mettendo più del previsto" con possibilità di annullare.
- Edge: prompt di 2000 caratteri, galleria con 5.000 elementi, immagine di input 4096×4096, upload non immagine.

---

## 12. Piano di sviluppo

Ogni fase lascia il sistema usabile anche se la successiva non arriva. Ogni passo ha il suo check osservabile. Fine di ogni fase: test verdi, verifica reale (§ 10.4), aggiornamento di `docs/REPORT_ATTIVITA.md`, commit.

### Fase 0: motore e scelta del modello nuovo

1. `engine/install_engine.sh` → verify: `curl -s 127.0.0.1:8188/system_stats` restituisce la RTX 4060 e circa 8 GB.
2. `extra_model_paths.yaml` verso Fooocus → verify: in `/object_info` il nodo `CheckpointLoaderSimple` elenca `juggernautXL_v8Rundiffusion.safetensors`.
3. Installare `comfyui-inpaint-nodes` e la Lightning LoRA → verify: i nodi del pacchetto compaiono in `/object_info`.
4. Scaricare il candidato A (FLUX.2 klein) con `install_models.py` → verify: `--list` lo dà installato e lo spazio libero resta sopra 5 GB.
5. `uv run --script scripts/benchmark.py`: misura anche il determinismo di ogni famiglia (§ 13), su 8 prompt fissi (ritratto, paesaggio, prodotto, scritta "APERTO TUTTI I GIORNI" su un'insegna, scena con 3 oggetti e relazioni spaziali, illustrazione, 2 prompt in italiano), su `bozza`, `qualita` e candidato A, seed fisso. Misura il tempo per immagine, il picco di VRAM (da `/system_stats` o `nvidia-smi`), il tempo di cambio modello SDXL ↔ A con e senza `/free`, e se il cambio va in OOM. Provoca un OOM (formato massimo, batch 4) e salva il testo di `execution_error`.
6. Se l'utente lo chiede: rimuovere A, installare B (Z-Image), ripetere il punto 5.
7. Scrivere `docs/benchmark.md` con tabelle, griglia delle immagini e raccomandazione → **fermarsi e chiedere all'utente** quale candidato tenere e se la lingua italiana è accettabile per il compito. Aggiornare `tasks.yaml` (lingua, sampler) con i valori misurati.

### Fase 1: backend, testo → immagine

1. Scheletro FastAPI, `config.py`, errori, `/health`, `/system` → verify: `curl /api/v1/health` con motore acceso e spento dà i due stati.
2. `tasks.yaml` + validazione + `/tasks` → verify: un campo sbagliato nel YAML ferma l'avvio con un messaggio che nomina il campo.
3. Client ComfyUI + cattura delle fixture WebSocket reali + parser → verify: test del parser verdi sulle fixture.
4. `workflow_builder` + template `sdxl_lightning_txt2img`, `sdxl_txt2img`, template del modello scelto in Fase 0 + test di contratto → verify: `pytest -m engine` verde.
5. Job, SSE, salvataggio, `generations`, stili, rilevatore di lingua, modalità fake → verify: `curl -X POST /api/v1/jobs` seguito da `curl -N /api/v1/jobs/<id>/events` mostra `progress` e `completed`, e il PNG esiste in `data/images`.

### Fase 2: frontend, Crea e Galleria

1. Scaffold Vite + client API tipizzato + layout + tema → verify: la pagina carica senza errori in console.
2. Pagina Crea completa → verify: click-through di ogni controllo in modalità fake, poi una generazione reale per compito.
3. Galleria e dettaglio, rigenera, preferiti, elimina → verify: E2E Playwright in modalità fake verde.
4. Impostazioni e banner del motore → verify: con ComfyUI spento il banner compare e "Genera" è disattivato.

### Fase 3: Modifica (inpaint e outpaint)

1. Template `sdxl_inpaint` e `sdxl_outpaint` costruiti e provati in ComfyUI, poi esportati → verify: `pytest -m engine` verde e immagine reale corretta.
2. Upload, editor maschera, pagina Modifica → verify: test dell'editor verdi; una modifica reale cambia solo la zona mascherata, con il bordo raccordato.

### Fase 4: Migliora (variazioni e upscale)

1. Template `sdxl_img2img` e `upscale`, compiti relativi → verify: un'immagine 1152×896 ingrandita ×2 diventa 2304×1792; una variazione forte cambia composizione, una leggera no.
2. Pagina Migliora con confronto prima/dopo → verify: click-through.

### Fase 5: rifinitura e consegna

1. `scripts/start.sh` (motore + backend con frontend buildato, uscita pulita con Ctrl+C che ferma entrambi) → verify: un solo comando apre l'app funzionante su `127.0.0.1:8000`.
2. README per l'utente: requisiti, installazione, avvio, come aggiungere un modello, risoluzione problemi (motore spento, OOM, disco pieno).
3. Gate finali: `code-reviewer`, `security-reviewer`, `a11y-gate` + render a 375 e 1280 px, verifica reale di tutti i compiti.

---

## 13. Definition of Done della v1

- `scripts/start.sh` avvia tutto; l'app risponde su `127.0.0.1:8000` con interfaccia interamente in italiano.
- Ogni compito disponibile produce un'immagine reale sulla RTX 4060 senza OOM ai parametri di default; i tempi sono in `docs/benchmark.md`.
- Ogni compito mostra la lingua in cui scrivere il prompt, con motivo ed esempi; l'avviso di lingua compare su un prompt italiano in un compito inglese e non compare su un prompt inglese.
- Inpaint modifica solo la zona mascherata; outpaint estende i lati scelti del 30%; variazioni e upscale funzionano su immagini caricate e da galleria.
- Ogni immagine generata compare in galleria con prompt, parametri e seed, e "Rigenera" con lo stesso seed riproduce un'immagine identica a parità di modello e impostazioni. Il determinismo si misura in Fase 0 per ogni famiglia (stesso seed due volte, confronto pixel per pixel). Per una famiglia che risulta non deterministica il criterio diventa "immagine visivamente equivalente": lo si registra in `docs/benchmark.md` e la UI non promette la riproduzione identica.
- Motore spento, OOM e disco pieno producono messaggi comprensibili e non perdono il prompt.
- Nessun file di Fooocus copiato o modificato; lo spazio aggiunto su disco è documentato.
- Test backend e frontend verdi, copertura ≥ 80% su `services` ed `engine`, E2E verde, contratto dei template verde.

---

## 14. Assunzioni e punti aperti

### Assunzioni

- AS1. L'app gira solo in locale per un utente: niente autenticazione.
- AS2. Il clone di Fooocus resta dov'è: se si sposta, basta cambiare `FOOOCUS_DIR`.
- AS3. L'utente installa i modelli da terminale con lo script; la UI informa, non scarica.
- AS4. Juggernaut XL v8 resta il checkpoint SDXL unico della v1; sostituirlo è una modifica di `models.yaml`.
- AS5. Le immagini generate sono per uso personale; le licenze vanno ricontrollate prima di ogni uso commerciale (Juggernaut e patch Fooocus non verificate).

### Punti aperti, con la fase che li chiude

| ID | Punto | Fase |
|---|---|---|
| Q1 | FLUX.2 klein o Z-Image come modello nuovo | 0, decisione dell'utente sul benchmark |
| Q2 | Qualità dei prompt in italiano su FLUX.2 klein / Z-Image | 0 |
| Q3 | Text encoder fp4 su GPU Ada (RTX 40): funziona, e a che velocità rispetto a fp8? Se non funziona, serve un encoder fp8, e il budget disco cambia | 0 |
| Q4 | Sampler raccomandato per Z-Image Turbo e file fp8 da usare | 0, solo se si prova B |
| Q5 | Schema dei messaggi WebSocket e dei frame di anteprima | 1 |
| Q6 | Testo di `execution_error` in caso di OOM | 0 |
| Q7 | ~~Nomi delle classi di nodo di `comfyui-inpaint-nodes`~~ chiuso: `INPAINT_LoadFooocusInpaint`, `INPAINT_ApplyFooocusInpaint`, `INPAINT_VAEEncodeInpaintConditioning`, `INPAINT_ExpandMask`, `INPAINT_MaskedFill` | 0 |
| Q8 | Batch nativo su FLUX.2 klein entro 8 GB | 0 |
| Q9 | ~~Peso reale dell'ambiente ComfyUI + PyTorch su disco~~ chiuso: circa 7 GB misurati | 0 |

---

## 15. Fonti

- ComfyUI, server routes: https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI, workflow in API format: https://docs.comfy.org/development/api-development/workflow-api-format
- ComfyUI, flag di avvio: https://docs.comfy.org/development/comfyui-server/startup-flags
- ComfyUI, installazione manuale: https://docs.comfy.org/installation/manual_install
- ComfyUI, release v0.38.0: https://github.com/comfy-org/ComfyUI/releases
- FLUX.2 [klein] in ComfyUI: https://docs.comfy.org/tutorials/flux/flux-2-klein
- FLUX.2 [klein] 4B fp8: https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8
- Text encoder e VAE per klein 4B: https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b
- Z-Image Turbo: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo e https://huggingface.co/Comfy-Org/z_image_turbo
- SDXL-Lightning: https://huggingface.co/ByteDance/SDXL-Lightning
- comfyui-inpaint-nodes: https://github.com/Acly/comfyui-inpaint-nodes
- Fooocus inpaint: https://huggingface.co/lllyasviel/fooocus_inpaint
- 4x-UltraSharp: https://huggingface.co/Kim2091/UltraSharp
- ComfyUI e autenticazione: https://github.com/Comfy-Org/ComfyUI/issues/15822
- Fooocus, parametri di riferimento: `modules/flags.py:101` (proporzioni), `modules/flags.py:140` (passi per modalità), `modules/async_worker.py:449` (denoise delle variazioni), `modules/async_worker.py:545` (outpaint 30%), `presets/default.json` (default SDXL)
