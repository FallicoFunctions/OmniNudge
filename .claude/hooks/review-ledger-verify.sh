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

# The hook payload is drained but not read: the only field that would apply is
# stop_hook_active, and this hook deliberately ignores it (see below).
cat >/dev/null

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$ROOT" ] && exit 0
cd "$ROOT" || exit 0

# mtime, portably enough for macOS and Linux.
mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

[ -f .review/active ] || exit 0

# Deliberately NOT gated on stop_hook_active. The sibling stop-verify hook uses
# that flag to step aside after it has blocked once, and doing the same here
# would mean any other hook blocking first lets an unverified review through --
# the one thing this hook exists to prevent.
#
# The escape from a genuine dead end is bounded instead: after this many blocks
# the review is released with a loud notice, so a ledger that cannot be
# satisfied ends the turn and says so rather than looping.
MAX_BLOCKS=5

# The hook is given 900 seconds by settings.json. A hook that is killed never
# exits 2, so the stop proceeds -- running out of time would be one more way to
# pass. Both bounds are its own, well inside that, so it decides rather than
# being decided for. A single hung test is bounded too: the overall check
# happens between runs and would never be reached by a test that never returns.
RUN_LIMIT=${REVIEW_RUN_LIMIT:-180}
DEADLINE=${REVIEW_DEADLINE:-600}
STARTED_AT=$(date +%s)
elapsed() { echo $(( $(date +%s) - STARTED_AT )); }

block() {
  echo "$(( ATTEMPTS + 1 )) ${LEDGER:-none} ${STARTED:-0}" > .review/active
  if [ "$ATTEMPTS" -ge "$MAX_BLOCKS" ]; then
    rm -f .review/active
    printf 'REVIEW LEDGER NOT VERIFIED after %s attempts. The review is being released unverified -- say so plainly to the user and do not claim it passed.\n\nThe last reason was:\n%b\n' "$MAX_BLOCKS" "$1" >&2
    exit 2
  fi
  printf 'REVIEW LEDGER INCOMPLETE -- the review may not end yet. (attempt %s of %s)\n\n%b\n' "$(( ATTEMPTS + 1 ))" "$MAX_BLOCKS" "$1" >&2
  exit 2
}

ATTEMPTS=0
LEDGER=""
STARTED=$(mtime .review/active 2>/dev/null || echo 0)
command -v jq >/dev/null || block "jq is required to verify the review ledger."

# Without the list there is nothing to be complete against, and the
# completeness check silently passed on an empty set -- a review could account
# for no instruments at all by deleting the file that names them.
[ -f .review/instruments.json ] || block ".review/instruments.json is missing. It is the list a review is checked against, so nothing can be verified without it."
jq empty .review/instruments.json 2>/dev/null || block ".review/instruments.json is not valid JSON."


# git has to work before anything below means anything.
#
# Outside a repository -- or with CLAUDE_PROJECT_DIR pointing somewhere that is
# not one -- rev-parse failed quietly, HEAD_SHA came back empty, and a review
# with no findings was verified as though it had been checked. Nothing here can
# be established without a commit to check against.
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)
case "$HEAD_SHA" in
  [0-9a-f][0-9a-f]*) ;;
  *) block "Could not resolve HEAD in ${ROOT}. A review is verified against a commit, so there is nothing to check here." ;;
