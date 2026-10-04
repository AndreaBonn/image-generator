# Studio Immagini

Local Italian web UI over a headless ComfyUI engine. The authoritative spec is `SPEC.md`:
read it before changing behaviour, and update it when a decision changes.

## Layout

- `engine/` - `install_engine.sh` installs ComfyUI (pinned) into `engine/ComfyUI` (gitignored);
  new models go to `engine/models` (gitignored). Fooocus models are reused in place via
  `extra_model_paths.yaml`, never copied.
- `config/` - `models.yaml` (model registry), `tasks.yaml` (task catalog), ComfyUI path template.
- `workflows/` - ComfyUI graphs in API format. Parametric nodes carry a `_meta.title`
  starting with `@`; code binds values by title, never by numeric node id.
- `backend/` - FastAPI app (uv project). `frontend/` - React + Vite app (npm).
- `scripts/` - standalone PEP 723 scripts, run with `uv run --script scripts/<name>.py`.

## Commands

```bash
./engine/install_engine.sh                       # install or repair the engine
uv run --script scripts/install_models.py --list # model status and disk space
uv run --script scripts/benchmark.py             # phase 0 benchmark (engine must be running)
uv run --no-project --with pytest --with pyyaml --with huggingface_hub pytest scripts/tests
cd backend && uv run pytest                      # backend tests (fake engine)
cd backend && uv run pytest -m engine            # contract tests, need ComfyUI on :8188
cd frontend && npm test                          # frontend unit tests
./scripts/start.sh                               # engine + backend (+ built frontend)
```

## Conventions

- Code, comments, commits in English; every user-facing string in Italian.
- The engine and the backend bind to 127.0.0.1 only (ComfyUI has no real auth).
- Never delete models or caches to free disk space without asking the user.
- Commit atomically on `main` (the user asked for a single-branch workflow on this repo).
