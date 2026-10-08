#!/usr/bin/env bash
set -euo pipefail
# Run from any directory. Edit the desired pins first; resolution must still
# satisfy the entire graph. Nothing is installed into the caller's environment.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
case "${1:-}" in
  image|video) requirements="$repo_root/infra/runpod/$1-worker/requirements.txt" ;;
  avatar) requirements="$repo_root/infra/avatar-worker/requirements.txt" ;;
  *) echo 'Usage: scripts/lock-worker-dependencies.sh image|video|avatar' >&2; exit 2 ;;
esac
lock_output="$(mktemp)"
trap 'rm -f "$lock_output"' EXIT
uv pip compile "$requirements" --python-version 3.11 \
  --python-platform x86_64-unknown-linux-gnu --torch-backend cpu \
  --no-header --no-annotate --output-file "$lock_output"
python3 - "$requirements" "$lock_output" <<'PY'
from pathlib import Path
import re
import sys
destination, source = map(Path, sys.argv[1:])
header = destination.read_text().split("\n\n", 1)[0]
text = re.sub(r"(?m)^(torch|torchaudio|torchvision)==([^\n+]+)\+cpu$", r"\1==\2", source.read_text())
destination.write_text(header + "\n\n" + text)
PY
