#!/usr/bin/env bash
# Stops Image Generator (app and engine) and frees the GPU memory it holds.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Image Generator"
STOP_TIMEOUT_S=30

notify() {
  if command -v notify-send > /dev/null; then
    notify-send --app-name="${APP_NAME}" "${APP_NAME}" "$1" || true
  fi
  printf '[image-generator] %s\n' "$1"
}

# Processes of this checkout only, matched from the start of the command line
# (interpreter + absolute script path), so an editor or a `tail` on these files
# never matches. The repo path is escaped because pgrep takes a regex.
own_pids() {
  local repo
  repo="$(printf '%s' "${REPO_ROOT}" | sed 's/[][\\.*^$+?(){}|/]/\\&/g')"
  pgrep -f -- "^(bash ${repo}/scripts/start\.sh|${repo}/engine/ComfyUI/\.venv/bin/python[0-9.]* ${repo}/engine/ComfyUI/main\.py|${repo}/backend/\.venv/bin/python[0-9.]* ${repo}/backend/\.venv/bin/uvicorn)( |$)" || true
}

wait_for_exit() {
  local waited=0
  while [[ -n "$(own_pids)" ]]; do
    if (( waited >= STOP_TIMEOUT_S )); then
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

main() {
  local pids
  pids="$(own_pids)"
  if [[ -z "${pids}" ]]; then
    notify "Non era in esecuzione."
    return 0
  fi
  # shellcheck disable=SC2086 # one pid per word is intended
  kill -TERM ${pids} 2> /dev/null || true
  if ! wait_for_exit; then
    pids="$(own_pids)"
    # shellcheck disable=SC2086 # one pid per word is intended
    kill -KILL ${pids} 2> /dev/null || true
    sleep 1
    if [[ -n "$(own_pids)" ]]; then
      notify "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer."
      exit 1
    fi
  fi
  notify "Chiuso. La memoria della scheda video è libera."
}

main "$@"
