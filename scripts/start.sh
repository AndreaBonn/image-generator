#!/usr/bin/env bash
# Starts Image Generator: the ComfyUI engine (unless already running) and the backend,
# which also serves the built frontend. Ctrl+C stops only the processes started here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="${REPO_ROOT}/engine/ComfyUI"
COMFY_PORT="${COMFY_PORT:-8188}"
APP_PORT="${PORT:-8000}"
STARTUP_TIMEOUT_S=120
STARTED_PIDS=()

log() { printf '[studio] %s\n' "$*"; }

cleanup() {
  for pid in "${STARTED_PIDS[@]}"; do
    kill "${pid}" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1" pid="$2" waited=0
  until curl -sf "${url}" > /dev/null; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      return 1
    fi
    if (( waited >= STARTUP_TIMEOUT_S )); then
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

warn_shared_gpu() {
  if command -v ollama > /dev/null && [[ -n "$(ollama ps 2>/dev/null | tail -n +2)" ]]; then
    log "ATTENZIONE: Ollama ha un modello caricato sulla scheda video."
    log "Generare insieme a Ollama ha già causato un blocco della GPU: chiudi il modello con 'ollama stop <nome>'."
  fi
}

ensure_frontend_build() {
  if [[ ! -f "${REPO_ROOT}/frontend/dist/index.html" || "${1:-}" == "--build" ]]; then
    log "Compilo l'interfaccia (frontend/dist)..."
    (cd "${REPO_ROOT}/frontend" && npm ci --silent && npm run build --silent)
  fi
}

start_engine() {
  if curl -sf "http://127.0.0.1:${COMFY_PORT}/system_stats" > /dev/null; then
    log "Motore già attivo sulla porta ${COMFY_PORT}"
    return
  fi
  if [[ ! -x "${ENGINE_DIR}/.venv/bin/python" ]]; then
    log "Motore non installato: esegui prima ./engine/install_engine.sh"
    exit 1
  fi
  log "Avvio il motore ComfyUI..."
  "${ENGINE_DIR}/.venv/bin/python" "${ENGINE_DIR}/main.py" \
    --listen 127.0.0.1 --port "${COMFY_PORT}" --disable-auto-launch \
    > "${REPO_ROOT}/engine/comfy.log" 2>&1 &
  local pid=$!
  STARTED_PIDS+=("${pid}")
  if ! wait_for_url "http://127.0.0.1:${COMFY_PORT}/system_stats" "${pid}"; then
    log "Il motore non si è avviato: vedi engine/comfy.log"
    exit 1
  fi
  log "Motore pronto"
}

start_backend() {
  log "Avvio l'applicazione..."
  (cd "${REPO_ROOT}/backend" && exec uv run uvicorn app.main:create_app --factory \
    --host 127.0.0.1 --port "${APP_PORT}") &
  local pid=$!
  STARTED_PIDS+=("${pid}")
  if ! wait_for_url "http://127.0.0.1:${APP_PORT}/api/v1/health" "${pid}"; then
    log "L'applicazione non si è avviata"
    exit 1
  fi
  log "Pronto: apri http://127.0.0.1:${APP_PORT}"
  wait "${pid}"
}

main() {
  warn_shared_gpu
  ensure_frontend_build "${1:-}"
  start_engine
  start_backend
}

main "$@"
