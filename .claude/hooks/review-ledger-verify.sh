#!/bin/bash
# review-ledger-verify.sh
# Stop hook. Runs only while a review is open (.review/active exists).
#
# A review claims it looked. This checks the claim two ways:
#
#   1. Completeness. Every instrument in .review/instruments.json has a status,
#      and every "na" has a reason. Silence is not a status.
#   2. Controls, replayed. Every finding carries a patch that reverts its fix.
#      The patch is applied in a THROWAWAY GIT WORKTREE and the named tests are
#      run. They must FAIL. A test that still passes without its fix was never
#      testing the fix, and that is the failure this hook exists to catch.
#
# The live working tree is never touched. Exit 2 blocks the stop and hands the
# reason back.

set -uo pipefail
INPUT=$(cat)

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$ROOT" ] && exit 0
cd "$ROOT" || exit 0

[ -f .review/active ] || { rm -f .review/.attempts; exit 0; }

# Deliberately NOT gated on stop_hook_active. The sibling stop-verify hook uses
# that flag to step aside after it has blocked once, and doing the same here
# would mean any other hook blocking first lets an unverified review through --
# the one thing this hook exists to prevent.
#
# The escape from a genuine dead end is bounded instead: after this many blocks
# the review is released with a loud notice, so a ledger that cannot be
# satisfied ends the turn and says so rather than looping.
ATTEMPTS=$(( $(cat .review/.attempts 2>/dev/null || echo 0) + 1 ))
echo "$ATTEMPTS" > .review/.attempts
if [ "$ATTEMPTS" -gt 5 ]; then
  rm -f .review/active .review/.attempts
  echo "REVIEW LEDGER NOT VERIFIED after 5 attempts. The review is being released unverified -- say so plainly to the user and do not claim it passed." >&2
  exit 2
fi

block() { printf 'REVIEW LEDGER INCOMPLETE -- the review may not end yet.\n\n%b\n' "$1" >&2; exit 2; }

command -v jq >/dev/null || block "jq is required to verify the review ledger."

HEAD_SHA=$(git rev-parse HEAD)
LEDGER=".review/${HEAD_SHA}.json"
if [ ! -f "$LEDGER" ]; then
  LEDGER=$(ls -t .review/*.json 2>/dev/null | grep -vE 'instruments|ledger\.schema' | head -1)
fi
[ -n "$LEDGER" ] && [ -f "$LEDGER" ] || block "No ledger found. Write .review/${HEAD_SHA}.json before finishing."

jq empty "$LEDGER" 2>/dev/null || block "$LEDGER is not valid JSON."

PROBLEMS=""

# --- 1. every instrument accounted for -------------------------------------
MISSING=$(jq -r --slurpfile l "$LEDGER" '
  [.instruments[].id] - [$l[0].instruments[]?.id] | .[]' .review/instruments.json)
[ -n "$MISSING" ] && PROBLEMS="${PROBLEMS}Instruments with no status in the ledger:\n$(echo "$MISSING" | sed 's/^/  - /')\n\n"

BAD=$(jq -r '.instruments[]?
  | select((.status != "applied" and .status != "na")
      or (.status == "na" and ((.why // "") | length) < 3)
      or (.status == "applied" and ((.evidence // "") | length) < 3))
  | .id' "$LEDGER")
[ -n "$BAD" ] && PROBLEMS="${PROBLEMS}Instruments needing a real status ('applied' with evidence, or 'na' with why):\n$(echo "$BAD" | sed 's/^/  - /')\n\n"

# --- 2. every finding carries a replayable control --------------------------
NOCTRL=$(jq -r '.findings[]?
  | select(((.control.patch // "") | length) < 3
      or ((.control.runner // "") | length) < 2
      or ((.control.tests // []) | length) == 0)
  | .id' "$LEDGER")
[ -n "$NOCTRL" ] && PROBLEMS="${PROBLEMS}Findings with no replayable control (need control.patch, control.runner, control.tests):\n$(echo "$NOCTRL" | sed 's/^/  - /')\n\n"

[ -n "$PROBLEMS" ] && block "$PROBLEMS"

# --- 3. replay each control in a throwaway worktree -------------------------
COUNT=$(jq -r '.findings | length' "$LEDGER")
if [ "$COUNT" -gt 0 ]; then
  WTBASE=$(mktemp -d "${TMPDIR:-/tmp}/review-replay.XXXXXX")
  WT="$WTBASE/wt"
  cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1; rm -rf "$WTBASE"; }
  trap cleanup EXIT

  # LFS smudge is skipped: a control replays source, and one missing LFS
  # object on the server would otherwise fail the whole checkout.
  WT_ERR=$(GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach "$WT" "$HEAD_SHA" 2>&1) \
    || block "Could not create a worktree to replay the controls in:\n$WT_ERR"
  [ -d frontend/node_modules ] && ln -s "$ROOT/frontend/node_modules" "$WT/frontend/node_modules" 2>/dev/null

  BLIND=""
  for i in $(seq 0 $((COUNT - 1))); do
    FID=$(jq -r ".findings[$i].id" "$LEDGER")
    PATCHFILE=$(jq -r ".findings[$i].control.patch" "$LEDGER")
    RUNNER=$(jq -r ".findings[$i].control.runner" "$LEDGER")

    [ -f "$PATCHFILE" ] || { BLIND="${BLIND}  - ${FID}: control patch ${PATCHFILE} does not exist\n"; continue; }

    if ! git -C "$WT" apply "$ROOT/$PATCHFILE" 2>/dev/null; then
      BLIND="${BLIND}  - ${FID}: control patch does not apply to ${HEAD_SHA:0:9}\n"
      continue
    fi

    while IFS= read -r SEL; do
      [ -z "$SEL" ] && continue
      case "$RUNNER" in
        go)     ( cd "$WT/backend" && eval "go test $SEL -count=1" ) >/dev/null 2>&1 ;;
        vitest) ( cd "$WT/frontend" && eval "npx vitest run $SEL" ) >/dev/null 2>&1 ;;
        *)      BLIND="${BLIND}  - ${FID}: unknown runner '${RUNNER}'\n"; continue ;;
      esac
      if [ $? -eq 0 ]; then
        BLIND="${BLIND}  - ${FID}: '${SEL}' still PASSES with the fix reverted -- it is not testing the fix\n"
      fi
    done < <(jq -r ".findings[$i].control.tests[]" "$LEDGER")

    git -C "$WT" checkout -- . 2>/dev/null
  done

  [ -n "$BLIND" ] && block "Controls replayed against ${HEAD_SHA:0:9}. These did not hold:\n${BLIND}\nA control passes only when the test FAILS with its fix reverted."
fi

rm -f .review/active .review/.attempts
echo "Review ledger verified: $(jq -r '.instruments | length' "$LEDGER") instruments accounted for, ${COUNT} control(s) replayed and held." >&2
exit 0
