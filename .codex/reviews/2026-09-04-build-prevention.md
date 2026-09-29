# Build-prevention review ledger

Scope: reusable `build-prevention` skill plus OmniRave repository hooks, guard engine, guard controls, cache exclusion, and CI parity.

Controlled inputs: `command` and `cmd` shell event shapes; destructive and read-only commands; truncated and complete responses; valid and invalid JSON edits; first Stop and re-entry Stop events.

Process/build stamps: Python 3.13.7; repository state observed 2026-09-04 America/New_York; no long-running process is credited.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried the skill, `.codex/hooks.json`, guard engine/tests, `.gitignore`, CI workflow, five hook modes, affected project gates, and local/CI consumers. |
| A2 | applied | Read the prior evidence-review ledger and both user-supplied prevention and review-loop briefs. |
| B1 | applied | Materialized deny/allow hook JSON for destructive and read-only shell inputs and warning/empty JSON for truncated and complete outputs. |
| B2 | na | No rendered UI or scene graph is changed by these guards. |
| B3 | applied | Captured stdout JSON exactly as Codex receives it for two shell inputs and two output inputs. |
| B4 | applied | Exercised touched-ledger creation, preservation on gate failure, and removal on success with temporary filesystem state. |
| B5 | applied | Ran the real guard CLI side by side for deny/allow and warn/allow inputs. |
| C1 | applied | Compared configured matcher names, hook event names, JSON decision values, tool input keys, component names, and project script names. |
| C2 | applied | Verified actual shell schema uses `cmd`; found the guard only consumed `command`. |
| C3 | applied | Fed equivalent `command` and `cmd` events to the shell-command decoder. |
| C4 | na | No worker/provider, cost, retry, or cancellation boundary is introduced. |
| C5 | applied | Traced each matcher through mode dispatch, input extraction, decision output, touched ledger, Stop gate, unit control, and CI invocation. |
| D1 | applied | Read-only Git, targeted remove, valid JSON, complete output, and successful gate cases pass. |
| D2 | applied | Destructive Git, broad recursive deletion, oversized broad staging, invalid JSON, truncated output, malformed ledger, and failed gate cases fail closed. |
| D3 | applied | Covered zero edited paths, one/two paths, no ledger, malformed ledger, empty oversized inventory, and one oversized file. |
| E1 | applied | Compared both shell input keys and all four project script families; `cmd` support was missing. |
| E2 | applied | Exercised all mode branches plus Stop re-entry; no unintentionally unreachable branch remained after fix. |
| E3 | applied | Guard diagnostics preserve command, component, file, and underlying failure output; missing executable errors are returned. |
| E4 | applied | Stop re-entry gate, repository containment, installed ESLint check, and touched-component gates were inspected. |
| E5 | applied | One guard engine owns local behavior and CI controls; project commands remain sourced from package scripts. |
| F1 | na | Hook processes are independent and touched-ledger updates have no concurrent writer contract; no shared service/runtime is introduced. |
| F2 | applied | Touched-ledger write/clear behavior and failure preservation were exercised; malformed state fails safe to guard tests. |
| F3 | na | This change introduces no database schema or migration. |
| F4 | applied | Exercised first Stop, failed Stop, successful cleanup, missing ledger, malformed ledger, and re-entry allowance. |
| G1 | applied | Negative controls are pending below; this pass cannot terminate until recorded. |
| G2 | applied | Catch/allow command matrix and warning/no-warning matrix prove intended reachability and non-interference. |
| H1 | applied | Guard unit tests pass; hook JSON parses; skill structure validates; diff whitespace check passes. |
| Z1 | applied | Added real tool-event schema comparison as an explicit boundary technique. |

Findings:

- BP-001, high, C2/E1: `exec_command` supplies shell text as `cmd`, but the initial hook read only `command`. Fixed with one decoder accepting both real shapes and a two-shape regression matrix. Negative control recorded after isolated mutation.
- BP-002, medium, D3/F2: a valid JSON touched ledger with the wrong top-level shape could silently clear without running a gate. Fixed by rejecting non-list state and failing safe into guardrail tests. Negative control recorded after isolated mutation.
- BP-003, low, D1: two new tests assumed a non-resolved macOS temporary path and one exact Python JSON error phrase. Fixed by resolving the fixture root and asserting the semantic trailing-comma diagnostic.
- BP-004, medium, E1/H1: the first CI parity draft included retired `omnirave-web`, whose intentionally deleted stale blockout is still imported by legacy code. Repository history proved it is not the active client. Fixed by narrowing CI parity to the active `omnirave-babylon` package rather than reviving deleted product code.

