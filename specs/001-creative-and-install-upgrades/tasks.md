# Task 001: installazione autonoma, download dall'app e nuove funzioni creative

Scomposizione di `plan.md`. Una riga per sub-task da 10-30 minuti. TDD: in ogni task di codice il
test si scrive prima e si vede rosso. Ogni fase si chiude con suite verde, aggiornamento di
`SPEC.md`, voce in `docs/REPORT_ATTIVITA.md` e commit atomici su `main`.

Legenda: **Dip.** = dipendenze dirette; **R** = rischio (B basso, M medio, A alto);
**NV** = non verificabile su questa macchina.

## Fase 1 - O1: installer unico senza Fooocus

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T001 | O1 | Aggiornare SPEC: rinominare § 6.4 in "Migrazione da Fooocus (scorciatoia opzionale)", aggiungere FN15-FN21 in § 2.1, § 6.1 sorgente HF per i 4 file, § 6.3 profili, AS3 riscritta | - | `SPEC.md` | 20 | B | `grep -n "FN21\|scorciatoia opzionale" SPEC.md` trova entrambe le righe |
| T002 | O1 | Convertire le 4 voci `local` a `huggingface` (repo, repo_path, sha256 invariato) e aggiungere `fooocus_migratable: true` | T001 | `config/models.yaml`, `scripts/install_models.py`, `backend/app/repositories/catalog_repository.py` | 20 | B | `uv run --script scripts/install_models.py --list` mostra i 4 file `installed` e nessuna riga "Modello locale mancante" |
| T003 | O1 | Migrazione: selezionare per `fooocus_migratable`; test che la simulazione su una tmpdir Fooocus finta pianifica 4 modelli, non 0 | T002 | `scripts/migrate_from_fooocus.py`, `scripts/tests/test_migrate_from_fooocus.py` | 25 | M | `uv run --no-project --with pytest --with pyyaml --with huggingface_hub pytest scripts/tests -k migrate` verde, con il test nuovo rosso prima della modifica |
| T004 | O1 | Test: `--remove juggernaut_xl_v8` senza "y" lascia il file; con "y" lo rimuove (in tmpdir); aggiornare `test_local_models.py` ai nuovi messaggi | T002 | `scripts/tests/test_local_models.py`, `test_install_models_operations.py` | 20 | M | `pytest scripts/tests -k "remove or local"` verde |
| T005 | O1 | Catalogo e Impostazioni: il suggerimento per modelli mancanti diventa il comando di installazione; `MIGRATE_COMMAND` resta solo dove la voce è migrabile e il file manca | T002 | `backend/app/services/task_catalog.py`, `system_service.py`, test relativi | 25 | B | `cd backend && uv run pytest tests/api/test_tasks.py tests/api/test_system_maintenance.py` verde |
| T006 | O1 | Fonte pinnata degli stili: `config/styles.yaml` con URL raw GitHub di Fooocus a commit fissato e sha256 dei 6 file (calcolati sui file attuali in `data/styles`) | T001 | `config/styles.yaml` | 20 | M | `sha256sum data/styles/*.json` coincide con i 6 valori nel file |
| T007 | O1 | `scripts/install.py`: funzioni pure `plan_steps(profile, state)` e `disk_budget(missing, free, margin)` con test (profilo base/completo, niente da scaricare, spazio insufficiente col conto) | T002 | `scripts/install.py`, `scripts/tests/test_install.py` | 30 | M | `pytest scripts/tests/test_install.py` verde; il caso 9 GB liberi rifiuta con "8,9 GB" nel messaggio |
| T008 | O1 | `install.py`: passo stili (download con verifica sha256, salta file identici, rifiuta contenuti diversi) testato con respx o server finto | T006, T007 | `scripts/install.py`, `scripts/tests/test_install_styles.py` | 30 | M | test verdi; `install.py --only styles` con `DATA_DIR` in tmpdir crea 6 file e 277 stili (conteggio con uno snippet Python) |
| T009 | O1 | `install.py`: esecuzione dei passi (motore via `install_engine.sh` su Linux, `uv sync` backend, `npm ci && npm run build`, modelli via `install_models.download`) con `--dry-run`, `--profile`, `--only` | T007, T008 | `scripts/install.py` | 30 | M | `uv run --script scripts/install.py --dry-run` su questa macchina stampa "Niente da scaricare" ed esce 0 |
| T010 | O1 | Esecuzione reale idempotente su questa macchina (motore e modelli già presenti) | T009 | - | 15 | M | `uv run --script scripts/install.py` termina 0, `du -sh engine/models` invariato (23 GB), `df` invariato a meno di MB |
| T011 | O1 | README (sezione installazione, previa conferma) e report di fase; commit | T010 | `README.md`, `docs/REPORT_ATTIVITA.md` | 20 | B | `git log -1 --stat` mostra i file della fase; `ruff check scripts` verde |

