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

# node_modules is gitignored, so a fresh worktree has none and the hook finds
# nothing to link into its replay tree -- which makes every vitest control fail
# its baseline for a reason that has nothing to do with the control. Borrow the
# real one; it is only ever read.
[ -d "$REPO/frontend/node_modules" ] && ln -s "$REPO/frontend/node_modules" "$SANDBOX/frontend/node_modules" 2>/dev/null

instruments() { # instruments(): every id, accounted for
  jq -c '[.instruments[] | {id: .id, status: "na", why: "test fixture"}]' .review/instruments.json
}
instruments_missing_one() {
  jq -c '[.instruments[] | select(.id != "E1") | {id: .id, status: "na", why: "test fixture"}]' .review/instruments.json
}

# ledger PATH INSTRUMENTS_JSON FINDINGS_JSON
#
# Writes the shape a finished review has: the findings on a first pass, then a
# second pass over every instrument that found nothing. A review ends on a clean
# pass, so a fixture without one is not a finished review.
ledger() {
  jq -n --argjson i "$2" --argjson f "$3" --arg h "$H" \
    '{schema_version:2, head:$h, base:$h, scope:{files:[],boundaries:[]},
      prior_ledgers_read:[],
      passes: [{pass:1, instruments:$i, findings:$f},
               {pass:2, instruments:$i, findings:[]}],
      gates:{}}' > "$1"
}

# ledger_passes PATH PASSES_JSON -- for the cases that are about the loop itself
ledger_passes() {
  jq -n --argjson p "$2" --arg h "$H" \
    '{schema_version:2, head:$h, base:$h, scope:{files:[],boundaries:[]},
      prior_ledgers_read:[], passes:$p, gates:{}}' > "$1"
}

