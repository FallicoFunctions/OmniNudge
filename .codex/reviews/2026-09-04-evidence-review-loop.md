# Evidence Review Loop skill review

Scope: `/Users/Nick_1/.codex/skills/evidence-review-loop`

Controlled inputs: one structurally complete clean ledger and one otherwise identical ledger missing B5. IDs, content, and ordering are deterministic.

Pre-ledger findings fixed before the terminating pass:

- ERL-001: ambiguous relative validator command. Old command failed from the workspace; the absolute skill command succeeded.
- ERL-002: cost-based B5 waiver was accepted. Controlled at `/tmp/evidence-review-loop-control.0D8TH7/control-prohibited-na.patch`.
- ERL-003: a findings pass could waive controls. Controlled at `/tmp/evidence-review-loop-control.0D8TH7/control-waived-controls.patch`.
- ERL-004: Z1 prose conflicted with unknown-row rejection. The protocol now assigns additional techniques to Z1 prose rather than invented table IDs.
- ERL-005: a broad keyword scan rejected valid evidence saying a guard “blocked” an attack. Controlled at `/tmp/evidence-review-loop-control.nNJWcp/control-false-positive.patch`.
- ERL-006: protocol IDs were duplicated in code. The validator now loads the protocol as its source of truth. Controlled at `/tmp/evidence-review-loop-control.xppdMC/control-protocol-source.patch`.
- ERL-007: a shell-escaped differential input failed to remove B5. Printing the built input exposed it; the corrected input produced exit 1 and a B5 error.
- ERL-008: Python bytecode caches were present in the skill. Only the generated `__pycache__` files were removed.
- ERL-009: Ruff found an import-layout violation. Controlled at `/tmp/evidence-review-loop-control.zeySPF/control-import-lint.patch`; the compiling negative copy failed by assertion on Ruff's exit code.

The terminating pass begins after all fixes above.

Process/build stamps: fresh Python processes with `PYTHONDONTWRITEBYTECODE=1`; CPython 3.13 system executable; Ruff at `/Users/Nick_1/opt/miniconda3/bin/ruff`; skill validator run through an ephemeral `uv` environment containing PyYAML.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Enumerated all five shipped files: SKILL, protocol, UI metadata, validator, and tests; confirmed no cache/build artifacts. |
| A2 | applied | Re-read the supplied sibling-repository protocol, skill-creator instructions, and all pre-ledger findings before source inspection. |
| B1 | applied | Materialized a complete 28-row ledger and a controlled counterpart differing only by removal of B5. |
| B2 | na | This skill produces no rendered markup, scene, image, or loaded visual state; its concrete output is CLI text covered by B3/B5. |
| B3 | applied | Observed peer-visible CLI output: clean input emitted `OK`; missing-B5 input emitted the precise B5 error. |
| B4 | na | The validator performs no SQL, object-store, or durable application writes; it only reads local protocol and ledger files. |
| B5 | applied | Ran the installed validator itself: complete input exited 0, otherwise-identical missing-B5 input exited 1. |
| C1 | applied | Loaded and printed all 28 IDs directly from protocol.md; the validator has no duplicated hardcoded ID list. |
| C2 | applied | Subprocess tests and direct runs confirmed stdout and exit-code shapes expected by callers. |
| C3 | applied | Internal `validate()` and real CLI subprocess paths agree for clean, incomplete, and unverified-final inputs. |
| C4 | na | The skill has no worker, provider, network, credit, retry, or cancellation integration. |
| C5 | applied | Traced protocol IDs into `required_ids`, table validation, errors, CLI exit, tests, SKILL routing, and automatic UI metadata. |
| D1 | applied | A complete one-pass ledger and a findings pass followed by a clean pass both succeed. |
| D2 | applied | Missing instruments, unknown rows, prohibited cost waiver, waived controls, and an unverified final pass all fail closed. |
| D3 | applied | Zero-pass input fails, one complete pass succeeds, and duplicate/missing rows fail; pass count intentionally has no maximum. |
| E1 | applied | Compared the Codex skill against the supplied Claude workflow; preserved boundary artifacts, controls, process freshness, controlled inputs, F3 NA, and termination semantics. |
| E2 | applied | Acceptance and rejection branches are each reached by named tests and direct CLI differentials. |
| E3 | applied | Validation errors are accumulated, printed to stdout, and produce exit 1; file-open argument errors produce argparse exit 2. |
| E4 | applied | `agents/openai.yaml` retains default implicit invocation and declares no unavailable external dependency. |
| E5 | applied | Protocol is the single instrument source; search found no second validator ID list or generated cache files. |
| F1 | na | Each invocation is a stateless single-process read with no threads, shared mutable state, or concurrency boundary. |
| F2 | na | No transactions, locks, atomic publication, or partial multi-write operation exists in this validator. |
| F3 | na | This standalone personal skill has no database schema or migration ladder. |
| F4 | applied | Repeated the complete 11-test suite in fresh processes; both runs produced identical results and left no cache artifacts. |
| G1 | applied | All behavioral fixes have compiling assertion-failing controls in the four recorded disposable control directories; the lint fix also has an assertion-based Ruff control. |
| G2 | applied | Passing and hostile paired inputs prove each guard is reachable without blocking the corresponding valid case. |
| H1 | applied | Eleven tests passed twice; Ruff passed; PyYAML-backed quick validation reported `Skill is valid!`; no pyc/cache files remained. |
| Z1 | applied | Process-substitution artifact inspection caught shell escaping under B1/B5; no additional unnamed reusable instrument was found. |

Findings: none
Controls: ERL-002, ERL-003, ERL-005, ERL-006, and ERL-009 have recorded disposable negative controls; documentation/command findings were verified by direct old-versus-new boundary execution.

Additional techniques: use process substitution to exercise a file-oriented CLI without persisting throwaway ledger inputs, while printing the generated inputs separately to catch shell-escaping mistakes.