Controls: `/tmp/omnirave-build-prevention-final-control.dq7laL/CONTROLS.md`; five isolated mutations each produced the intended assertion/error while the module compiled, and the restored copy passed 15/15.

Additional techniques: compare the hook examples against the actual tool schema used by the host, not only the documented alias name.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried the final skill, hook configuration, 263-line guard engine, 15 controls, cache exclusion, active-client CI job, and every local/CI consumer. |
| A2 | applied | Re-read the prior review ledger, this pass history, both user briefs, and the repository commit that intentionally removed the retired web blockout. |
| B1 | applied | Printed final assembled deny and allow JSON for `cmd`/`command`, plus warning and empty JSON for truncated/complete responses. |
| B2 | na | No rendered markup, scene, mesh, or visual state is changed. |
| B3 | applied | Real CLI stdout showed exact `PreToolUse` deny and `PostToolUse` additional-context envelopes, contrasted with `{}` passing envelopes. |
| B4 | applied | A real `.codex/cache/touched.json` containing `guardrails` was consumed and deleted only after its suite passed. |
| B5 | applied | Real guard entrypoint comparisons differed only at the promised decision/context fields for hostile versus passing inputs. |
| C1 | applied | Hook matchers, lifecycle event names, decision vocabulary, `cmd`/`command`, component IDs, package scripts, cache path, and CI paths agree. |
| C2 | applied | The guard consumes both observed shell shapes, apply-patch path fields, recursive response shapes, Stop state, and package-script exit diagnostics. |
| C3 | applied | `cmd` and `command` decode identically; local guardrail command and CI unit command both pass the same 15-test suite. |
| C4 | na | No provider, worker, paid API, retry, timeout ownership, or cancellation contract is changed. |
| C5 | applied | Every configured hook is wired through mode dispatch to a tested response; every affected active component maps to its native gate; CI invokes the shared guard controls. |
| D1 | applied | Read-only/targeted shell operations, valid JSON, complete output, successful gate cleanup, first-party skill validation, and active-client build pass. |
| D2 | applied | Destructive Git, split/combined recursive-delete flags, oversized broad staging against real avatar assets, malformed JSON/state, truncation, and gate failure reject correctly. |
| D3 | applied | Covered absent/one/two edited paths, absent/empty/oversized untracked sets, absent/malformed/valid ledgers, first/re-entry Stop, and valid/invalid artifacts. |
| E1 | applied | Compared shell aliases, four edit languages, four component gates, local versus CI commands, active versus retired clients, and passing/hostile siblings; no omission found. |
| E2 | applied | All four modes, allow/deny branches, checker suffixes, cache success/failure, malformed fallback, and Stop re-entry are reachable. |
| E3 | applied | Missing executables, subprocess exits, parse failures, file paths, component names, and bounded tail output reach Codex diagnostics. |
| E4 | applied | Repository containment, installed-ESLint condition, touched-component selection, Stop re-entry, active-client choice, and Git untracked filtering are explicit. |
| E5 | applied | Hook behavior has one engine and one test suite shared with CI; package scripts remain authoritative for component gates. |
| F1 | na | Hooks are short-lived local processes without a supported concurrent-write contract; no shared runtime concurrency is added. |
| F2 | applied | Ledger persists on failure, clears on success, and malformed shape fails safe; no partial successful gate is credited. |
| F3 | na | No database or migration is touched. |
| F4 | applied | First Stop, retry/re-entry, no-state Stop, failure retention, success cleanup, invalid state, and missing-tool diagnostics are covered. |
| G1 | applied | Disposable controls removed `cmd`, inverted truncation, bypassed JSON parsing, inverted Stop re-entry, and removed state-shape validation; each compiled and failed the matching assertion, then restored green. |
| G2 | applied | Exact response-shape tests plus real CLI pairs prove each guard runs for hostile inputs and remains silent for passing inputs. |
| H1 | applied | 15/15 guard controls pass; hook JSON and CI YAML parse; skill validator passes; diff check passes; Babylon build passes; 83 files/1185 tests pass. |
| Z1 | applied | Applied host-schema differential and repository-history intent checks; neither revealed an additional final-pass issue. |

