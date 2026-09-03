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
while read -r size path; do
  [ -z "$size" ] && continue
  if [ "$size" -gt 5242880 ]; then
    printf 'FAIL: %s is tracked and is %.1f MB\n' "$path" "$(echo "$size/1048576" | bc -l)"
    status=1
  fi
done < <(git ls-files -z | xargs -0 -n 50 git ls-tree -r -l HEAD -- 2>/dev/null | awk '$2=="blob" {print $4, $5}')

[ "$status" -eq 0 ] && echo "ok: no tracked build artifacts"
exit "$status"
