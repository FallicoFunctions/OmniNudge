---
name: review
description: Review the work in this session against every instrument in .review/instruments.json, in order, then fix what it finds. Use when asked to review, to review in a loop, to check the work, or to look for what was missed. Produces a ledger the Stop hook verifies.
---

# Review

A review is not re-reading the diff. Re-reading the diff finds the things that
are wrong on the page. Almost nothing is wrong on the page.

Every finding worth having came from one move: **assemble the artifact that
crosses a boundary, then read it.** The built prompt. The rendered markup. The
response body. The negative prompt. The row that was written. Read the thing the
consumer receives, not the code that makes it.

## The loop

**A review is not one pass.** It repeats until a full pass over every
instrument finds nothing.

A pass that finds something is evidence the pass before it was not finished:
the fix is new code nobody has reviewed, and the technique that found it may
find more of the same. So a pass with findings is always followed by another
full pass. There is no budget. If it takes twenty passes, it takes twenty.

**Do not stop to ask whether to go again.** Being told "review again" and then
finding something is proof the loop terminated early. The stopping condition is
evidence, not the sense of having done enough. The hook refuses a ledger whose
last pass still has findings, so stopping in the middle is not available.

**When a pass finds something by a technique the list does not name, add that
technique to `.review/instruments.json` before the review ends** and name it in
the finding's `found_by`. This is the ratchet, and it is why the list is worth
having: without it every review re-invents its own instruments and finds what
the last one had no way to look for. The hook refuses a finding whose
`found_by` is not a real instrument id.

## The rules

1. **Work `.review/instruments.json` in order.** Every id gets a status:
   `applied` with evidence, or `na` with a reason. Never skip one silently. If an
   instrument does not apply, saying why takes five seconds and is the record
   that it was considered.
2. **Read the prior ledgers first (A2).** They are in `.review/`. Without this
   the same finding is discovered, fixed and re-fixed across sessions. That has
   already happened.
3. **Control every fix (G1).** Revert the fix, run the new test, and require it
   to **fail**. Save the reverting change as a patch under `.review/controls/`.
   A control that passes is itself a finding: the test was blind.
4. **Never write an unfixed security weakness into the ledger.** This
   repository is public and the ledger is tracked, so a row saying a weakness
   exists and is open is a disclosure. A weakness that has been fixed is
   already visible in the commit that fixed it, so record those normally.
   For anything found and not yet fixed: fix it in the same session, or tell
   the user in the session and leave it out of the file.
5. **Do not run the whole suite until the review is done.** Build, report, then
   test.
6. **Write the ledger as you go**, not at the end. It is the deliverable, not the
   paperwork.

## How to run it

**Open the review.** `: > .review/active` -- truncated, not touched, so the
attempt count starts clean. The Stop hook will not let the session finish until
the ledger is complete and the controls hold. Each refusal says which attempt
it is; after the last one it releases the review and tells you to report that
it was never verified, so a ledger you cannot satisfy ends the turn honestly
instead of looping.

**Work the list.** For each instrument in `.review/instruments.json`, ask its
question. Record what you did and what it showed. Instruments B1-B4 mean *print
the real artifact and read it* -- write a throwaway test or a small script that
emits it, look at the output, then delete the throwaway.

**Fix what you find, immediately**, unless the user asked for findings only.

**Build each control.** Edit the file to undo the fix, `git diff >
.review/controls/<id>.patch`, then `git checkout` the file. Confirm by hand that
the named tests fail with it applied -- and that they fail as tests, with a real
assertion failure, not because the patch stopped the code compiling.

**Write the ledger** as you go, one entry in `passes` per pass, to
`.review/<base-sha>.json` -- the commit the review
started from, which does not move as the review commits. The shape is in
`.review/ledger.schema.json`.

Runners are `go`, `vitest` and `pytest`. Keep the test selectors narrow: the
hook runs each one **twice**, once at HEAD and once with the patch applied. It requires the test to pass at HEAD and then
to produce a real failure -- so a control patch must revert a fix, not break the
build. A patch that stops the package compiling is rejected, because a suite
that cannot run is not a test that failed.

**Commit in scopes**, then finish. The hook replays every control in a throwaway
git worktree and blocks the stop if any still passes.

## The hook has its own tests

`.claude/hooks/review-ledger-verify.test.sh` -- 31 cases, every one of them a
defect that was once live, or a behaviour that must keep working. Run it after
any change to the hook, and read the result rather than assuming it.

It has been mutation-tested: breaking the shape checks, the real-failure
marker, the staleness check, the attempt limit, or restoring the
stop_hook_active bypass each turns it red, on the matching case. A checker
nobody can re-run is a claim, not a check -- which is what this was for six
passes.

## What the hook can and cannot do

It checks that every instrument has a verdict, that every finding has a control,
and that every control genuinely fails when replayed. It cannot tell whether an
`na` was honest or whether an instrument was applied with any care. Those stay
yours.
