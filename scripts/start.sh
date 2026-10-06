#!/usr/bin/env bash
# Thin wrapper: the real implementation is start.py (Python port). See that
# file for what this starts and how Ctrl+C stops it.
set -euo pipefail

exec uv run --script "$(dirname "${BASH_SOURCE[0]}")/start.py" "$@"