Findings: none

Controls: `/tmp/omnirave-build-prevention-final-control.dq7laL/CONTROLS.md`; restored suite 15/15.

Additional techniques: host event-shape differential and repository-history intent verification were applied under Z1.

Pass 2 was not accepted as terminating evidence because its A1 measurement was corrected after the pass.

## Pass 3

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried 5 implementation files in the repository, the 263-line engine, 142-line/15-test control suite, 2 review ledgers, and the 3-file personal skill. |
| A2 | applied | Re-read the prevention brief, review protocol, prior review ledger, Passes 1-2, and the retired-client deletion history. |
| B1 | applied | Rechecked assembled hostile/passing shell and output events and their exact response dictionaries in tests and real CLI captures. |
| B2 | na | No visual, rendered, or scene-state boundary exists in this change. |
| B3 | applied | Rechecked the exact JSON envelopes received by Codex: deny/context for hostile inputs and empty objects for passing inputs. |
| B4 | applied | Rechecked temporary valid, invalid, absent, malformed, failed, and successful touched-ledger/file artifacts. |
| B5 | applied | Compared real CLI deny/allow and warn/allow outputs side by side; only promised decision/context fields differ. |
| C1 | applied | Recompared lifecycle names, matcher aliases, response keys, command input keys, component IDs, scripts, and CI paths; all agree. |
| C2 | applied | Reverified every caller-visible hook input and output shape against the final pure response functions and mode dispatch. |
| C3 | applied | Both shell event variants remain equivalent, and CI/local controls invoke the same guard module and suite. |
| C4 | na | No worker/provider or paid/external runtime boundary exists. |
| C5 | applied | Traced each hook and gate end to end from configuration through decoder, behavior, output, regression, and CI consumer. |
| D1 | applied | All realistic passing command, artifact, output, Stop, validation, test, and active-client build cases pass. |
| D2 | applied | All destructive, oversized, malformed, truncated, invalid, missing-tool, and failed-gate cases fail with scoped diagnostics. |
| D3 | applied | Zero/one/two paths, no/one oversized files, absent/malformed/valid state, first/re-entry Stop, and valid/invalid syntax remain covered. |
| E1 | applied | Recompared sibling tool schemas, hook modes, file checkers, project gates, local/CI calls, and active/retired clients; no omission found. |
| E2 | applied | Branch and mode reachability remains demonstrated by the 15-test matrix and exact response checks. |
| E3 | applied | All subprocess, syntax, state, and gate failures retain actionable context and bounded output. |
| E4 | applied | Containment, local-tool availability, affected-component, re-entry, active-client, and untracked-file gates remain explicit. |
| E5 | applied | No duplicate guard engine, response schema, test invocation, or project command source was found. |
| F1 | na | No concurrent service or shared runtime was added; hooks are short-lived processes. |
| F2 | applied | State failure retention, success cleanup, malformed fail-safe behavior, and no-credit-on-partial-gate behavior remain covered. |
| F3 | na | No database or migration exists in this scope. |
| F4 | applied | First/re-entry Stop, absent/invalid state, failed/success cleanup, and subprocess failure lifecycle cases remain covered. |
| G1 | applied | Re-read the five compiling negative controls and restored 15/15 result at `/tmp/omnirave-build-prevention-final-control.dq7laL/CONTROLS.md`. |
| G2 | applied | Exact hostile and passing response tests prove guard reachability and non-interference after the final changes. |
| H1 | applied | Ledger validator, 15/15 controls, JSON/YAML parsing, skill validation, diff check, Babylon build, and 83-file/1185-test suite are green. |
| Z1 | applied | Re-applied host-schema, repository-history, and evidence-measurement checks; the final evidence now matches the files. |

Findings: none

Controls: `/tmp/omnirave-build-prevention-final-control.dq7laL/CONTROLS.md`; five mutations failed specifically and restored suite passed 15/15.

Additional techniques: explicit evidence-measurement verification was applied under Z1.
