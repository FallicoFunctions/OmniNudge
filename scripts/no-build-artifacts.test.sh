#!/bin/bash
# Tests the build-artifact guard against a throwaway repository.
#
# The staged case is the one that matters and is the one the guard first missed:
# it read HEAD, which answers "was a large file committed" -- a question that
# arrives one commit too late, because the way this happens is `git add -A`
# staging a build.
set -uo pipefail
guard="$(cd "$(dirname "$0")" && pwd)/no-build-artifacts.sh"
passed=0; failed=0

check() { # name, expected_status, actual_status
  if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; passed=$((passed+1))
  else printf '  FAIL  %s (wanted exit %s, got %s)\n' "$1" "$2" "$3"; failed=$((failed+1)); fi
}

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
cd "$sandbox" || exit 1
git init -q .
git config user.email t@t; git config user.name t
mkdir -p backend scripts
cp "$guard" scripts/no-build-artifacts.sh
printf '/omninudge\n/backend/bin/\n' > .gitignore
printf '/zz_model_compare\n/server\n' > backend/.gitignore
echo hello > backend/small.txt
git add -A >/dev/null && git commit -qm first

bash scripts/no-build-artifacts.sh >/dev/null 2>&1
check "a clean repository passes" 0 $?

# Staged but never committed. HEAD says nothing about this file.
dd if=/dev/urandom of=backend/big bs=1m count=6 >/dev/null 2>&1
git add -f backend/big >/dev/null
bash scripts/no-build-artifacts.sh >/dev/null 2>&1
check "a staged 6 MB file is refused before it is committed" 1 $?

git commit -qm big
bash scripts/no-build-artifacts.sh >/dev/null 2>&1
check "and is still refused once committed" 1 $?

git rm -q --cached backend/big; rm -f backend/big; git commit -qm drop
bash scripts/no-build-artifacts.sh >/dev/null 2>&1
check "removing it clears the refusal" 0 $?

# An ignore rule that is not there is the other half: it does not untrack what
# is already in, so both questions have to be asked.
printf '/server\n' > backend/.gitignore
git add -A >/dev/null && git commit -qm unignore
bash scripts/no-build-artifacts.sh >/dev/null 2>&1
check "an artifact that is no longer ignored is refused" 1 $?

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
