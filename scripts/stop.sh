#!/usr/bin/env bash
# Thin wrapper: the real implementation is stop.py (Python port). See that
# file for what this stops and how.
set -euo pipefail

exec uv run --script "$(dirname "${BASH_SOURCE[0]}")/stop.py" "$@"