## Fase 2 - O2: download dei modelli dalle Impostazioni

Prima del T021: **decisione ADR-2** sintetizzata dall'orchestratore (consigliata A, streaming httpx).

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T020 | O2 | Spike misurato: scaricare `ultrasharp_4x` (67 MB) dall'URL `resolve` HF con `httpx` in streaming in una tmpdir, seguendo i redirect, e confrontare lo sha256 | Fase 1 | scratchpad, nessun file di progetto | 15 | A | sha256 calcolato = `36a340b5...bcbc`; se diverso o redirect non seguito, ADR-2 passa a C |
| T021 | O2 | SPEC: AS3 rovesciata, § 7.2 tre endpoint, § 7.5 codici `DOWNLOAD_IN_PROGRESS` (409), `DOWNLOAD_FAILED` (502), `CHECKSUM_MISMATCH` (502), `DISK_FULL` riusato; nota in § 7.2: nessuna ripresa del download dopo un riavvio, per scelta (i parziali si scartano, T029) | T020 | `SPEC.md` | 15 | B | `grep -n "DOWNLOAD_IN_PROGRESS" SPEC.md` |
| T022 | O2 | Errori nuovi in `errors.py` con messaggi italiani e test della mappatura HTTP | T021 | `backend/app/errors.py`, `backend/tests/test_errors.py` | 15 | B | `uv run pytest tests/test_errors.py` verde |
| T023 | O2 | Logica pura estratta: `has_room`, verifica del digest, nome di staging; test con valori limite (spazio esatto al margine) | T022 | `backend/app/services/model_space.py`, test | 20 | B | test verdi, caso "esattamente al margine" = ammesso |
| T024 | O2 | `repositories/model_files.py`: stream verso `MODELS_DIR/.downloads`, hash incrementale, callback di avanzamento, rename atomico; destinazione risolta SOLO dalla `ModelEntry` del registro, mai da campi della richiesta; client con `max_redirects=5` e redirect accettati solo se `https` (rilievi sicurezza P1-1, P2-2); test con respx (successo, checksum errato elimina il parziale, 5xx) | T023 | `backend/app/repositories/model_files.py`, test | 30 | M | test verdi; nel caso checksum errato la cartella di staging è vuota e la destinazione non esiste |
| T025 | O2 | Annullo nel repository: chiusura dello stream e rimozione del parziale; test | T024 | idem | 20 | M | test: dopo cancel nessun file in staging né in destinazione |
| T026 | O2 | `services/model_downloads.py`: un download alla volta (409), rifiuto dei modelli già installati, controllo spazio (507), stato in memoria, lock su file `MODELS_DIR/.downloads/<id>.lock` rispettato anche da `scripts/install_models.py` (CLI e app in parallelo sullo stesso modello), eventi `progress{bytes,total}`, `verifying`, `completed`, `failed{code,message}`, `cancelled` | T024 | `backend/app/services/model_downloads.py`, test | 30 | M | test: secondo avvio → `DownloadInProgressError`; spazio insufficiente → `DiskFullError` senza chiamate HTTP (respx `assert_all_called=False`, 0 chiamate) |
| T027 | O2 | Eventi SSE sul modello di `job_events.py` (snapshot per chi si collega a metà) | T026 | `backend/app/services/model_downloads.py` o `model_download_events.py`, test | 25 | M | test: un client che si collega dopo 3 progress riceve subito l'ultimo stato |
| T028 | O2 | Route `api/v1/models.py` e registrazione nel router; test API (202, 409, 507, 404 per id sconosciuto, origin guard 403 cross-site, 404 per id path-like `..%2F` e `--help` senza alcun accesso al filesystem) | T027 | `backend/app/api/v1/models.py`, `backend/tests/api/test_model_downloads.py` | 30 | M | `uv run pytest tests/api/test_model_downloads.py` verde |
| T029 | O2 | Pulizia all'avvio dei soli parziali in `MODELS_DIR/.downloads` (file dell'app, non modelli) con log WARNING; test | T024 | `backend/app/lifespan.py`, test | 15 | M | test: un file in `.downloads` sparisce all'avvio, un file in `checkpoints` resta |
| T030 | O2 | Frontend: tipi e client (`startDownload`, `cancelDownload`, hook SSE `useModelDownload`) con test | T028 | `frontend/src/api/*`, `frontend/src/hooks/useModelDownload.ts`, test | 30 | M | `npm test -- useModelDownload` verde |
| T031 | O2 | `ModelDownloadButton`: stati idle, disattivato con il conto dello spazio, in corso con barra e "Annulla", verifica, errore con "Riprova", installato; integrazione in `ModelsTable`; invalidazione di `/system` e `/tasks` a fine download | T030 | `frontend/src/components/settings/ModelDownloadButton.tsx`, `ModelsTable.tsx`, test | 30 | M | `npm test -- ModelsTable ModelDownloadButton` verde, ogni stato coperto da un test |
| T032 | O2 | Verifica reale: con `zimage_vae` o un modello piccolo mancante (scelta dell'utente, mai rimuovere un modello per provarlo), scaricarlo dall'app e lanciare un job del compito; controllare se ComfyUI lo vede senza riavvio | T031 | - | 20 | A | `curl -s 127.0.0.1:8188/object_info/VAELoader` elenca il file; il compito passa ad attivo in `/api/v1/tasks`. Se nessun modello piccolo manca: dichiarare la verifica non eseguita e chiedere all'utente |
| T033 | O2 | Click-through a 375 e 1280 px della pagina Impostazioni (download, annulla, spazio insufficiente simulato con `MIN_FREE_DISK_GB` alto) e `a11y-gate` | T031 | - | 20 | M | elenco dei controlli azionati con esito; `a11y-gate` senza violazioni |
| T034 | O2 | SPEC § 11.2 Impostazioni, report di fase, commit | T033 | `SPEC.md`, `docs/REPORT_ATTIVITA.md` | 15 | B | `uv run pytest --cov=app/services --cov=app/engine` ≥ 80% |

## Fase 3 - O5: riferimenti multipli con FLUX.2 klein

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T040 | O5 | Costruire in ComfyUI il grafo a 2 e 3 riferimenti (catena di `VAEEncode` → `ReferenceLatent` su positivo e negativo azzerato, latente vuoto alle proporzioni scelte) ed esportarlo in API format | Fase 1 | `workflows/flux2_klein_refs_{1,2,3}.json` | 30 | A | i tre file esistono; ogni `@input_image_N` ha un `LoadImage` |
| T041 | O5 | Misura: tempo e picco VRAM con 1, 2, 3 riferimenti a 1 MP (e a 0,5 MP se 3 va in OOM), seed fisso, due esecuzioni per determinismo | T040 | `docs/benchmark.md` | 30 | A | tabella con 6 righe in `docs/benchmark.md`; massimo riferimenti deciso e scritto |
| T042 | O5 | SPEC: § 3.1 compito `crea_da_riferimenti`, § 7.3 campo `references`, § 8 nota su `parent_id` (AS-P7) | T041 | `SPEC.md` | 15 | B | `grep -n "crea_da_riferimenti" SPEC.md` |
| T043 | O5 | Schema compito: `workflow_by_reference_count` validato all'avvio (chiavi 1..N, file esistenti, binding presenti in ogni template); test | T042 | `backend/app/models/task.py`, `services/task_catalog.py`, test | 30 | M | test: un template mancante ferma l'avvio con file e titolo nel messaggio |
| T044 | O5 | `tasks.yaml`: compito `crea_da_riferimenti` con binding, default (4 passi, CFG 1.0), proporzioni FLUX, guida al prompt in italiano | T043 | `config/tasks.yaml` | 20 | B | `curl -s 127.0.0.1:8000/api/v1/tasks` elenca il compito disponibile |
| T045 | O5 | `JobRequest.references: list[ReferenceInput]` (exactly-one fra `upload_id` e `generation_id`, massimo da T041); validazione 422 per 0, troppi, entrambi i campi | T043 | `backend/app/models/job.py`, test | 25 | M | test API: 0 riferimenti → 422 `field == "references"` |
| T046 | O5 | `services/job_references.py`: risoluzione di N riferimenti in `ImageInput` (upload o generazione, 404 come oggi), `parent_id` = primo da galleria; test | T045 | `backend/app/services/job_references.py`, `job_resolution.py`, test | 30 | M | test con 2 upload e 1 generazione: 3 input nell'ordine dato |
| T047 | O5 | `upload_repository.expired()` riconosce gli id dentro `request.references` (json_each di SQLite); test di regressione | T045 | `backend/app/repositories/upload_repository.py`, test | 25 | A | test: upload vecchio 8 giorni usato solo come riferimento non è restituito; caso appaiato non referenziato sì; due job distinti con insiemi di riferimenti diversi, per escludere una correlazione `json_each` sbagliata |
| T048 | O5 | Preparazione: ogni riferimento portato a circa 1 MP con lati multipli di 16, upload al motore, binding `input_image_N`, scelta del template per conteggio; test con fake engine | T046 | `backend/app/services/image_preparation.py`, `job_execution.py`, test | 30 | M | test: 2 riferimenti → 2 `upload_image` e template `_2` |
| T049 | O5 | Rerun e salvataggio: `params` della generazione contiene i riferimenti; `POST /rerun` li riusa; test | T048 | `backend/app/services/generation_service.py`, test | 20 | M | test: rerun crea un job con gli stessi `references` |
| T050 | O5 | Frontend: tipi, `ReferencePicker` (aggiungi da file o da galleria, miniature rimovibili, contatore "2 di 3", stato vuoto e errore) con test | T045 | `frontend/src/components/create/ReferencePicker.tsx`, `api/types.ts`, test | 30 | M | `npm test -- ReferencePicker` verde |
| T051 | O5 | Integrazione in Crea quando il compito richiede riferimenti; import ricetta che segnala "scegli di nuovo i riferimenti"; test | T050 | `frontend/src/pages/CreatePage.tsx`, `lib/recipeImport.ts`, test | 30 | M | `npm test -- CreatePage recipeImport` verde |
| T052 | O5 | Suite completa e contratto dei tre template | T049, T051 | - | 15 | M | `uv run pytest` e `uv run pytest -m engine` verdi; `npm test` verde |
| T053 | O5 | Verifica reale: 2 foto dello stesso soggetto → scena nuova; rigenera con lo stesso seed; click-through a 375 e 1280 px | T052 | `docs/benchmark.md` | 25 | M | immagine in galleria, tempo osservato annotato, confronto pixel del rerun registrato |
| T054 | O5 | Report di fase, commit | T053 | `docs/REPORT_ATTIVITA.md` | 10 | B | copertura ≥ 80% su services ed engine |

## Fase 4 - O6: schizzo e posa (ADR-1 = B, consigliata)

Prima del T060: **decisione ADR-1** sintetizzata dall'orchestratore.

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T060 | O6 | SPEC § 3.2 compiti `da_schizzo` e `in_posa`, § 2.2 nota su ControlNet come uscita condizionata | Fase 3, ADR-1 | `SPEC.md` | 15 | B | `grep -n "da_schizzo" SPEC.md` |
| T061 | O6 | Prefisso di prompt per compito (`prompt_prefix` in `tasks.yaml`, applicato in backend come gli stili, salvato in `prompt_final`); test | T060 | `backend/app/models/task.py`, `services/job_resolution.py`, test | 25 | M | test: `prompt_final` inizia col prefisso del compito |
| T062 | O6 | `tasks.yaml`: `da_schizzo` (1 riferimento obbligatorio = schizzo, opzionale un secondo) e `in_posa` (posa + personaggio) sopra i template di O5 | T061 | `config/tasks.yaml` | 20 | B | `/api/v1/tasks` elenca i due compiti disponibili |
| T063 | O6 | `SketchPad`: tela bianca, pennello nero a 3 spessori, gomma, annulla, cancella tutto, esportazione PNG come upload; riuso della logica del pennello di `MaskEditor`; test | T062 | `frontend/src/components/create/SketchPad.tsx`, test | 30 | M | `npm test -- SketchPad` verde, export PNG con dimensione attesa |
| T064 | O6 | Integrazione in Crea per i due compiti (schizzo disegnato o caricato; posa + personaggio con etichette chiare); test | T063 | `frontend/src/pages/CreatePage.tsx`, test | 25 | M | `npm test -- CreatePage` verde |
| T065 | O6 | Preparare 5 schizzi e 3 coppie posa/personaggio fissi; generare con seed fisso | T064 | `docs/benchmark/o6/` (immagini gitignored, solo l'elenco versionato) | 25 | M | 8 risultati salvati, tempi annotati |
| T066 | O6 | Gate di qualità con l'utente: mostrare la griglia, raccogliere il giudizio (soglia 4/5 schizzi, 2/3 pose) | T065 | `docs/benchmark.md` | 15 | A | verdetto dell'utente scritto; sotto soglia: compiti marcati "sperimentale" e apertura di T0A1 |
| T067 | O6 | Click-through a 375 e 1280 px, `a11y-gate` su Crea, report, commit | T066 | `docs/REPORT_ATTIVITA.md` | 20 | B | elenco controlli azionati con esito; suite verde |

### Fase 4-alt - O6 con ControlNet (solo se ADR-1 = A o gate T066 fallito)

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T0A1 | O6 | Registro: ControlNet union promax (solo nodi core `ControlNetLoader` + `SetUnionControlNetType`, senza `comfyui_controlnet_aux`: il tratto del canvas è già la mappa scribble) e i due modelli di posa con sha256 letti da HF; nuova famiglia o estensione di `sdxl` | ADR-1 = A | `config/models.yaml` | 20 | M | `install_models.py --list` mostra 3 voci `missing` con 2,87 GB totali |
| T0A2 | O6 | Pin di [ADR-1: rinviato a un ADR separato, serve solo per la posa da foto; con percorso dei checkpoint su MODELS_DIR e modelli registrati]  `comfyui_controlnet_aux` a commit in `install_engine` e installazione delle sue dipendenze | T0A1 | `engine/install_engine.sh` (o `.py` dopo O3) | 30 | A | i nodi del pacchetto compaiono in `/object_info`; `du -sh engine/ComfyUI/.venv` prima/dopo annotato |
| T0A3 | O6 | Download dei 3 modelli dall'app (O2) con controllo spazio | T0A1, Fase 2 | - | 15 | M | `df` resta sopra 5 GB liberi oltre il margine |
| T0A4 | O6 | Template `sdxl_controlnet_scribble.json` e `sdxl_controlnet_pose.json` costruiti e provati in ComfyUI | T0A2, T0A3 | `workflows/` | 30 | A | immagine reale corretta; `pytest -m engine` verde |
| T0A5 | O6 | Misura VRAM e tempo SDXL + ControlNet a 1152×896 | T0A4 | `docs/benchmark.md` | 20 | A | picco sotto 8 GB senza OOM, scritto in tabella |
| T0A6 | O6 | Compiti in `tasks.yaml` e binding dell'immagine di controllo con forza regolabile; test | T0A5 | `config/tasks.yaml`, backend, test | 30 | M | test API verdi |
| T0A7 | O6 | UI (riuso di `SketchPad`), verifica reale, report, commit | T0A6 | frontend | 30 | M | click-through e immagine reale osservata |

## Fase 5 - O9: anteprime visive degli stili

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T070 | O9 | SPEC § 3.5 e § 2.2: anteprime dentro (v1.2), prompt e seed fissi, generate con `bozza` | Fase 1 | `SPEC.md` | 10 | B | `grep -n "anteprime" SPEC.md` mostra la regola nuova |
| T071 | O9 | `repositories/asset_repository.py`: percorsi sicuri dentro `DATA_DIR/style_previews` (nome = hash dello stile), esistenza, scrittura atomica; test con path traversal | T070 | `backend/app/repositories/asset_repository.py`, test | 25 | M | test: nome con `../` rifiutato |
| T072 | O9 | `services/asset_generation.py`: piano degli stili mancanti (puro) e generazione di uno stile via `workflow_builder` + client motore, miniatura WEBP 256 px; test con fake engine | T071 | `backend/app/services/asset_generation.py`, test | 30 | M | test: 3 esistenti su 5 → 2 job inviati |
| T073 | O9 | CLI `python -m app.cli.assets styles` con avanzamento e tempo stimato, Ctrl+C pulito, codice di uscita non zero se il motore è spento; test della CLI | T072 | `backend/app/cli/__init__.py`, `cli/assets.py`, test | 30 | M | test: motore spento → exit 1 col messaggio di avvio |
| T074 | O9 | `GET /styles` con `preview_url`; `GET /styles/{id}/preview` (404 assente o fuori `DATA_DIR`); test | T071 | `backend/app/api/v1/styles.py`, `services/style_service.py`, test | 25 | B | `uv run pytest tests/api/test_styles_prompt.py` verde con i casi nuovi |
| T075 | O9 | `StyleSelector`: miniatura con `width`/`height` espliciti e `loading="lazy"`, riquadro neutro senza miniatura; test | T074 | `frontend/src/components/create/StyleSelector.tsx`, test | 30 | M | `npm test -- StyleSelector` verde, caso senza miniatura coperto |
| T076 | O9 | Generazione reale di 5 stili, controllo visivo | T073 | - | 10 | M | 5 file WEBP in `data/style_previews`, aperti e guardati |
| T077 | O9 | Generazione completa (circa 20 minuti di GPU, in background) | T076 | - | 10 | B | conteggio file = 277 (`ls data/style_previews \| wc -l`) |
| T078 | O9 | Misura dello spazio occupato e click-through del selettore a 375 e 1280 px | T077, T075 | - | 15 | B | `du -sh data/style_previews` annotato; elenco controlli azionati |
| T079 | O9 | Report, commit | T078 | `docs/REPORT_ATTIVITA.md` | 10 | B | suite verde, copertura ≥ 80% |

## Fase 6 - O10: primo avvio con esempi e "prova questo"

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T080 | O10 | SPEC § 11.2 Crea e § 11.3 stato primo uso con esempi, regola "mai immagini inventate" | Fase 5 | `SPEC.md` | 10 | B | `grep -n "Prova questo" SPEC.md` |
| T081 | O10 | Piano degli esempi (puro): 2 per compito di generazione disponibile, dai `prompt_examples`, seed fissi; manifest JSON; test | T080 | `backend/app/services/asset_generation.py`, test | 25 | B | test: compito disattivato escluso dal piano |
| T082 | O10 | CLI `assets examples` (riuso di T073) che scrive immagini e `manifest.json` in `DATA_DIR/examples`; test | T081 | `backend/app/cli/assets.py`, test | 25 | M | test con fake engine: manifest con 2 voci per compito |
| T083 | O10 | `GET /examples` (manifest + `first_use` = nessuna generazione, cestino incluso) e `GET /examples/{id}/image`; test | T082 | `backend/app/api/v1/examples.py`, test | 30 | M | test: galleria vuota → `first_use: true`; con una generazione nel cestino → `false`; path traversal su `/examples/{id}/image` → 404 come in T071 |
| T084 | O10 | `ExamplesPanel` in Crea: immagini con prompt, "Prova questo" che compila compito, prompt, seed, formato senza avviare; variante solo testo senza esempi; test | T083 | `frontend/src/components/create/ExamplesPanel.tsx`, `pages/CreatePage.tsx`, test | 30 | M | `npm test -- ExamplesPanel` verde; nessun job inviato al click |
| T085 | O10 | Impostazioni: riga "Esempi" con stato (presenti/assenti) e comando per generarli | T083 | `frontend/src/pages/SettingsPage.tsx`, test | 15 | B | `npm test -- SettingsPage` verde |
| T086 | O10 | Generazione reale degli esempi | T082 | - | 10 | B | manifest con N voci, file aperti e guardati |
| T087 | O10 | Click-through a 375 e 1280 px con galleria vuota (`DATA_DIR` temporaneo) e piena; `a11y-gate` su Crea; misura `du -sh data/examples` | T084, T086 | - | 20 | M | elenco controlli con esito, dimensione annotata |
| T088 | O10 | Report, commit | T087 | `docs/REPORT_ATTIVITA.md` | 10 | B | suite verde |

## Fase 7 - O3: Windows e macOS negli script

Tutti i task di questa fase hanno l'esecuzione su Windows e macOS **NV**: si verifica la logica
pura con test parametrizzati e l'esecuzione reale solo su Linux.

| ID | Ox | Task | Dip. | File | Min | R | verify |
|---|---|---|---|---|---|---|---|
| T090 | O3 | SPEC § 1.3 e § 6.2: Linux verificato, Windows e macOS "non provati"; MPS senza garanzia sui modelli fp8 | Fase 1 | `SPEC.md` | 15 | B | `grep -n "non provat" SPEC.md` |
| T091 | O3 | `platform_support.py`: `venv_python(os)`, `torch_index(os, gpu)`, `stop_strategy(os)`, `launcher_kind(os)`; test parametrizzati linux/windows/darwin | T090 | `scripts/platform_support.py`, `scripts/tests/test_platform_support.py` | 30 | M | test verdi; casi windows con `.venv\Scripts\python.exe` (NV a runtime) |
| T092 | O3 | `wait_for_url` e avvio processi con liste di argomenti (niente `shell=True`), attesa su condizione; test con server HTTP locale | T091 | `scripts/platform_support.py`, test | 25 | M | test: processo che muore prima della risposta → errore immediato, non timeout |
| T093 | O3 | `scripts/start.py`: motore se non attivo, build frontend se manca, backend, avviso Ollama, Ctrl+C che ferma solo i processi avviati qui; test con processi finti | T092 | `scripts/start.py`, test | 30 | A | test: cleanup termina i 2 PID avviati e non quello preesistente |
| T094 | O3 | `scripts/stop.py` equivalente a `stop.sh`; test | T092 | `scripts/stop.py`, test | 20 | M | test verdi |
| T095 | O3 | `engine/install_engine.py`: controllo spazio con `shutil.disk_usage`, clone e checkout pinnati, venv, PyTorch per OS, custom node pinnato, `extra_model_paths.yaml` con `string.Template`; logica di piano pura e `--dry-run` | T091 | `engine/install_engine.py`, test | 30 | A | test del piano per i 3 OS; `--dry-run` su Linux stampa i passi senza eseguirli |
| T096 | O3 | `install_engine.py`: smoke test (avvio, attesa su `/system_stats`, arresto) | T095, T092 | idem | 20 | M | test con server finto verde |
| T097 | O3 | Wrapper: `start.sh`, `stop.sh`, `install_engine.sh` diventano `exec uv run --script ...`; nuovi `start.cmd`, `stop.cmd`, `install.cmd` (NV) | T093, T094, T096 | `scripts/*.sh`, `scripts/*.cmd`, `engine/install_engine.sh` | 15 | M | `shellcheck` sui `.sh` verde; `launch.sh` e il file `.desktop` continuano a puntare a `start.sh` |
| T098 | O3 | `install.py` chiama `install_engine.py` invece del `.sh` su tutti gli OS | T095, Fase 1 | `scripts/install.py`, test | 15 | M | `install.py --dry-run` invariato su Linux |
| T099 | O3 | Verifica reale su Linux: `install_engine.sh` (wrapper) rieseguito in modo idempotente dopo il `--dry-run` | T097 | - | 20 | A | exit 0, nessun download di PyTorch nel log, `du -sh engine/ComfyUI/.venv` invariato |
| T100 | O3 | Verifica reale su Linux: `./scripts/start.sh`, uso dell'app, Ctrl+C; `./scripts/stop.sh` | T097 | - | 15 | M | `curl -s 127.0.0.1:8000/api/v1/health` ok; dopo Ctrl+C `ss -ltn` non mostra 8000 e 8188 |
| T101 | O3 | README "Windows e macOS: non provato" con limiti noti; report con lista esplicita NV; commit | T100 | `README.md`, `docs/REPORT_ATTIVITA.md` | 20 | B | il report contiene "non verificato su Windows e macOS" con il motivo |

## Riepilogo

| Fase | Task | Minuti (somma) |
|---|---|---|
| 1 O1 | 11 | 255 |
| 2 O2 | 15 | 330 |
| 3 O5 | 15 | 365 |
| 4 O6 (B) | 8 | 175 |
| 4-alt O6 (A) | 7 | 175 (condizionata) |
| 5 O9 | 10 | 195 |
| 6 O10 | 9 | 175 |
| 7 O3 | 12 | 255 |
| **Totale con B** | **80** | **1750 min, circa 29 h di sola esecuzione dei task** |

La differenza con la stima di `plan.md` (34-42,5 h base) copre test che falliscono per motivi
inattesi, review (`code-reviewer` per fase) e verifica reale; il buffer del 20-30% si aggiunge sopra.

## Esito dell'implementazione (7 ottobre 2026)

Tutte le fasi sono implementate e committate. Scostamenti dal piano, ciascuno con il motivo:

- **T066**: gate di qualità superato per giudizio dell'utente; T0A1-T0A7 (ControlNet) non eseguiti perché non necessari.
- **T076-T077**: anteprime con `qualita` a 12 passi invece di `bozza` (lo stile non si vedeva), circa 62 minuti di GPU invece di 20; scelta confermata dall'utente.
- **T075**: il selettore mostrava 8 stili con miniature da 28 px; sostituito da una griglia sfogliabile di tutti gli stili con miniature da 96 px, perché il render reale mostrava che le anteprime non aiutavano a scegliere.
- **T084**: esempi su due colonne anche a 375 px, perché impilati a tutta larghezza spingevano il modulo sotto circa 4000 px.
- **Aggiunte non pianificate, nate dalle review**: componente condiviso `CopyableCommand`; file di stato `engine/run/studio.pids` usato da `stop.py` su tutti i sistemi (al posto della sola ricerca con `pgrep`).
- **Non verificati**: T032 (un modello appena scaricato è visto da ComfyUI senza riavvio: nessun modello piccolo mancava sulla macchina); esecuzione reale su Windows e macOS (AS-P12); Ctrl+C di `start.sh` provato solo con test unitario.
