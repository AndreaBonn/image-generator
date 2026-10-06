#!/usr/bin/env bash
# Thin wrapper: the real implementation is install_engine.py (Python port).
# See that file for what this installs and how.
set -euo pipefail

exec uv run --script "$(dirname "${BASH_SOURCE[0]}")/install_engine.py" "$@"
