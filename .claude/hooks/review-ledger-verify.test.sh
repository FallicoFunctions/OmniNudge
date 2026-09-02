#!/bin/bash
# Tests for review-ledger-verify.sh.
#
# Every case here is one that was found by hand, in six separate passes, and
# then thrown away. That was the real defect: the checker was trusted on the
# strength of ad-hoc terminal runs nobody could repeat. Each case below is
# something that once passed and should not have, or something that must keep
# working.
#
# Run: .claude/hooks/review-ledger-verify.test.sh
# Needs: jq, git, go. Uses the repository it lives in, read-only, and writes
# only inside a scratch .review fixture that it restores on exit.

set -uo pipefail
REPO=$(git rev-parse --show-toplevel) || exit 1
cd "$REPO" || exit 1

# The hook under test is the working copy, not whatever is committed.
HOOK="$REPO/.claude/hooks/review-ledger-verify.sh"
PASS=0; FAIL=0; FAILED_NAMES=""
H=$(git rev-parse HEAD)

# Everything runs in a throwaway worktree, never in the real repository.
#
# The first version of this suite worked in the project's own .review/, and
# opening a test review deleted every ledger there while the teardown restored
# only two files. Tracked ledgers would have been destroyed by running the
# tests, and two copies running at once corrupted each other -- which is how
# this was noticed. A test that can damage what it is testing is not a test.
SANDBOX_BASE=$(mktemp -d "${TMPDIR:-/tmp}/review-test.XXXXXX")
SANDBOX="$SANDBOX_BASE/wt"
restore() {
  git -C "$REPO" worktree remove --force "$SANDBOX" >/dev/null 2>&1
  rm -rf "$SANDBOX_BASE"
  git -C "$REPO" worktree prune >/dev/null 2>&1
}
trap restore EXIT
GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach "$SANDBOX" "$H" >/dev/null 2>&1 \
  || { echo "could not create the sandbox worktree"; exit 1; }
cd "$SANDBOX" || exit 1
export CLAUDE_PROJECT_DIR="$SANDBOX"

instruments() { # instruments(): every id, accounted for
  jq -c '[.instruments[] | {id: .id, status: "na", why: "test fixture"}]' .review/instruments.json
}
instruments_missing_one() {
  jq -c '[.instruments[] | select(.id != "E1") | {id: .id, status: "na", why: "test fixture"}]' .review/instruments.json
}

# ledger PATH INSTRUMENTS_JSON FINDINGS_JSON
ledger() {
  jq -n --argjson i "$2" --argjson f "$3" --arg h "$H" \
    '{schema_version:1, head:$h, base:$h, scope:{files:[],boundaries:[]},
      prior_ledgers_read:[], instruments:$i, findings:$f, gates:{}}' > "$1"
}

