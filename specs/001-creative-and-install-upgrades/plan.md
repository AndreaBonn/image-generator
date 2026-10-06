# Piano 001: installazione autonoma, download dall'app e nuove funzioni creative

Versione 1.0 del 2026-10-06. Fonte autoritativa del prodotto: `SPEC.md` (v1.0 + v1.1). Questo piano
la estende con sette proposte, identificate dai codici fissi O1, O2, O3, O5, O6, O9, O10. La
scomposizione eseguibile è in `tasks.md`, nella stessa cartella.

Nota sui codici: in `SPEC.md` § 6.4 la sigla "O1" indica già la migrazione da Fooocus. Per evitare
la collisione, l'aggiornamento della SPEC (task T001) rinomina quella sezione in "Migrazione da
Fooocus (scorciatoia opzionale)" e registra le sette proposte come FN15-FN21 (v1.2), con il codice O
fra parentesi. Nel resto di questo piano O1 indica sempre la proposta nuova.

---

## Obiettivo

A fine lavoro l'app si installa da zero con un solo comando senza il clone di Fooocus, scarica i
modelli mancanti dalle Impostazioni con avanzamento e controllo del disco, crea immagini da più
riferimenti (coerenza del personaggio) e da uno schizzo o da una posa, mostra le anteprime degli
stili SDXL, accoglie il primo avvio con esempi generati sulla macchina dell'utente, e ha script di
avvio e installazione in Python pensati per Linux, Windows e macOS (verificati solo su Linux).

---

## Definition of Done

Ogni voce ha un esempio Given/When/Then con valori. Le voci O3 dichiarano cosa resta non verificato.

### O1 - Installer unico senza Fooocus (FN15)

- [ ] `config/models.yaml` non contiene più voci `source: local`: Juggernaut, offset LoRA, inpaint head e
  patch hanno `source: huggingface`, `repo`, `repo_path` e lo stesso `sha256` di oggi.
  *Given* il registro convertito, *when* `install_models.py --list`, *then* i 4 file risultano
  `installed` (sono già sul disco) e non compare il messaggio "Modello locale mancante".
- [ ] `uv run --script scripts/install.py` (nuovo) esegue in ordine motore, dipendenze backend e
  frontend, stili, modelli del profilo scelto, e prima di scaricare stampa il conto del disco
  complessivo. *Given* 16 GB liberi e tutti i modelli presenti, *when* `install.py --dry-run`,
  *then* stampa "Niente da scaricare" ed esce 0 senza toccare file.
  *Given* `MODELS_DIR` vuoto in una tmpdir e 9 GB liberi simulati, *when* `install.py --dry-run
  --profile base`, *then* rifiuta con il conto (8,9 GB richiesti + 5 GB di margine > 9 GB).
- [ ] Gli stili SDXL si scaricano da una fonte pinnata con sha256, senza il clone Fooocus.
  *Given* `data/styles` vuota in una tmpdir, *when* `install.py --only styles`, *then* compaiono
  6 file JSON con 277 stili totali e hash identici a quelli dichiarati.
- [ ] `migrate_from_fooocus.py` funziona ancora come scorciatoia: seleziona i modelli col campo
  `fooocus_migratable: true` invece di `source: local`. Test esistenti verdi, adattati.
- [ ] `--remove juggernaut_xl_v8` chiede conferma come ogni modello Hugging Face (nessuna
  cancellazione senza risposta "y").

### O2 - Download dei modelli dalle Impostazioni (FN16)

- [ ] *Given* `ultrasharp_4x` mancante e spazio sufficiente, *when* l'utente preme "Scarica" in
  Impostazioni, *then* vede una barra con byte scaricati / totali che avanza, poi "Verifica in
  corso", poi lo stato "Installato"; il compito `upscale` passa da disattivato ad attivo senza
  riavviare il backend.
