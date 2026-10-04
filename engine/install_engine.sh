#!/usr/bin/env bash
# Installs ComfyUI (pinned) as the headless generation engine, plus the only custom node
# used by Studio Immagini. Idempotent: re-running skips what is already in place.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="${REPO_ROOT}/engine/ComfyUI"
COMFY_TAG="v0.38.2"
INPAINT_NODES_COMMIT="5b7681746fe19e563113d27366ba85236bc1ba5b"
TORCH_INDEX="https://download.pytorch.org/whl/cu130"
MIN_FREE_GB_FOR_ENGINE=10
COMFY_PORT="${COMFY_PORT:-8188}"
STARTUP_TIMEOUT_S=120

FOOOCUS_DIR="${FOOOCUS_DIR:-/home/bonn/Documenti/00_Lavoro/ProgettiEsterni/Fooocus}"
MODELS_DIR="${MODELS_DIR:-${REPO_ROOT}/engine/models}"

SMOKE_PID=""

log() { printf '[install_engine] %s\n' "$*"; }

check_free_space() {
  local free_gb
  free_gb=$(df --output=avail -BG "${REPO_ROOT}" | tail -1 | tr -dc '0-9')
  if (( free_gb < MIN_FREE_GB_FOR_ENGINE )); then
    log "Only ${free_gb} GB free, at least ${MIN_FREE_GB_FOR_ENGINE} GB are needed for ComfyUI + PyTorch. Aborting."
    exit 1
  fi
  log "Free space: ${free_gb} GB"
}

clone_comfyui() {
  if [[ ! -d "${ENGINE_DIR}/.git" ]]; then
    git clone --quiet https://github.com/Comfy-Org/ComfyUI.git "${ENGINE_DIR}"
  fi
  git -C "${ENGINE_DIR}" fetch --quiet --tags
  git -C "${ENGINE_DIR}" -c advice.detachedHead=false checkout --quiet "${COMFY_TAG}"
  log "ComfyUI at ${COMFY_TAG}"
}

install_python_env() {
  if [[ ! -x "${ENGINE_DIR}/.venv/bin/python" ]]; then
    uv venv --quiet --python 3.12 "${ENGINE_DIR}/.venv"
  fi
  export VIRTUAL_ENV="${ENGINE_DIR}/.venv"
  uv pip install --quiet torch torchvision torchaudio --index-url "${TORCH_INDEX}"
  uv pip install --quiet -r "${ENGINE_DIR}/requirements.txt"
  log "Python environment ready"
}

install_inpaint_nodes() {
  local node_dir="${ENGINE_DIR}/custom_nodes/comfyui-inpaint-nodes"
  if [[ ! -d "${node_dir}/.git" ]]; then
    git clone --quiet https://github.com/Acly/comfyui-inpaint-nodes.git "${node_dir}"
  fi
  git -C "${node_dir}" fetch --quiet
  git -C "${node_dir}" -c advice.detachedHead=false checkout --quiet "${INPAINT_NODES_COMMIT}"
  VIRTUAL_ENV="${ENGINE_DIR}/.venv" uv pip install --quiet opencv-python
  log "comfyui-inpaint-nodes at ${INPAINT_NODES_COMMIT:0:12}"
}

write_model_paths() {
  mkdir -p "${MODELS_DIR}"/{checkpoints,diffusion_models,text_encoders,vae,loras,inpaint,upscale_models}
  # envsubst takes the literal variable names to substitute, hence the single quotes.
  # shellcheck disable=SC2016
  FOOOCUS_DIR="${FOOOCUS_DIR}" MODELS_DIR="${MODELS_DIR}" \
    envsubst '${FOOOCUS_DIR} ${MODELS_DIR}' \
    < "${REPO_ROOT}/config/comfy/extra_model_paths.yaml.template" \
    > "${ENGINE_DIR}/extra_model_paths.yaml"
  log "extra_model_paths.yaml written (Fooocus: ${FOOOCUS_DIR}, models: ${MODELS_DIR})"
}

smoke_test() {
  local log_file="${REPO_ROOT}/engine/smoke_test.log"
  "${ENGINE_DIR}/.venv/bin/python" "${ENGINE_DIR}/main.py" \
    --listen 127.0.0.1 --port "${COMFY_PORT}" --disable-auto-launch > "${log_file}" 2>&1 &
  SMOKE_PID=$!
  trap 'kill "${SMOKE_PID}" 2>/dev/null || true' EXIT
  local waited=0
  until curl -sf "http://127.0.0.1:${COMFY_PORT}/system_stats" > /dev/null; do
    if ! kill -0 "${SMOKE_PID}" 2>/dev/null; then
      log "ComfyUI exited during startup, see ${log_file}"
      exit 1
    fi
    if (( waited >= STARTUP_TIMEOUT_S )); then
      log "ComfyUI did not answer within ${STARTUP_TIMEOUT_S}s, see ${log_file}"
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  curl -s "http://127.0.0.1:${COMFY_PORT}/system_stats"
  echo
  log "ComfyUI answered after ${waited}s"
}

main() {
  check_free_space
  clone_comfyui
  install_python_env
  install_inpaint_nodes
  write_model_paths
  if [[ "${SKIP_SMOKE_TEST:-0}" != "1" ]]; then
    smoke_test
  fi
  log "Done"
}

main "$@"