open_review() {
  rm -f .review/*.json
  git checkout -- .review/instruments.json .review/ledger.schema.json 2>/dev/null
  : > .review/active
  sleep 1
}

# expect NAME EXPECTED_EXIT [SUBSTRING]
expect() {
  local name="$1" want="$2" needle="${3:-}"
  local out code
  out=$(echo '{}' | "$HOOK" 2>&1); code=$?
  if [ "$code" -ne "$want" ]; then
    FAIL=$((FAIL+1)); FAILED_NAMES="${FAILED_NAMES}
  - ${name}: expected exit ${want}, got ${code}"
    printf '  FAIL  %s (exit %s, wanted %s)\n' "$name" "$code" "$want"; return
  fi
  if [ -n "$needle" ] && ! printf '%s' "$out" | grep -qF -- "$needle"; then
    FAIL=$((FAIL+1)); FAILED_NAMES="${FAILED_NAMES}
  - ${name}: exit was right but the message never mentioned '${needle}'"
    printf '  FAIL  %s (message missing %s)\n' "$name" "$needle"; return
  fi
  PASS=$((PASS+1)); printf '  ok    %s\n' "$name"
}

# A control patch that genuinely reverts a fix: the sentence terminator in the
# OmniAI prompt joiner. Its test fails as a test when this is applied.
make_real_patch() {
  python3 - "$1" <<'PY'
import subprocess, sys
p = 'backend/internal/services/omnichat_omniai_likeness_prompt.go'
src = open(p).read()
cut = """		if last := sentence[len(sentence)-1]; last != '.' && last != '!' && last != '?' {
			sentence += "."
		}
"""
if cut not in src:
    sys.exit("fixture drift: the joiner's terminator is no longer where this test expects it")
open(p, 'w').write(src.replace(cut, '', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PY
}
# A patch that breaks the build instead of reverting anything.
make_broken_patch() {
  python3 - "$1" <<'PY'
import subprocess, sys
p = 'backend/internal/services/omnichat_omniai_creation.go'
src = open(p).read()
open(p, 'w').write(src.replace('package services', 'package services\nthis is not valid go', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PY
}
control() { jq -n --arg p "$1" --arg r "$2" --arg t "$3" \
  '[{id:"T", summary:"s", fix_commit:"x", control:{patch:$p, runner:$r, tests:[$t], observed:"by hand"}}]'; }

echo "review-ledger-verify.sh"
echo
echo "no review open"
rm -f .review/active
expect "exits silently when no review is open" 0

echo
echo "completeness"
open_review; ledger ".review/${H}.json" "$(instruments)" '[]'
expect "a complete ledger with no findings passes" 0 "instruments accounted for"
open_review; ledger ".review/${H}.json" "$(instruments_missing_one)" '[]'
expect "an unaccounted instrument blocks" 2 "E1"
open_review; ledger ".review/${H}.json" "$(jq -c '[.instruments[] | {id:.id, status:"na", why:""}]' .review/instruments.json)" '[]'
expect "an 'na' with no reason blocks" 2 "real status"
open_review; ledger ".review/${H}.json" "$(jq -c '[.instruments[] | {id:.id, status:"applied", evidence:""}]' .review/instruments.json)" '[]'
expect "an 'applied' with no evidence blocks" 2 "real status"

echo
echo "the ledger has to be this review's"
open_review; rm -f ".review/${H}.json"
expect "no ledger at all blocks" 2 "No ledger found"
open_review; ledger .review/stale.json "$(instruments)" '[]'; touch -t 202001010000 .review/stale.json
expect "a ledger predating the review blocks" 2 "belongs to an earlier one"
open_review; ledger .review/named-by-base.json "$(instruments)" '[]'
expect "a ledger not named after HEAD is still found" 0 "instruments accounted for"
open_review; ledger .review/old.json "$(instruments)" '[]'; touch -t 202001010000 .review/old.json
ledger .review/new.json "$(instruments_missing_one)" '[]'
expect "the newest ledger wins, not the valid one" 2 "E1"

echo
echo "shape before content"
open_review; echo '[1,2,3]' > ".review/${H}.json"
expect "a bare array blocks" 2 "must be a JSON object"
open_review; jq -n '{schema_version:1, instruments:{A1:"na"}, findings:[]}' > ".review/${H}.json"
expect "instruments as an object blocks" 2 "instruments"
open_review; ledger ".review/${H}.json" "$(instruments)" '[]'
jq '.findings = {x:1}' ".review/${H}.json" > /tmp/l.$$ && mv /tmp/l.$$ ".review/${H}.json"
expect "findings as an object blocks" 2 "findings"
open_review; printf 'not json at all' > ".review/${H}.json"
expect "a ledger that is not JSON blocks" 2 "not valid JSON"

echo
echo "the instrument list itself"
open_review; ledger ".review/${H}.json" "$(instruments)" '[]'
mv .review/instruments.json "$SANDBOX_BASE/hidden.json"
expect "a missing instrument list blocks" 2 "instruments.json is missing"
mv "$SANDBOX_BASE/hidden.json" .review/instruments.json

echo
echo "controls"
make_real_patch .review/controls/tst-real.patch || { echo "  FAIL  fixture"; FAIL=$((FAIL+1)); }
make_broken_patch .review/controls/tst-broken.patch
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch go './internal/services/ -run TestADescriptionNeverRunsIntoTheFraming')"
expect "a control whose test really fails holds" 0 "control(s) replayed and held"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch go './internal/services/ -run TestANameMayBeAName')"
expect "a control on an unrelated test is caught" 2 "still PASSES"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch go './internal/services/ -run TestNoSuchTestExistsHere')"
expect "a control naming no test at all is caught" 2 "still PASSES"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-broken.patch go './internal/services/ -run TestANameMayBeAName')"
expect "a patch that breaks the build is caught" 2 "no test actually failed"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-missing.patch go './internal/services/ -run TestX')"
expect "a control patch that does not exist is caught" 2 "does not exist"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control /etc/passwd go './internal/services/ -run TestX')"
expect "an absolute patch path is named as such" 2 "repo-relative"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control ../../etc/x.patch go './internal/services/ -run TestX')"
expect "a patch path climbing out is named as such" 2 "repo-relative"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch banana './internal/services/ -run TestX')"
expect "an unknown runner is caught" 2 "unknown runner"
open_review; ledger ".review/${H}.json" "$(instruments)" '[{"id":"T","summary":"s","fix_commit":"x","control":{}}]'
expect "a finding with no control blocks" 2 "no replayable control"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(jq -n --arg p .review/controls/tst-real.patch \
     '[{id:"A",summary:"s",fix_commit:"x",control:{patch:$p,runner:"go",tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"],observed:"x"}},
       {id:"B",summary:"s",fix_commit:"x",control:{patch:$p,runner:"go",tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"],observed:"x"}}]')"
expect "two findings sharing a patch both hold (the revert works)" 0 "2 control(s)"

echo
echo "the bounded escape"
open_review; ledger ".review/${H}.json" "$(instruments_missing_one)" '[]'
for n in 1 2 3 4 5; do
  out=$(echo '{}' | "$HOOK" 2>&1); code=$?
  if [ "$code" -ne 2 ] || ! printf '%s' "$out" | grep -qF "attempt $n of 5"; then
    FAIL=$((FAIL+1)); printf '  FAIL  block %s of 5 did not number itself\n' "$n"
  fi
done
[ "$(cat .review/active | awk '{print $1}')" = "5" ] && { PASS=$((PASS+1)); echo "  ok    five blocks, each numbered"; } \
  || { FAIL=$((FAIL+1)); echo "  FAIL  five blocks, each numbered"; }
expect "the sixth releases the review and says it was not verified" 2 "NOT VERIFIED"
[ -f .review/active ] && { FAIL=$((FAIL+1)); echo "  FAIL  the marker is cleared on release"; } \
  || { PASS=$((PASS+1)); echo "  ok    the marker is cleared on release"; }
expect "and the next stop is allowed through" 0

echo
echo "a stale count cannot outlive its review"
open_review; ledger ".review/${H}.json" "$(instruments_missing_one)" '[]'
echo "4 .review/a-different-review.json 1" > .review/active
expect "a count from another review is ignored" 2 "attempt 1 of 5"

echo
echo "another hook blocking first must not let it through"
open_review; ledger ".review/${H}.json" "$(instruments_missing_one)" '[]'
out=$(echo '{"stop_hook_active":true}' | "$HOOK" 2>&1); code=$?
[ "$code" -eq 2 ] && { PASS=$((PASS+1)); echo "  ok    stop_hook_active is deliberately ignored"; } \
  || { FAIL=$((FAIL+1)); echo "  FAIL  stop_hook_active let an unverified review through"; }

echo
echo "outside a git repository"
T=$(mktemp -d "${TMPDIR:-/tmp}/review-nogit.XXXXXX"); mkdir -p "$T/.review/controls"
cp .review/instruments.json "$T/.review/"; : > "$T/.review/active"; sleep 1
ledger "$T/.review/x.json" "$(instruments)" '[]'
out=$(cd "$T" && echo '{}' | CLAUDE_PROJECT_DIR="$T" "$HOOK" 2>&1); code=$?
if [ "$code" -eq 2 ] && printf '%s' "$out" | grep -qF "Could not resolve HEAD"; then
  PASS=$((PASS+1)); echo "  ok    a broken git state blocks rather than passing"
else
  FAIL=$((FAIL+1)); echo "  FAIL  a broken git state did not block (exit $code)"
fi
rm -rf "$T"

echo
printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || { printf 'failed:%s\n' "$FAILED_NAMES"; exit 1; }