open_review() {
  rm -f .review/*.json
  git checkout -- .review/instruments.json .review/ledger.schema.json 2>/dev/null
  : > .review/active
  sleep 1
}

# expect NAME EXPECTED_EXIT [SUBSTRING]
# expect NAME EXPECTED_EXIT [SUBSTRING]; honours REVIEW_DEADLINE / REVIEW_RUN_LIMIT
# set in front of the call, so the bounds can be driven without waiting them out.
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
# A vitest control: revert the typography fold, so a curly apostrophe stops
# being folded and name.test.ts fails as a test.
make_vitest_patch() {
  python3 - "$1" <<'PYV'
import subprocess, sys
p = 'frontend/src/components/omnichat/omniai/name.ts'
src = open(p).read()
cut = '  for (const [pattern, replacement] of TYPOGRAPHY) name = name.replace(pattern, replacement);\n'
if cut not in src:
    sys.exit("fixture drift: the typography fold moved")
open(p, 'w').write(src.replace(cut, '', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PYV
}

# A pytest control: make the worker claim a reference unconditionally again.
make_pytest_patch() {
  python3 - "$1" <<'PYP'
import subprocess, sys
p = 'infra/runpod/omnichat_worker/generators.py'
src = open(p).read()
if '        if has_reference:' not in src:
    sys.exit("fixture drift: the conditional reference clause moved")
open(p, 'w').write(src.replace('        if has_reference:', '        if True:', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PYP
}

# Patches that break the module rather than reverting a fix. Each runner has to
# tell "a test failed" apart from "the code would not load": pytest reports
# "1 error", vitest reports "no tests". Without a case per runner, the marker
# that makes that distinction can be deleted and nothing goes red -- which is
# exactly what a mutation test found.
make_broken_vitest_patch() {
  python3 - "$1" <<'PYBV'
import subprocess, sys
p = 'frontend/src/components/omnichat/omniai/name.ts'
src = open(p).read()
open(p, 'w').write(src.replace('export function normalizeOmniAIName', 'export function ((( normalizeOmniAIName', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PYBV
}
make_broken_pytest_patch() {
  python3 - "$1" <<'PYBP'
import subprocess, sys
p = 'infra/runpod/omnichat_worker/generators.py'
src = open(p).read()
open(p, 'w').write(src.replace('def build_image_prompt(', 'def build_image_prompt(((', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff'], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PYBP
}

control() { jq -n --arg p "$1" --arg r "$2" --arg t "$3" \
  '[{id:"T", summary:"s", found_by:"A1", fix_commit:"x", control:{patch:$p, runner:$r, tests:[$t], observed:"by hand"}}]'; }

echo "review-ledger-verify.sh"
echo
echo "no review open"
rm -f .review/active
expect "exits silently when no review is open" 0

echo
echo "completeness"
open_review; ledger ".review/${H}.json" "$(instruments)" '[]'
expect "a complete ledger with no findings passes" 0 "the last finding nothing"
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
expect "a ledger not named after HEAD is still found" 0 "the last finding nothing"
open_review; ledger .review/old.json "$(instruments)" '[]'; touch -t 202001010000 .review/old.json
ledger .review/new.json "$(instruments_missing_one)" '[]'
expect "the newest ledger wins, not the valid one" 2 "E1"

echo
echo "shape before content"
open_review; echo '[1,2,3]' > ".review/${H}.json"
expect "a bare array blocks" 2 "must be a JSON object"
open_review; jq -n '{schema_version:2, passes:[{pass:1, instruments:{A1:"na"}, findings:[]}]}' > ".review/${H}.json"
expect "instruments as an object blocks" 2 "instruments"
open_review; ledger ".review/${H}.json" "$(instruments)" '[]'
jq '.passes[0].findings = {x:1}' ".review/${H}.json" > "$SANDBOX_BASE/l.json" && mv "$SANDBOX_BASE/l.json" ".review/${H}.json"
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
open_review; ledger ".review/${H}.json" "$(instruments)" '[{"id":"T","summary":"s","found_by":"A1","fix_commit":"x","control":{}}]'
expect "a finding with no control blocks" 2 "no replayable control"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(jq -n --arg p .review/controls/tst-real.patch \
     '[{id:"A",summary:"s",found_by:"A1",fix_commit:"x",control:{patch:$p,runner:"go",tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"],observed:"x"}},
       {id:"B",summary:"s",found_by:"A1",fix_commit:"x",control:{patch:$p,runner:"go",tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"],observed:"x"}}]')"
expect "two findings sharing a patch both hold (the revert works)" 0 "2 control(s)"

echo
echo "the bash runner"
# A shell script is code, and a finding in one has to be recordable. The guard
# hook's own suite is the fixture: it is real, it is fast, and it prints a
# count.
make_broken_guard_patch() {
  python3 - "$1" <<'PYBG'
import subprocess, sys
p = '.claude/hooks/block-destructive.sh'
src = open(p).read()
cut = 'TARGET=${TARGET//\\"/}\n'
if cut not in src:
    sys.exit("fixture drift: quote stripping moved")
open(p, 'w').write(src.replace(cut, '', 1))
open(sys.argv[1], 'w').write(subprocess.run(['git','diff','--',p], capture_output=True, text=True).stdout)
subprocess.run(['git','checkout','--',p], check=True)
PYBG
}
make_broken_guard_patch .review/controls/tst-bash.patch
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-bash.patch bash '.claude/hooks/block-destructive.test.sh')"
expect "a bash control holds" 0 "control(s) replayed and held"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-bash.patch bash 'true')"
expect "a bash control that cannot fail is caught" 2 "still PASSES"

echo
echo "the loop has to run itself out"
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" '[{pass:1, instruments:$i, findings:[]}]')"
expect "one clean pass is a finished review" 0 "the last finding nothing"
open_review
make_real_patch .review/controls/tst-loop.patch
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" --arg p .review/controls/tst-loop.patch \
     '[{pass:1, instruments:$i, findings:[{id:"L", summary:"s", found_by:"A1", fix_commit:"x",
        control:{patch:$p, runner:"go", tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"], observed:"x"}}]}]')"
expect "stopping while the last pass still found things blocks" 2 "the review is not finished"
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" --arg p .review/controls/tst-loop.patch \
     '[{pass:1, instruments:$i, findings:[{id:"L", summary:"s", found_by:"A1", fix_commit:"x",
        control:{patch:$p, runner:"go", tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"], observed:"x"}}]},
       {pass:2, instruments:$i, findings:[]}]')"
expect "a pass with findings followed by a clean one passes" 0 "2 pass(es)"
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" --argjson j "$(instruments_missing_one)" \
     '[{pass:1, instruments:$i, findings:[]}, {pass:2, instruments:$j, findings:[]}]')"
expect "a later pass may not skip an instrument" 2 "pass 2: E1"
open_review; ledger_passes ".review/${H}.json" "$(jq -n '[]')"
expect "no passes at all blocks" 2 "not one pass"

echo
echo "the ratchet"
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" --arg p .review/controls/tst-loop.patch \
     '[{pass:1, instruments:$i, findings:[{id:"R", summary:"s", found_by:"a technique with no row", fix_commit:"x",
        control:{patch:$p, runner:"go", tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"], observed:"x"}}]},
       {pass:2, instruments:$i, findings:[]}]')"
expect "a finding found by no listed instrument blocks" 2 "found_by"
open_review; ledger_passes ".review/${H}.json" \
  "$(jq -n --argjson i "$(instruments)" --arg p .review/controls/tst-loop.patch \
     '[{pass:1, instruments:$i, findings:[{id:"R", summary:"s", fix_commit:"x",
        control:{patch:$p, runner:"go", tests:["./internal/services/ -run TestADescriptionNeverRunsIntoTheFraming"], observed:"x"}}]},
       {pass:2, instruments:$i, findings:[]}]')"
expect "a finding with no found_by at all blocks" 2 "found_by"

echo
echo "the other two runners"
make_vitest_patch .review/controls/tst-vitest.patch
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-vitest.patch vitest 'src/components/omnichat/omniai/__tests__/name.test.ts')"
expect "a vitest control holds" 0 "control(s) replayed and held"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-vitest.patch vitest 'src/components/omnichat/omniai/__tests__/refusals.test.ts')"
expect "a blind vitest control is caught" 2 "still PASSES"
make_broken_vitest_patch .review/controls/tst-vitest-broken.patch
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-vitest-broken.patch vitest 'src/components/omnichat/omniai/__tests__/name.test.ts')"
expect "a vitest patch that breaks the module is caught" 2 "no test actually failed"

if python3 -m pytest --version >/dev/null 2>&1; then
  make_pytest_patch .review/controls/tst-pytest.patch
  open_review; ledger ".review/${H}.json" "$(instruments)" \
    "$(control .review/controls/tst-pytest.patch pytest 'infra/runpod/omnichat_worker/test_generators.py -k no_reference_is_claimed')"
  expect "a pytest control holds" 0 "control(s) replayed and held"
  open_review; ledger ".review/${H}.json" "$(instruments)" \
    "$(control .review/controls/tst-pytest.patch pytest 'infra/runpod/omnichat_worker/test_contract.py')"
  expect "a blind pytest control is caught" 2 "still PASSES"
  make_broken_pytest_patch .review/controls/tst-pytest-broken.patch
  open_review; ledger ".review/${H}.json" "$(instruments)" \
    "$(control .review/controls/tst-pytest-broken.patch pytest 'infra/runpod/omnichat_worker/test_generators.py -k no_reference_is_claimed')"
  expect "a pytest patch that breaks the module is caught" 2 "no test actually failed"
else
  # Said out loud rather than skipped quietly: an unverified runner that nobody
  # is told about is the same as one that was never tested.
  echo "  SKIP  the two pytest cases -- 'python3 -m pytest' is not available here,"
  echo "        so pytest controls cannot run on this machine either. Install"
  echo "        pytest (plus pillow and numpy for the worker suite) to cover them."
fi

echo
echo "running out of time is not a way to pass"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch go './internal/services/ -run TestADescriptionNeverRunsIntoTheFraming')"
REVIEW_DEADLINE=0 expect "an overall deadline refuses instead of overrunning" 2 "ran past"
open_review; ledger ".review/${H}.json" "$(instruments)" \
  "$(control .review/controls/tst-real.patch go './internal/services/ -run TestADescriptionNeverRunsIntoTheFraming')"
REVIEW_RUN_LIMIT=1 expect "a test that will not finish is stopped, not believed" 2 "was still running"

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
