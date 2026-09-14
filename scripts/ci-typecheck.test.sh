#!/bin/bash
# CI's frontend type check has to refuse a type error.
#
# It ran `tsc --noEmit` against a root tsconfig that lists no files and only
# points at the real configs, so it checked an empty project and passed every
# run while checking nothing. This takes the command from ci.yml itself, so
# the test follows whatever CI actually runs.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

cmd=$(awk '/name: TypeScript type check/{found=1} found && /^ *run:/{sub(/^ *run: */, ""); print; exit}' .github/workflows/ci.yml)
if [ -z "$cmd" ]; then
  echo "FAIL: ci.yml has no 'TypeScript type check' step to test"
  exit 1
fi

probe=frontend/src/__ci_typecheck_probe__.ts
trap 'rm -f "$probe"' EXIT
printf "export const probe: number = 'not a number';\n" >"$probe"

if (cd frontend && eval "$cmd") >/dev/null 2>&1; then
  echo "FAIL: CI's type check ($cmd) passed a file with a type error"
  exit 1
fi
echo "ok: CI's type check ($cmd) refuses a type error"
