#!/usr/bin/env bash
# Convenience launcher for the Ajay AI Assistant backend.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] && source .venv/bin/activate || true
exec uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" "$@"
