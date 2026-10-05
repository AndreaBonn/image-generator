#!/usr/bin/env bash
# Desktop entry point: starts Image Generator in the background if it is not
# running yet, then opens it in a dedicated app window.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT="${PORT:-8000}"
APP_URL="http://127.0.0.1:${APP_PORT}"
LOG_FILE="${REPO_ROOT}/engine/app.log"
STARTUP_TIMEOUT_S=180
APP_NAME="Image Generator"
WINDOW_CLASS="ImageGenerator"
PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/image-generator/browser-profile"
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/image-generator-launch.lock"

notify() {
  if command -v notify-send > /dev/null; then
    notify-send --app-name="${APP_NAME}" "${APP_NAME}" "$1" || true
  fi
  printf '[image-generator] %s\n' "$1"
}

is_up() { curl -sf -m 2 "${APP_URL}/api/v1/health" > /dev/null; }

warn_shared_gpu() {
  if command -v ollama > /dev/null && [[ -n "$(ollama ps 2>/dev/null | tail -n +2)" ]]; then
    notify "Ollama ha un modello caricato sulla scheda video: chiudilo con 'ollama stop <nome>' prima di generare."
  fi
}

start_app() {
  notify "Avvio in corso, attendi qualche secondo..."
  mkdir -p "$(dirname "${LOG_FILE}")"
  # setsid detaches start.sh from the launcher, so closing the window does not stop it;
  # 9>&- keeps the launch lock out of start.sh, which would otherwise hold it for its lifetime.
  setsid "${REPO_ROOT}/scripts/start.sh" > "${LOG_FILE}" 2>&1 < /dev/null 9>&- &
  local pid=$! waited=0
  until is_up; do
    if ! kill -0 "${pid}" 2> /dev/null || (( waited >= STARTUP_TIMEOUT_S )); then
      notify "L'avvio non è riuscito: controlla ${LOG_FILE}"
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

open_window() {
  local browser
  for browser in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "${browser}" > /dev/null; then
      # A separate profile gives the window its own process, so --class sets the
      # window class the dock uses to group it under the Image Generator icon.
      exec "${browser}" --app="${APP_URL}" --class="${WINDOW_CLASS}" \
        --user-data-dir="${PROFILE_DIR}" --no-first-run --no-default-browser-check
    fi
  done
  exec xdg-open "${APP_URL}"
}

main() {
  # A second click while the first launch is still starting waits here, then
  # finds the app up instead of starting another copy on the same ports.
  exec 9> "${LOCK_FILE}"
  flock -w "${STARTUP_TIMEOUT_S}" 9 || true
  if ! is_up; then
    warn_shared_gpu
    start_app
  fi
  exec 9>&-
  open_window
}

main "$@"
