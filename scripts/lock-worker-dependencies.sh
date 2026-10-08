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
cp "$requirements" "$lock_output"
# Match pip-compile's selection across the two explicit, trusted registries.
# Existing lock versions remain preferred unless an input requires a change.
uv pip compile "${requirements%.txt}.in" --python-version 3.12 \
  --python-platform x86_64-unknown-linux-gnu --torch-backend cpu \
  --index-strategy unsafe-best-match \
  --no-header --no-annotate --output-file "$lock_output"
python3 - "$requirements" "$lock_output" <<'PY'
from pathlib import Path
import sys
destination, source = map(Path, sys.argv[1:])
header = "# Generated from requirements.in for Python 3.12/Linux.\n# pip-compile compatibility: --strip-extras"
lines = source.read_text().splitlines()
unsafe = [line for line in lines if line.partition("==")[0] in {"pip", "setuptools", "distribute"}]
text = "\n".join(line for line in lines if line not in unsafe).rstrip()
if unsafe:
    # Dependabot removes a newly introduced pip-compile unsafe footer, including
    # its pins. Preserve the native footer so setuptools stays in the lock.
    text += "\n\n# The following packages are considered to be unsafe in a requirements file:\n"
    text += "\n".join(unsafe)
destination.write_text(header + "\n\n" + text + "\n")
PY