- [ ] *Given* spazio libero minore di dimensione + `MIN_FREE_DISK_GB`, *when* l'utente preme
  "Scarica", *then* il bottone è disattivato con il conto in italiano ("Servono 6,2 GB più 5 GB di
  margine, liberi 9,1 GB") e il backend, se chiamato comunque, risponde `507 DISK_FULL` senza
  scaricare un byte.
- [ ] *Given* uno sha256 diverso dal registro, *then* il file parziale viene eliminato dalla sola
  cartella di staging dell'app, l'evento è `failed{code: "CHECKSUM_MISMATCH"}` e la destinazione non
  esiste.
- [ ] *Given* un download in corso, *when* "Annulla", *then* evento `cancelled`, file parziale
  rimosso dallo staging, nessun file in destinazione.
- [ ] Un secondo download mentre il primo è attivo risponde `409 DOWNLOAD_IN_PROGRESS`.
- [ ] Rete giù o Hugging Face che risponde 5xx: evento `failed{code: "DOWNLOAD_FAILED"}` con
  messaggio in italiano, staging pulito, la pagina resta usabile.
- [ ] L'app non cancella mai modelli: nessun endpoint di rimozione (resta il CLI con conferma).

### O5 - Più immagini di riferimento con FLUX.2 klein (FN17)

- [ ] Nuovo compito `crea_da_riferimenti` ("Crea dai riferimenti", gruppo `crea`): da 1 a N
  riferimenti (N misurato, massimo 3), prompt obbligatorio, proporzioni a scelta.
  *Given* 2 foto della stessa persona caricate, *when* prompt "la persona delle immagini seduta in
  un bar a Parigi, luce del mattino", formato 4:3, *then* il job completa senza OOM e produce
  un'immagine 1152×864 circa (multipli di 16) in galleria.
- [ ] *Given* 0 riferimenti, *then* `422` con `details[0].field == "references"`; con N+1
  riferimenti, stesso errore con il massimo nel messaggio.
- [ ] Ogni riferimento può venire da un upload o dalla galleria (`{upload_id}` o
  `{generation_id}`, esattamente uno dei due).
- [ ] Gli upload usati come riferimento non vengono eliminati dalla pulizia dei 7 giorni (oggi
  la pulizia guarda solo `input_upload_id` e `mask_upload_id`).
- [ ] "Rigenera" su una generazione da riferimenti rilancia con gli stessi riferimenti e, con lo
  stesso seed, produce un'immagine identica (determinismo FLUX già misurato in Fase 0) o
  visivamente equivalente se la misura dice altro.
- [ ] Tempo e picco VRAM con 1, 2 e 3 riferimenti misurati e scritti in `docs/benchmark.md`.

### O6 - Schizzo → immagine e controllo della posa (FN18)

Il contenuto dipende dalla **decisione ADR-1** (sotto). Con l'opzione raccomandata (B, riferimento
FLUX):

- [ ] Compito `da_schizzo` ("Dallo schizzo"): uno schizzo (upload o disegnato su una tela) più
  prompt. *Given* lo schizzo di una casa con albero a sinistra, *when* prompt "watercolor cottage,
  spring", *then* l'immagine conserva la disposizione (casa al centro, albero a sinistra).
- [ ] Compito `in_posa` ("Personaggio in posa"): immagine della posa + immagine del personaggio.
- [ ] Gate di qualità misurato: su 5 schizzi e 3 pose fissi (in `docs/benchmark/o6/`), l'utente
  giudica accettabili almeno 4 schizzi su 5 e 2 pose su 3; il verdetto è scritto in
  `docs/benchmark.md`. Sotto soglia, si apre l'opzione A (ControlNet) come fase separata e il
  compito resta disponibile marcato "sperimentale" in UI.
- [ ] Spazio disco aggiunto: 0 GB.

### O9 - Anteprime visive degli stili SDXL (FN19)

- [ ] `uv run --project backend python -m app.cli.assets styles` genera una miniatura WEBP per
  ciascuno dei 277 stili con `bozza`, prompt e seed fissi, in `DATA_DIR/style_previews/`;
  è riprendibile (salta le miniature esistenti) e si può interrompere con Ctrl+C.
  *Given* 3 miniature già presenti, *when* rilancio, *then* ne genera 274.
- [ ] `GET /api/v1/styles` restituisce `preview_url` (o `null`) per ogni stile;
  `GET /api/v1/styles/{id}/preview` serve il file, `404` se assente o fuori da `DATA_DIR`.
- [ ] `StyleSelector` mostra la miniatura accanto al nome; senza miniatura mostra un riquadro neutro
  con il nome, mai un'immagine inventata.
- [ ] Spazio occupato misurato dopo la generazione e scritto nel report (stima 6-11 MB).

### O10 - Primo avvio con esempi e "prova questo" (FN20)

- [ ] `python -m app.cli.assets examples` genera, sulla macchina dell'utente, 2 immagini per ogni
  compito di generazione disponibile (dai `prompt_examples` di `tasks.yaml`, seed fissi) in
  `DATA_DIR/examples/` con un `manifest.json` (task_id, prompt, seed, aspect_ratio, file).
- [ ] *Given* galleria vuota ed esempi presenti, *when* l'utente apre l'app, *then* Crea mostra la
  sezione "Esempi" con le immagini; "Prova questo" compila compito, prompt, seed e formato senza
  avviare il job.
- [ ] *Given* galleria vuota ed esempi assenti, *then* la sezione mostra solo i prompt testuali con
  "Prova questo" e la riga "Genera gli esempi dalle Impostazioni" (nessuna immagine finta).
- [ ] *Given* almeno una generazione in galleria, *then* la sezione non compare più in apertura
  ma resta raggiungibile da un link "Esempi".
- [ ] Gli esempi non entrano in galleria né nel cestino.

### O3 - Windows e macOS negli script di avvio e installazione (FN21)

- [ ] `scripts/start.py`, `scripts/stop.py`, `engine/install_engine.py` sostituiscono la logica dei
  rispettivi `.sh`; i `.sh` restano come wrapper di una riga (`exec uv run --script ...`), così
  l'uso su Linux non cambia.
