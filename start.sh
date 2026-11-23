#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="/home/kelvin/.local/opt/node22/bin:$PATH"
cd "$ROOT"
exec "$@"
