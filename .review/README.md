# Review ledgers

A review writes one ledger here, and the ledger is the evidence that it happened.

`instruments.json` is the canonical list. A review works through it in order and
must account for every id: `applied` with evidence, or `na` with a reason.
Silence is not a status.

`<head-sha>.json` is one review. It records what changed, what each instrument
found, and every finding with its fix.

`controls/` holds one patch per finding. Each patch **reverts that fix**. The
control passes when the named tests **fail** with the patch applied -- that is
what proves the test is not blind. `.claude/hooks/review-ledger-verify.sh`
replays every one of them in a throwaway git worktree before a review may end.

Ledgers are tracked deliberately. They are how a later review knows what an
earlier one already found, so the same finding is not discovered and fixed
twice.