- [ ] La logica per sistema operativo è in funzioni pure (`scripts/platform_support.py`) testate
  con casi parametrizzati `linux`, `windows`, `darwin`: path del Python del venv, indice di
  PyTorch, modo di fermare un processo, comando di attesa, file di avvio rapido.
- [ ] Su Linux, misurato: `./scripts/start.sh` avvia motore e backend e risponde su
  `127.0.0.1:8000`; Ctrl+C li ferma entrambi; `install_engine.sh` rieseguito sul motore esistente
  termina 0 senza scaricare PyTorch di nuovo.
- [ ] **Non verificabile su questa macchina**: l'esecuzione reale su Windows e macOS. Il README lo
  dichiara ("supporto non provato su Windows e macOS") e su macOS dichiara che i modelli fp8
  (FLUX.2 klein) potrebbero non girare su MPS.

### Trasversali

- [ ] `SPEC.md` aggiornata a fine di ogni fase (sezioni elencate in "File da modificare").
- [ ] Copertura ≥ 80% su `services` ed `engine`; `ruff`, `mypy --strict`, `pytest`, `npm test`
  verdi a fine di ogni fase; nessun file nuovo oltre 300 righe, nessuna funzione oltre 30.
- [ ] Verifica reale con ComfyUI attivo per ogni compito toccato (§ 10.4), con tempo osservato.
- [ ] Mai cancellare modelli o cache senza chiedere; il codice rimuove solo i propri file
  temporanei nella cartella di staging `MODELS_DIR/.downloads`.

---

## Assunzioni

- AS-P1. Pubblico: solo l'utente, Linux, RTX 4060 Laptop 8 GB. Niente auth, LAN, multi-utente.
  Restano valide le difese esistenti (origin guard sulle POST, bind su 127.0.0.1).
- AS-P2. Disco: 16 GB liberi misurati dall'utente oggi (`df` in questa sessione: 17 GB, 96%).
  Utilizzabili circa 11 GB rispettando `MIN_FREE_DISK_GB=5`.
- AS-P3. **Confermata dall'utente (2026-10-06): profilo predefinito = `completo`** (tutti i
  modelli `enabled`: SDXL + Lightning + UltraSharp + FLUX.2 klein + Z-Image + BiRefNet, circa 24 GB
  di modelli più 7 GB di motore); `--profile base` resta disponibile (8,9 GB). Cambia il
  comportamento di un'installazione nuova, non questa macchina.
- AS-P4. **Confermata dall'utente (2026-10-06): scaricati da GitHub.** O1 stili: la fonte senza Fooocus è il file
  `sdxl_styles/*.json` del repository GitHub di Fooocus a un commit fissato, scaricato con verifica
  sha256. Fooocus è GPL-3.0 e i file stile hanno origini diverse (twri, sai, mre, ...): la licenza
  va annotata (come AS5).
- AS-P5. O2 rovescia AS3 della SPEC ("la UI informa, non scarica"): la SPEC va aggiornata. La
  rimozione dei modelli resta solo da CLI con conferma: la UI scarica, non cancella.
- AS-P6. O2: i repository Hugging Face del registro sono pubblici, nessun token. Se uno richiede
  token, `HF_TOKEN` va in `.env` (escluso da git) e in `.env.example` vuoto (SPEC § 9).