esac
LEDGER=".review/${HEAD_SHA}.json"
if [ ! -f "$LEDGER" ]; then
  NEWEST=0
  for CANDIDATE in .review/*.json; do
    [ -f "$CANDIDATE" ] || continue
    case "$CANDIDATE" in
      .review/instruments.json|.review/ledger.schema.json) continue ;;
    esac
    CANDIDATE_AT=$(mtime "$CANDIDATE")
    if [ "$CANDIDATE_AT" -gt "$NEWEST" ]; then NEWEST="$CANDIDATE_AT"; LEDGER="$CANDIDATE"; fi
  done
fi
[ -n "$LEDGER" ] && [ -f "$LEDGER" ] || block "No ledger found. Write one to .review/<base-sha>.json before finishing -- the commit the review started from, which does not move as the review commits."

jq empty "$LEDGER" 2>/dev/null || block "$LEDGER is not valid JSON."

# Shape before content.
#
# Every content check below reads a jq expression into a variable and treats an
# empty result as "nothing wrong". When the ledger had a shape jq could not
# walk -- instruments as an object, or the whole file a bare array -- jq errored
# to stderr, the variable came back empty, and the review passed on the strength
# of a question that was never answered.
jq -e 'type == "object"' "$LEDGER" >/dev/null 2>&1 \
  || block "$LEDGER must be a JSON object."
jq -e '(.instruments | type) == "array"' "$LEDGER" >/dev/null 2>&1 \
  || block "$LEDGER needs an \"instruments\" array, one row per id in .review/instruments.json."
jq -e '((.findings // []) | type) == "array"' "$LEDGER" >/dev/null 2>&1 \
  || block "$LEDGER needs \"findings\" to be an array (or absent when there were none)."

# The count lives in the marker and is scoped to the ledger it was counting.
#
# It used to live in its own file, and a count left behind by an abandoned
# review carried into the next one -- which then got a single block and was
# released as "not verified after 5 attempts", a claim that was simply untrue.
# A new review writes a new ledger, so a different path here means a different
# review and the count starts again.
PREV_COUNT=$(awk '{print $1}' .review/active 2>/dev/null)
PREV_LEDGER=$(awk '{print $2}' .review/active 2>/dev/null)
STARTED=$(awk '{print $3}' .review/active 2>/dev/null)
case "$PREV_COUNT" in
  ''|*[!0-9]*) PREV_COUNT=0 ;;
esac
case "$STARTED" in
  ''|*[!0-9]*) STARTED=$(mtime .review/active) ;;
esac
[ "$PREV_LEDGER" = "$LEDGER" ] && ATTEMPTS="$PREV_COUNT"

# The ledger has to have been written by THIS review.
#
# Ledgers are tracked and accumulate, and the fallback picks the newest file on
# disk -- so a review that wrote nothing at all was quietly verified against
# somebody else's months-old ledger and passed. The marker records when the
# review opened; a ledger older than that belongs to an earlier one.
if [ "$(mtime "$LEDGER")" -lt "$STARTED" ]; then
  block "$LEDGER was written before this review opened, so it belongs to an earlier one. Write a ledger for this review."
fi

# bullets indents a list of ids for the refusal message. One helper rather than
# the same sed spelled out at each call site.
bullets() { while IFS= read -r line; do [ -n "$line" ] && printf '  - %s\n' "$line"; done; }

PROBLEMS=""

# --- 1. every instrument accounted for -------------------------------------
MISSING=$(jq -r --slurpfile l "$LEDGER" '
  [.instruments[].id] - [$l[0].instruments[]?.id] | .[]' .review/instruments.json)
[ -n "$MISSING" ] && PROBLEMS="${PROBLEMS}Instruments with no status in the ledger:\n$(echo "$MISSING" | bullets)\n\n"

BAD=$(jq -r '.instruments[]?
  | select((.status != "applied" and .status != "na")
      or (.status == "na" and ((.why // "") | length) < 3)
      or (.status == "applied" and ((.evidence // "") | length) < 3))
  | .id' "$LEDGER")
[ -n "$BAD" ] && PROBLEMS="${PROBLEMS}Instruments needing a real status ('applied' with evidence, or 'na' with why):\n$(echo "$BAD" | bullets)\n\n"

# --- 2. every finding carries a replayable control --------------------------
NOCTRL=$(jq -r '.findings[]?
  | select(((.control.patch // "") | length) < 3
      or ((.control.runner // "") | length) < 2
      or ((.control.tests // []) | length) == 0)
  | .id' "$LEDGER")
[ -n "$NOCTRL" ] && PROBLEMS="${PROBLEMS}Findings with no replayable control (need control.patch, control.runner, control.tests):\n$(echo "$NOCTRL" | bullets)\n\n"

[ -n "$PROBLEMS" ] && block "$PROBLEMS"

# --- 3. replay each control in a throwaway worktree -------------------------
COUNT=$(jq -r '(.findings // []) | length' "$LEDGER")
if [ "$COUNT" -gt 0 ]; then
  git worktree prune >/dev/null 2>&1
  WTBASE=$(mktemp -d "${TMPDIR:-/tmp}/review-replay.XXXXXX")
  WT="$WTBASE/wt"
  # shellcheck disable=SC2329  # invoked by the EXIT trap below
  cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1; rm -rf "$WTBASE"; git worktree prune >/dev/null 2>&1; }
  trap cleanup EXIT INT TERM

  # LFS smudge is skipped: a control replays source, and one missing LFS
  # object on the server would otherwise fail the whole checkout.
  WT_ERR=$(GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach "$WT" "$HEAD_SHA" 2>&1) \
    || block "Could not create a worktree to replay the controls in:\n$WT_ERR"
  [ -d frontend/node_modules ] && ln -s "$ROOT/frontend/node_modules" "$WT/frontend/node_modules" 2>/dev/null

  RUNLOG="$WTBASE/run.log"

  # run_bounded SECONDS CMD... -> exit status, 124 if it had to be stopped.
  # There is no timeout(1) on a stock macOS, so this is it.
  run_bounded() {
    local limit="$1"; shift
    "$@" >"$RUNLOG" 2>&1 &
    local pid=$! waited=0
    while kill -0 "$pid" 2>/dev/null; do
      if [ "$waited" -ge "$limit" ]; then
        kill -TERM "$pid" 2>/dev/null; sleep 1; kill -KILL "$pid" 2>/dev/null
        wait "$pid" 2>/dev/null
        return 124
      fi
      sleep 1; waited=$((waited + 1))
    done
    wait "$pid"
  }

  # run_control_tests RUNNER SELECTOR -> exit status, output in $RUNLOG.
  run_control_tests() {
    case "$1" in
      go)     run_bounded "$RUN_LIMIT" bash -c "cd '$WT/backend'  && go test $2 -count=1" ;;
      vitest) run_bounded "$RUN_LIMIT" bash -c "cd '$WT/frontend' && npx vitest run $2" ;;
      pytest) run_bounded "$RUN_LIMIT" bash -c "cd '$WT'          && python3 -m pytest -q $2" ;;
      *)      return 127 ;;
    esac
  }

  # A non-zero exit is not proof a test failed. A package that will not compile
  # and a suite that cannot start both exit non-zero too, and a control patch
  # that mangles a file rather than reverting a fix would otherwise be accepted
  # as though it had proved something. So the output has to show a real test
  # failing: Go prints "--- FAIL:" only for an actual failing test (a build
  # error prints "[build failed]" instead), and vitest's summary counts them.
  saw_a_real_failure() {
    case "$1" in
      go)     grep -q -- "--- FAIL:" "$RUNLOG" ;;
      vitest) grep -qE "Tests .*[0-9]+ failed" "$RUNLOG" ;;
      # pytest counts "1 failed" for a real assertion failure and "1 error" for
      # a file it could not import or collect, so a patch that breaks the module
      # never reads as a test that failed. Checked against pytest 8.4.
      pytest) grep -qE "[0-9]+ failed" "$RUNLOG" ;;
      *)      return 1 ;;
    esac
  }

  BLIND=""
  for i in $(seq 0 $((COUNT - 1))); do
    FID=$(jq -r ".findings[$i].id" "$LEDGER")
    PATCHFILE=$(jq -r ".findings[$i].control.patch" "$LEDGER")
    RUNNER=$(jq -r ".findings[$i].control.runner" "$LEDGER")

    # Repo-relative, and inside the controls directory. An absolute path was
    # silently glued onto the repo root and then reported as "does not apply",
    # which points at the patch instead of at the path.
    case "$PATCHFILE" in
      .review/controls/*) ;;
      *) BLIND="${BLIND}  - ${FID}: control patch must be a repo-relative path under .review/controls/, not '${PATCHFILE}'\n"; continue ;;
    esac
    case "$PATCHFILE" in
      *..*) BLIND="${BLIND}  - ${FID}: control patch path may not climb out of .review/controls/\n"; continue ;;
    esac
    [ -f "$PATCHFILE" ] || { BLIND="${BLIND}  - ${FID}: control patch ${PATCHFILE} does not exist\n"; continue; }

    while IFS= read -r SEL; do
      [ -z "$SEL" ] && continue

      # Both sides, and the baseline first.
      #
      # Without it, "the test failed" and "the test could not run" are the same
      # exit status, so a patch that breaks the build -- or a frontend whose
      # node_modules link did not resolve -- looked exactly like a control that
      # held. That accepted a control proving nothing, which is the one outcome
      # this hook exists to prevent.
      if [ "$(elapsed)" -ge "$DEADLINE" ]; then
        block "Verification ran past ${DEADLINE}s and stopped at ${FID}. It refuses rather than being killed part-way with nothing decided. Narrow the test selectors, or split the review."
      fi

      run_control_tests "$RUNNER" "$SEL"
      BASELINE=$?
      if [ "$BASELINE" -eq 124 ]; then
        BLIND="${BLIND}  - ${FID}: '${SEL}' was still running after ${RUN_LIMIT}s at HEAD and was stopped, so nothing can be concluded from it\n"
        continue
      fi
      if [ "$BASELINE" -eq 127 ]; then
        BLIND="${BLIND}  - ${FID}: unknown runner '${RUNNER}'\n"
        continue
      fi
      if [ "$BASELINE" -ne 0 ]; then
        BLIND="${BLIND}  - ${FID}: '${SEL}' does not pass at ${HEAD_SHA:0:9} before the patch is applied, so a failure afterwards would prove nothing (broken selector, or the test cannot build or run here)\n"
        continue
      fi

      if ! git -C "$WT" apply "$ROOT/$PATCHFILE" 2>/dev/null; then
        BLIND="${BLIND}  - ${FID}: control patch does not apply to ${HEAD_SHA:0:9}\n"
        continue
      fi
      run_control_tests "$RUNNER" "$SEL"
      PATCHED=$?
      if [ "$PATCHED" -eq 124 ]; then
        git -C "$WT" apply -R "$ROOT/$PATCHFILE" 2>/dev/null
        BLIND="${BLIND}  - ${FID}: '${SEL}' was still running after ${RUN_LIMIT}s with the patch applied and was stopped -- a test that hangs is not a test that failed\n"
        continue
      fi
      # Reversed rather than checked out, so a patch that adds a file is undone
      # too and nothing leaks into the next finding.
      # If the revert fails the patch stays applied, and the next finding is
      # measured against a tree that is still broken -- which shows up as that
      # finding's baseline failing, a diagnosis pointing at the wrong control.
      if ! git -C "$WT" apply -R "$ROOT/$PATCHFILE" 2>/dev/null; then
        BLIND="${BLIND}  - ${FID}: control patch applied but could not be reversed, so the replay tree is no longer trustworthy for the findings after it\n"
        break
      fi

      if [ "$PATCHED" -eq 0 ]; then
        BLIND="${BLIND}  - ${FID}: '${SEL}' still PASSES with the fix reverted -- it is not testing the fix\n"
      elif ! saw_a_real_failure "$RUNNER"; then
        BLIND="${BLIND}  - ${FID}: '${SEL}' did not pass with the patch applied, but no test actually failed -- the patch breaks the build or stops the suite starting rather than reverting a fix, so it proves nothing\n"
      fi
    done < <(jq -r ".findings[$i].control.tests[]" "$LEDGER")
  done

  [ -n "$BLIND" ] && block "Controls replayed against ${HEAD_SHA:0:9}. These did not hold:\n${BLIND}\nA control passes only when the test PASSES at HEAD and FAILS with its fix reverted."
fi

rm -f .review/active
echo "Review ledger verified: $(jq -r '.instruments | length' "$LEDGER") instruments accounted for, ${COUNT} control(s) replayed and held." >&2
exit 0
