#!/bin/bash
# Refuses a tracked build artifact.
#
# `go build ./cmd/zz_model_compare` drops a 54 MB binary in backend/, and a
# `git add -A backend` swept one into a commit. It was caught only because the
# next review printed the file list; nothing else would have reported it, and by
# then it is in history for good.
#
# Two questions, because either alone passes while the other is broken: is the
# artifact ignored, and is anything large tracked right now.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

status=0

for artifact in backend/zz_model_compare backend/server; do
  if ! git check-ignore -q "$artifact"; then
    echo "FAIL: $artifact is not ignored, so building it makes it committable"
    status=1
  fi
done

# 5 MB. Every legitimate file in this repository is far below it, and every
# compiled Go binary is far above.
#
# Read from the index rather than from HEAD. HEAD answers "was a large file
# committed", which is a question that arrives one commit too late: the way this
# happens is `git add -A` staging a build, and a guard that only sees HEAD calls
# that clean right up until it is permanent.
while read -r mode sha rest; do
  [ "$mode" = 100644 ] || [ "$mode" = 100755 ] || continue
  size=$(git cat-file -s "$sha" 2>/dev/null) || continue
  if [ "$size" -gt 5242880 ]; then
    printf 'FAIL: %s is staged or tracked and is %.1f MB\n' "${rest#*	}" \
      "$(echo "scale=1; $size/1048576" | bc -l)"
    status=1
  fi
done < <(git ls-files -s)

[ "$status" -eq 0 ] && echo "ok: no tracked build artifacts"
exit "$status"