- AS-P7. (Confermata dall'utente) O5: i riferimenti multipli si salvano nel JSON `jobs.request` e in `generations.params`;
  `generations.parent_id` resta singolo e punta al primo riferimento venuto dalla galleria.
  Nessuna migrazione dello schema. La catena padre → figli in galleria mostra quindi un solo padre.
- AS-P8. O5: il numero massimo di riferimenti è quello che la misura (T034) dimostra stare in 8 GB
  senza OOM a 1 MP; il tetto è 3 anche se la misura ne permette di più.
- AS-P9. (Confermata dall'utente) O9: le miniature si generano con `bozza` (Lightning, circa 4 s a regime, misurato), non
  con `qualita` (30 s): 277 × 4 s ≈ 18-20 minuti di GPU contro 2,5 ore. Le anteprime sono quindi
  indicative dello stile, non identiche al risultato di `qualita`. Prompt fisso unico per tutti
  gli stili (es. "a woman sitting by a window with a cup of tea").
- AS-P10. O9 e O10 condividono un'unica CLI di backend (`app.cli.assets`) che riusa
  `workflow_builder` e il client ComfyUI direttamente, fuori da jobs e generations: così gli asset
  non sporcano galleria, cestino e storico. Richiede il motore acceso, non il backend.
- AS-P11. O10: "primo avvio" = galleria senza generazioni (cestino incluso), non un flag salvato.
- AS-P12. O3: Windows e macOS non sono verificabili qui. Non è prevista CI su GitHub (il repo non
  ha `.github/`, la pubblicazione non è in programma, e un push richiede autorizzazione). Il
  launcher desktop (`install_launcher.sh`, file `.desktop`) resta solo Linux; su Windows e macOS
  il README spiega l'avvio da terminale.
- AS-P13. Workflow su `main` con commit atomici (scelta dell'utente), codice e commit in inglese,
  stringhe UI in italiano.

---

## Disambiguazione

### D1. Forma di O5 (architetturale)

- Opzione A: estendere `modifica_libera` con riferimenti aggiuntivi (l'immagine 1 è la base da
  modificare, le altre portano elementi) → l'output eredita le dimensioni della base; utile per
  "metti questo oggetto in questa foto", debole per "stesso personaggio in una scena nuova".
- Opzione B: compito nuovo `crea_da_riferimenti` nel gruppo Crea, latente vuoto alle proporzioni
  scelte, 1-N riferimenti → copre la coerenza del personaggio, che è la richiesta.
- Raccomandata: **B**. A diventa banale dopo B (stessa catena di `ReferenceLatent`) e resta fuori
  da questo piano salvo richiesta.

### D2. Come il grafo gestisce un numero variabile di riferimenti (implementativa, scelta)

Un template per conteggio (`flux2_klein_refs_1.json`, `_2`, `_3`), costruito e provato in ComfyUI
come gli altri, e un campo `workflow_by_reference_count` in `tasks.yaml` validato all'avvio. Scartata
la generazione programmatica dei nodi nel builder: rompe la regola "template esportato e provato"
(§ 5.2) e sposta la correttezza del grafo dal test di contratto al codice.

### ADR-1 (decisione ADR, la sintetizza l'orchestratore). O6: ControlNet o riferimento FLUX

- Opzione A: ControlNet union SDXL promax (2,51 GB) + rilevatore di posa (body 209 MB + hand 147 MB)
  + custom node `comfyui_controlnet_aux` pinnato → controllo preciso di contorni e scheletro della
  posa; 2,87 GB di modelli più dipendenze Python del nodo (stima 0,3-1 GB, non misurata), una
  famiglia di modello in più da caricare insieme a SDXL su 8 GB (picco VRAM da misurare, rischio
  OOM), un custom node in più da mantenere col pin di ComfyUI.
- Opzione B: schizzo e posa passati come riferimenti a FLUX.2 klein, riusando la catena di O5 →
  0 GB, nessun nodo nuovo, segue prompt in italiano; controllo meno preciso (il modello interpreta
  lo schizzo, non lo ricalca), da misurare col gate di qualità della DoD.
- **Consigliata: B**, con il gate di qualità come uscita verso A. Motivo: costo disco nullo su
  11 GB utilizzabili, riuso diretto di O5, nessun rischio di VRAM nuovo. Se il gate fallisce, A
  diventa una fase a sé (task T0A1-T0A7 in `tasks.md`, condizionati).

### ADR-2 (decisione ADR, la sintetizza l'orchestratore). O2: dove vive il download

- Opzione A: servizio nel backend con download in streaming `httpx` dall'URL `resolve` di Hugging
  Face, hash calcolato durante lo scrivere, un download alla volta come task asyncio, eventi SSE
  sul modello di `job_events.py`.
- Opzione B: il backend lancia `scripts/install_models.py` come sottoprocesso e legge lo stdout per
  il progresso.
- Opzione C: servizio nel backend con `huggingface_hub.hf_hub_download` e una callback di progresso.
- **Consigliata: A**. `httpx` è già dipendenza e `respx` già nei test, quindi progresso, annullo,
  errori di rete e checksum si testano senza rete; il progresso è esatto (byte scritti) e l'annullo
  è chiudere lo stream. B crea un contratto runtime sullo stdout che nessun test vede; C aggiunge
  una dipendenza pesante e un progresso basato su tqdm difficile da intercettare. Rischio di A: i
  repository su storage Xet rispondono con redirect verso un CDN; la prima mossa (T020) misura il
  download reale di un file piccolo (`ultrasharp_4x`, 67 MB) prima di costruire il resto. Le
  funzioni pure già testate (`has_room`, confronto sha256) si estraggono in un modulo del backend;
  lo script CLI resta indipendente (PEP 723) e accetta la duplicazione di circa 20 righe.


### Decisioni prese dall'orchestratore (dopo architect, senior-backend, security-reviewer)

- **ADR-1 = B con uscita verso A ridotta.** Prima uno spike a costo zero con FLUX.2 klein e criteri
  fissati prima (schizzi: almeno 4 su 5 accettati dall'utente; pose: almeno 2 su 3). Se fallisce,
  l'uscita non è l'opzione A piena ma ControlNet union promax con i **soli nodi core**
  (`ControlNetLoader`, `SetUnionControlNetType`, da verificare in `/object_info` della v0.38.2):
  il canvas produce già la mappa scribble, quindi niente `comfyui_controlnet_aux`, che scarica gli
  annotatori in modo lazy fuori da `MODELS_DIR` (architect). La posa estratta da una foto resta a
  un ADR separato. Il disco nel caso peggiore scende a 2,51 GB.
- **ADR-2 = A (httpx nel backend).** Confermata da senior-backend: `httpx` è già dipendenza,
  `respx` già nei test, `scripts/` non è runtime del backend. Due idee dell'architect entrano in A:
  lock su file per id condiviso con la CLI (T026) e "nessuna ripresa dopo il riavvio" scritto in
  SPEC come scelta (T021). L'architect preferiva il sottoprocesso con `--events-json`: scartato
  perché lega Impostazioni alla presenza di `uv` a runtime e crea un contratto su stdout.
- **Rilievi di sicurezza integrati** (nessun P0): destinazione solo dal registro e test con id
  path-like (T024, T028), redirect limitati e solo https (T024), path traversal sugli esempi
  (T083). Note di hardening non trasformate in task: binari risolti con `shutil.which` in O3.
- **Rilievo database integrato**: T047 testa due job con riferimenti diversi.

---

## Approccio

Ordine delle fasi, motivato per valore e rischio. Rispetto al suggerimento (O1 → O2 → O5 → O9 →
O10 → O6 → O3) sposto **O6 subito dopo O5**:

1. **Fase 1, O1** - toglie la dipendenza da Fooocus: prerequisito di ogni installazione futura,
   basso rischio (dati già misurati), crea `scripts/install.py` in Python che O3 completerà.
2. **Fase 2, O2** - il download dall'app riusa il registro convertito in O1 ed è la base per
   installare in futuro i modelli opzionali (Z-Image, ControlNet se ADR-1 = A).
3. **Fase 3, O5** - il valore creativo più alto, zero disco; tocca il dominio dei job, quindi va
   fatto prima delle fasi che lo riusano.
4. **Fase 4, O6** - con ADR-1 = B è due compiti preimpostati sopra la catena di O5: farlo subito
   costa meno perché il codice dei riferimenti è fresco. Con ADR-1 = A la fase scende in fondo,
   dopo O10, perché richiede disco e un custom node.
5. **Fase 5, O9** - costruisce la CLI `app.cli.assets` (generazione fuori da jobs e galleria).
6. **Fase 6, O10** - riusa la CLI di O9; va dopo O5 e O6 perché gli esempi coprono anche i compiti
   nuovi.
7. **Fase 7, O3** - il rischio più alto e l'unico non verificabile: per ultimo, così non blocca
   niente. Porta in Python il resto degli script, sopra `install.py` di O1.

Ogni fase è mergiabile da sola: dopo la fase N l'app funziona anche se N+1 non arriva. Nessuna fase
serve solo a rendere utile la successiva (O9 usa la CLI da sola; O10 la riusa).

Pattern da rispettare (dal codice): route sottili in `api/v1`, logica in `services`, I/O in
`repositories` ed `engine`; i nodi dei workflow si legano per `@titolo`; errori come `AppError`
con codice e messaggio italiano; test con `ENGINE_MODE=fake` e `respx`; nessun `shell=True`.

---

## Fasi, sub-task e stima

Stime per sviluppatore che conosce il repo (84 commit, test e pattern consolidati), testing incluso
nei sub-task (TDD). Buffer imprevisti +20% esplicito per fase; +30% su O3 (non verificabile) e
sulla misura di VRAM di O5. Dettaglio per sub-task in `tasks.md`.

| Fase | Proposta | Task | Stima base | Con buffer |
|---|---|---|---|---|
| 1 | O1 installer unico | 11 (T001-T011) | 4,5-5,5 h | 5,5-6,5 h |
| 2 | O2 download dall'app | 15 (T020-T034) | 6,5-8 h | 8-9,5 h |
| 3 | O5 riferimenti multipli | 15 (T040-T054) | 6,5-8 h | 8,5-10,5 h |
| 4 | O6 schizzo e posa (ADR-1 = B) | 8 (T060-T067) | 3,5-4,5 h | 4-5,5 h |
| 4-alt | O6 ControlNet (solo se ADR-1 = A o gate B fallito) | 7 (T0A1-T0A7) | 4-5,5 h | 5,5-7 h |
| 5 | O9 anteprime stili | 10 (T070-T079) | 4-5 h | 5-6 h |
| 6 | O10 esempi al primo avvio | 9 (T080-T088) | 3,5-4,5 h | 4-5,5 h |
| 7 | O3 Windows e macOS | 12 (T090-T101) | 5,5-7 h | 7-9 h |
| **Totale** (ADR-1 = B) | | **80** | **34-42,5 h** | **42-52,5 h, circa 5,5-6,5 giorni** |

Il tempo di GPU per generare gli asset (O9 circa 20 minuti, O10 circa 2 minuti) e i download reali
non sono lavoro di sviluppo: si sommano come attesa, non come stima.

### Fase 1 - O1: installer unico senza Fooocus

Converte i 4 modelli a `source: huggingface` (sha256 già confermati identici su HF), aggiunge
`fooocus_migratable: true` perché la migrazione continui a trovarli, scrive `scripts/install.py`
(PEP 723) come orchestratore con logica pura del piano (passi, profilo, conto del disco) separata
dall'esecuzione, e aggiunge il download pinnato degli stili. Il messaggio di catalogo che rimanda
alla migrazione (`task_catalog.py:75`) diventa il comando di installazione.

### Fase 2 - O2: download dall'app

`services/model_downloads.py` (stato del download, un solo attivo, eventi), `repositories/
model_files.py` (staging, stream, hash, rename atomico), route `api/v1/models.py`
(`POST /models/{id}/download` → 202, `GET /models/downloads/current/events` SSE,
`POST /models/downloads/current/cancel`), pulizia dello staging all'avvio, `ModelsTable` con
bottone, barra e messaggio di spazio. Verifica che ComfyUI veda il file nuovo senza riavvio.

### Fase 3 - O5: riferimenti multipli

Misura prima (template a 1, 2, 3 riferimenti in ComfyUI, tempo e VRAM), poi template e
`workflow_by_reference_count`, poi dominio: `JobRequest.references`, risoluzione e preparazione di
N immagini (ognuna a circa 1 MP, lati multipli di 16), upload di N immagini al motore, pulizia degli
upload che riconosce i riferimenti, rerun e ricetta. UI: selettore di riferimenti (upload o
galleria, 1-N miniature rimovibili) nella pagina Crea quando il compito lo richiede.

### Fase 4 - O6: schizzo e posa (ADR-1 = B)

Due compiti in `tasks.yaml` sopra la catena di O5 con un prefisso di prompt per compito; tela di
disegno semplice (riuso del pennello di `MaskEditor`, sfondo bianco, tratto nero) esportata come
upload; gate di qualità misurato con l'utente.

### Fase 5 - O9: anteprime degli stili

CLI `app.cli.assets styles` (riprendibile, idempotente, Ctrl+C pulito), repository delle miniature
dentro `DATA_DIR`, `preview_url` in `/styles`, endpoint del file, miniature in `StyleSelector` con
`loading="lazy"` e dimensioni esplicite.

### Fase 6 - O10: esempi al primo avvio

CLI `app.cli.assets examples` con manifest, endpoint `GET /examples` e immagine, sezione "Esempi"
in Crea con "Prova questo", stato a galleria vuota senza esempi (solo testo), bottone in
Impostazioni che mostra il comando per generarli.

### Fase 7 - O3: Windows e macOS

`platform_support.py` puro e testato per OS, porting in Python di `start`, `stop`,
`install_engine` (con `string.Template` al posto di `envsubst`, `shutil.disk_usage` al posto di
`df`, `subprocess` a liste), wrapper `.sh` e `.cmd`, `install.py` che chiama la versione Python del
motore, README con la sezione "Windows e macOS: non provato".

---

## Budget disco

BASIS: inferred - dimensioni lette dal registro e dalle model card (fornite nella Research); le
miniature sono stime da dimensione tipica di un WEBP, da misurare in T078 e T087.

| Voce | Su questa macchina | Installazione nuova |
|---|---|---|
| O1 modelli SDXL (Juggernaut 7,11 + inpaint 1,32 + offset 0,05 + Lightning 0,39 + UltraSharp 0,07) | 0 GB (già presenti, misurato in `engine/models`) | 8,9 GB (profilo base) |
| O1 stili | 0 (già in `data/styles`) | < 0,1 MB |
| O2 staging | transitorio, pari al file in download (massimo 6,2 GB per Z-Image), già incluso nel controllo `has_room` | idem |
| O5 riferimenti | qualche MB di upload | idem |
| O6 opzione B | 0 GB | 0 GB |
| O6 opzione A | 2,87 GB di modelli + 0,3-1 GB di dipendenze del nodo (non misurato) | idem |
| O9 miniature (277 × 20-40 KB) | 6-11 MB | idem |
| O10 esempi (circa 8 immagini + miniature) | 2-5 MB | idem |
| O3 | 0 | 0 |
| **Totale con ADR-1 = B** | **circa 0,02 GB**: restano circa 16 GB liberi | 8,9 GB + 7 GB motore |
| **Totale con ADR-1 = A** | **circa 3,2-3,9 GB**: restano 12-13 GB, sopra il margine di 5 | |

---

## File da modificare

| File | Tipo | Scopo | Fase |
|---|---|---|---|
| `SPEC.md` | modifica | § 2.1 FN15-FN21, § 2.2 (anteprime stili ora dentro), § 3.1-3.2 compiti nuovi, § 3.5, § 6.1-6.4, § 7.2 endpoint, § 7.3 `references`, § 7.5 codici nuovi, § 11.2 pagine, § 12 fasi v1.2, § 14 AS3 e nuove assunzioni | tutte |
| `config/models.yaml` | modifica | 4 voci a `huggingface`, `fooocus_migratable` | 1 |
| `config/styles.yaml` | nuovo | fonte pinnata degli stili (url, commit, sha256 per file) | 1 |
| `scripts/install.py` | nuovo | orchestratore dell'installazione | 1, 7 |
| `scripts/install_models.py` | modifica | campo `fooocus_migratable` nel `ModelEntry` | 1 |
| `scripts/migrate_from_fooocus.py` | modifica | selezione per `fooocus_migratable` | 1 |
| `scripts/tests/test_install.py`, test esistenti | nuovo / modifica | | 1 |
| `backend/app/repositories/catalog_repository.py` | modifica | campo nuovo nel modello del registro, `workflow_by_reference_count` | 1, 3 |
| `backend/app/services/task_catalog.py`, `system_service.py` | modifica | messaggi e comando di installazione | 1, 2 |
| `backend/app/services/model_downloads.py` | nuovo | stato e orchestrazione del download | 2 |
| `backend/app/repositories/model_files.py` | nuovo | staging, stream, hash, rename atomico | 2 |
| `backend/app/api/v1/models.py`, `main.py`/router | nuovo / modifica | endpoint download e SSE | 2 |
| `backend/app/errors.py` | modifica | `DOWNLOAD_IN_PROGRESS`, `DOWNLOAD_FAILED`, `CHECKSUM_MISMATCH` | 2 |
| `backend/app/lifespan.py` | modifica | pulizia dello staging dell'app all'avvio | 2 |
| `frontend/src/components/settings/ModelsTable.tsx`, nuovo `ModelDownloadButton.tsx`, `api/*` | modifica / nuovo | UI del download | 2 |
| `workflows/flux2_klein_refs_{1,2,3}.json` | nuovo | catene di `ReferenceLatent` | 3 |
| `config/tasks.yaml` | modifica | `crea_da_riferimenti`, `da_schizzo`, `in_posa` | 3, 4 |
| `backend/app/models/job.py`, `task.py`, `image_input.py` | modifica | `references`, schema compito | 3 |
| `backend/app/services/job_inputs.py`, `job_resolution.py`, `image_preparation.py` | modifica | N riferimenti | 3 |
| `backend/app/services/job_references.py` | nuovo | risoluzione dei riferimenti (tiene `job_inputs.py` sotto 300 righe) | 3 |
| `backend/app/repositories/upload_repository.py` | modifica | `expired()` riconosce `references` | 3 |
| `frontend/src/components/create/ReferencePicker.tsx`, `pages/CreatePage.tsx`, `lib/recipeImport.ts` | nuovo / modifica | UI riferimenti | 3 |
| `frontend/src/components/create/SketchPad.tsx` | nuovo | tela per lo schizzo | 4 |
| `backend/app/cli/__init__.py`, `cli/assets.py`, `services/asset_generation.py`, `repositories/asset_repository.py` | nuovo | CLI e logica di O9/O10 | 5, 6 |
| `backend/app/api/v1/styles.py`, `services/style_service.py` | modifica | `preview_url`, endpoint miniatura | 5 |
| `backend/app/api/v1/examples.py` | nuovo | elenco e file degli esempi | 6 |
| `frontend/src/components/create/StyleSelector.tsx`, `ExamplesPanel.tsx` (nuovo) | modifica / nuovo | UI anteprime ed esempi | 5, 6 |
| `scripts/platform_support.py`, `scripts/start.py`, `scripts/stop.py`, `engine/install_engine.py` | nuovo | porting cross-platform | 7 |
| `scripts/start.sh`, `stop.sh`, `engine/install_engine.sh`, nuovi `.cmd` | modifica / nuovo | wrapper | 7 |
| `README.md` | modifica | installazione unica, download dall'app, Windows/macOS non provati (autorizzato dall'utente il 2026-10-06) | 1, 7 |
| `docs/benchmark.md`, `docs/REPORT_ATTIVITA.md` | modifica | misure di O5/O6, report di fase | 3, 4, tutte |

---

## Rischi

Formato causa → rischio → effetto, con mitigazione.

1. Poiché il registro non avrà più voci `source: local`, la migrazione e i messaggi del catalogo che
   le cercano smetterebbero di funzionare in silenzio (`migrate_from_fooocus.py:125`,
   `task_catalog.py:76`) → la scorciatoia di migrazione non migrerebbe nulla → si perde O1 come
   "scorciatoia opzionale". Mitigazione: campo `fooocus_migratable` e test che fallisce se la
   simulazione migra 0 modelli (T003).
2. Poiché Juggernaut diventa un modello Hugging Face, `--remove` lo accetta (oggi lo rifiuta) →
   7,1 GB cancellabili da CLI → solo con conferma esplicita "y", già prevista. Mitigazione: test che
   senza "y" il file resta (T004). Nessun endpoint di rimozione in O2.
3. Poiché i repository HF possono stare su storage Xet con redirect verso CDN, il download in
   streaming di ADR-2 A potrebbe non seguire lo stesso percorso di `hf_hub_download` → download
   rotti a metà fase 2 → 2-4 h. Mitigazione: T020 misura il download reale di un file da 67 MB
   prima di scrivere il servizio; se fallisce, ADR-2 passa a C.
4. Poiché ComfyUI tiene in cache gli elenchi dei file nei model folder, un modello scaricato
   dall'app potrebbe non comparire in `/object_info` fino al riavvio del motore → il compito si
   attiva in UI ma il job fallisce con `ENGINE_REJECTED`. Mitigazione: T032 lo verifica sul motore
   reale; se serve, il backend lo dichiara ("riavvia il motore") invece di attivare il compito.
5. Poiché ogni riferimento aggiunge token latenti a FLUX.2 klein, 2-3 riferimenti a 1 MP possono
   superare 8 GB → OOM o tempi oltre 60 s → O5 ridotto a 2 riferimenti o riferimenti a 0,5 MP.
   Mitigazione: T040-T041 misurano prima di scrivere il dominio; il massimo deriva dalla misura.
6. Poiché `job_inputs.py` (119 righe) e `JobRequest` sono il centro di tutti i compiti con
   immagine, il cambio a N riferimenti può rompere inpaint, outpaint, variazioni e upscale →
   regressioni su FN2-FN5. Mitigazione: `references` è un campo separato, i percorsi esistenti non
   cambiano; la suite intera e i test `engine` girano in T052.
7. Poiché la pulizia degli upload a 7 giorni guarda solo due chiavi del JSON di `jobs.request`,
   gli upload usati come riferimento verrebbero cancellati → "Rigenera" fallisce dopo una settimana.
   Mitigazione: T047 con test di regressione (upload solo in `references` non scade).
8. Poiché O6-B si affida all'interpretazione del modello, lo schizzo potrebbe non essere seguito
   abbastanza → O6 non soddisfa la richiesta. Mitigazione: gate di qualità con l'utente (T066), uscita
   verso ADR-1 A pianificata (T0A1-T0A7).
9. Poiché la CLI degli asset usa il motore mentre l'utente potrebbe generare dall'app, i due
   flussi si alternano in coda su ComfyUI → la generazione dell'utente aspetta fino a 20 minuti
   durante O9. Mitigazione: la CLI stampa il tempo stimato, è interrompibile e riprendibile.
10. Poiché Windows e macOS non sono disponibili, il porting O3 può contenere difetti che nessun
    test locale vede (quoting dei path, segnali, CUDA su Windows, fp8 su MPS) → l'utente che
    pubblicherà su GitHub trova script rotti. Mitigazione: logica pura per OS testata, nessuna
    dichiarazione di supporto nel README ("non provato"), CI con matrice di OS proposta come passo
    successivo solo se l'utente decide di pubblicare.
11. Poiché il porting di `install_engine` tocca un motore funzionante, un errore potrebbe
    reinstallare PyTorch (3-5 GB di download) o rompere il venv → mezza giornata persa. Mitigazione:
    `--dry-run` che stampa il piano, test sulla logica, primo lancio reale in modalità idempotente
    (T099) solo dopo il dry-run.
12. Poiché il file stili di Fooocus è GPL-3.0 con stili di origini diverse, la fonte pinnata di
    O1 porta un obbligo di licenza se il progetto viene pubblicato. Mitigazione: annotazione nella
    SPEC (§ 14, come AS5), decisione dell'utente (AS-P4).

---

## Criteri di successo

- `cd backend && uv run pytest` verde, `uv run pytest --cov=app/services --cov=app/engine` ≥ 80%,
  `uv run ruff check . && uv run mypy app` verdi.
- `uv run --no-project --with pytest --with pyyaml --with huggingface_hub pytest scripts/tests` verde.
- `cd frontend && npm test` e `npm run build` verdi.
- `cd backend && uv run pytest -m engine` verde con ComfyUI attivo (template nuovi inclusi).
- Click-through reale a 375 e 1280 px di: download modello (Impostazioni), Crea dai riferimenti,
  Dallo schizzo, Personaggio in posa, selettore stili con miniature, sezione Esempi e "Prova questo";
  `a11y-gate` sulle pagine Crea e Impostazioni.
- Verifica reale (§ 10.4) di `crea_da_riferimenti`, `da_schizzo`, `in_posa` con tempo osservato,
  scritta in `docs/benchmark.md`.
- `uv run --script scripts/install.py --dry-run` su questa macchina: "Niente da scaricare", exit 0.
- `./scripts/start.sh` (wrapper verso `start.py`) avvia l'app su `127.0.0.1:8000`; Ctrl+C ferma
  motore e backend (`ss -ltn` non mostra più 8000 e 8188).
- `SPEC.md` aggiornata e coerente con il codice (`/analyze` a fine piano).
