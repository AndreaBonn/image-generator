[English](./SECURITY.md) | **Italiano**

# Politica di sicurezza

## Versioni supportate

Il progetto non ha release con tag. Le correzioni di sicurezza vengono applicate all'ultimo commit su `main`.

## Segnalare una vulnerabilità

Segnala le vulnerabilità in privato tramite [GitHub Security Advisories](https://github.com/AndreaBonn/image-generator/security/advisories/new). Non aprire una issue pubblica.

Includi:

- una descrizione della vulnerabilità
- i passi per riprodurla
- il comportamento atteso e quello osservato
- l'impatto: cosa potrebbe ottenere un attaccante

Tempi di risposta:

- presa in carico entro 72 ore
- correzione dei problemi critici entro 30 giorni
- divulgazione pubblica coordinata dopo il rilascio della correzione

## Modello di minaccia

Image Generator è un'applicazione per un solo utente su un solo computer. Non ha autenticazione né account: chiunque raggiunga la porta del backend può usarla. Il progetto si basa sul fatto che entrambi i processi siano raggiungibili solo dal computer locale. La minaccia principale considerata è una pagina web aperta nello stesso browser che prova a mandare richieste all'app locale.

## Misure di sicurezza implementate

- **Ascolto solo in locale**: l'impostazione dell'host del backend accetta solo `127.0.0.1` (`backend/app/config.py:29`), e l'indirizzo del motore viene rifiutato se l'host non è `127.0.0.1` (`backend/app/config.py:38`). ComfyUI viene avviato con `--listen 127.0.0.1` (`scripts/start.py:130`).
- **Rifiuto delle richieste da altri siti**: ogni richiesta che modifica lo stato viene controllata su `Sec-Fetch-Site` e `Origin`; le richieste inviate da un altro sito, o con un'origine diversa da un host locale, ricevono un 403. Il controllo dell'origine vale anche quando il browser dichiara la stessa origine, per coprire il DNS rebinding (`backend/app/api/origin_guard.py:19`, registrato in `backend/app/main.py:31`).
- **Validazione dei file caricati**: massimo 20 MB e 4096 px per lato, decodifica con Pillow, solo PNG, JPEG e WebP, rifiuto in caso di decompression bomb (`backend/app/services/upload_service.py:20`). Le ricette incorporate nei PNG hanno un limite di 64 KB (`backend/app/services/upload_service.py:22`) e vengono validate con Pydantic, compresi lunghezza della descrizione, numero di stili e intervallo del seed (`backend/app/models/upload.py:7`).
- **Contenimento dei percorsi**: i percorsi letti dal database vengono risolti e devono restare dentro la cartella dei dati (`backend/app/repositories/file_paths.py:6`). La pulizia dell'output del motore rifiuta una cartella che sia un link simbolico o che si risolva fuori dalla cartella di output (`backend/app/repositories/output_repository.py:32`).
- **Limite di frequenza sui lavori**: gli endpoint dei lavori accettano al massimo 600 richieste ogni 60 secondi per tutta l'app, poi rispondono 429 (`backend/app/api/v1/job_limits.py:8`).
- **Download verificati**: ogni modello ospitato su Hugging Face deve dichiarare uno sha256 in `config/models.yaml` (`backend/app/repositories/catalog_repository.py:40`). I download vengono scritti in una cartella temporanea, confrontati con quell'hash e solo dopo spostati al loro posto (`backend/app/repositories/model_files.py:131`), con al massimo 5 redirect (`backend/app/repositories/model_files.py:17`). L'installatore applica lo stesso controllo (`scripts/install_models.py:87`).
- **Codice di terze parti fissato**: ComfyUI viene scaricato a un tag fisso (`engine/install_engine_actions.py:35`), e i file degli stili SDXL vengono presi da un commit fisso di Fooocus e verificati con sha256 (`config/styles.yaml`).
- **Dipendenze bloccate**: i lockfile sono nel repository per il backend (`backend/uv.lock`) e per il frontend (`frontend/package-lock.json`).
- **Accesso al database**: tutte le query passano da SQLAlchemy (`backend/app/repositories/`).

Non implementati: autenticazione, TLS, header di sicurezza, scansione automatica delle dipendenze.

## Best practice per gli utenti

- Tieni l'app su `127.0.0.1`. Non esporre le porte 8000 e 8188 con un reverse proxy, un port forwarding o un tunnel: né l'app né ComfyUI hanno autenticazione.
- Le immagini scaricate contengono descrizione e impostazioni nei metadati del PNG. Se la descrizione è privata, rimuovi i metadati prima di condividere l'immagine.
- I file dei modelli vengono eseguiti dal motore. Aggiungi modelli a `config/models.yaml` solo da fonti di cui ti fidi, e sempre con il loro sha256.

## Fuori ambito

- Attacchi che richiedono accesso locale al computer o all'account che esegue l'app
- Esposizione dell'app oltre `127.0.0.1`, contro le indicazioni qui sopra
- Vulnerabilità di ComfyUI, PyTorch o dei modelli stessi (vanno segnalate ai rispettivi progetti)
- Contenuti generati dai modelli
- Denial of service dovuto a un uso intenso ma legittimo della GPU

## Riconoscimenti

Chi segnalerà vulnerabilità in modo responsabile verrà elencato qui.

---

[Torna al README](./README.it.md)
