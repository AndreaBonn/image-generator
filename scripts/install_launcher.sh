#!/usr/bin/env bash
# Adds "Image Generator" and "Chiudi Image Generator" to the desktop application
# menu of the current user. --uninstall removes them.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON="${REPO_ROOT}/frontend/public/favicon.svg"
OPEN_ENTRY="${APPS_DIR}/image-generator.desktop"
STOP_ENTRY="${APPS_DIR}/image-generator-stop.desktop"

write_entries() {
  mkdir -p "${APPS_DIR}"
  cat > "${OPEN_ENTRY}" <<EOF
[Desktop Entry]
Type=Application
Name=Image Generator
Comment=Crea e modifica immagini con l'intelligenza artificiale, in locale
Exec="${REPO_ROOT}/scripts/launch.sh"
Icon=${ICON}
Terminal=false
Categories=Graphics;
StartupWMClass=ImageGenerator
EOF
  cat > "${STOP_ENTRY}" <<EOF
[Desktop Entry]
Type=Application
Name=Chiudi Image Generator
Comment=Ferma Image Generator e libera la memoria della scheda video
Exec="${REPO_ROOT}/scripts/stop.sh"
Icon=${ICON}
Terminal=false
Categories=Graphics;
EOF
}

refresh_menu() {
  if command -v update-desktop-database > /dev/null; then
    update-desktop-database "${APPS_DIR}" || true
  fi
}

main() {
  if [[ "${1:-}" == "--uninstall" ]]; then
    rm -f -- "${OPEN_ENTRY}" "${STOP_ENTRY}"
    refresh_menu
    echo "Voci di Image Generator rimosse dal menu."
    return 0
  fi
  write_entries
  if command -v desktop-file-validate > /dev/null; then
    desktop-file-validate "${OPEN_ENTRY}" "${STOP_ENTRY}"
  fi
  refresh_menu
  echo "Fatto: cerca \"Image Generator\" nel menu delle applicazioni (tasto Super)."
  echo "Per fissarla nella dock: clic destro sull'icona, \"Aggiungi ai preferiti\"."
}

main "$@"
