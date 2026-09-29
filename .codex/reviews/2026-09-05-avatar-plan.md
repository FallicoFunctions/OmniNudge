# OmniAvatar plan review

Scope: `docs/technical/omnirave/avatar-reconstruction-plan.md`, a planning artifact. This review checks requirements, internal consistency, source evidence, executable handoff clarity, and acceptance decisions. It does not certify a reconstruction provider, runtime performance, database migration, or production avatar; no executable application/provider inputs are changed.

Prior evidence read before plan inspection: `2026-09-04-omniavatar-provider-dispatch.md`, `2026-09-04-evidence-review-loop.md`, and the current conversation's accepted requirements.

Controlled inputs: realistic/anime and prepared/pending reference scenarios, accepted/rejected likeness examples, valid/over-budget spend requests, and first/cached/changed-identity lifecycle cases. Document before/after copies and narrowly reversed controls will be retained in an isolated temporary directory. Outputs are document sections and explicit acceptance decisions, not simulated provider successes.

Process stamps: fresh local processes; no renderer, server, provider, or database is run for prose-only changes. All future implementation gates remain pending.

Review in progress. Instrument evidence and findings will be appended during each pass.

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht`. `before.md` SHA-256: `2f16616b52419a9871291bb736f8e190cb1281965d235767b97952ca74e8607d`. Revised draft SHA-256: `ff1f1e13b2843e10509ba7f283b1e5bcd29c5da1c937bfb8bbd821224ee23931`.

The prior provider-dispatch ledger is incomplete and is not credited as a clean implementation review. Numeric/provider results in this plan remain proposals or cited prices. Document controls check the planning artifact, not the behavior of a future avatar system.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried the plan, its nine local evidence links, future backend/runtime consumers, and unchanged executable contracts. Only plan and private review ledger are edited. |
| A2 | applied | Read both prior area/skill ledgers before the plan. Provider ledger contains only an in-progress scope statement; no provider validation inferred. |
| B1 | applied | Printed phase-0/phase-2 handoff text for male-ready/anime-missing and upper-body-only inputs; before-boundaries.json captures conflicting instructions. |
| B2 | applied | Inspected the persisted Markdown tables and filesystem link targets; received phase table conflicts with the concluding next action. Two loaded document states retained as before.md and after.md. |
| B3 | na | This prose-only change sends no HTTP/socket/queue/provider payload; future message requirements are reviewed under C2/C4. |
| B4 | applied | Wrote and read back the actual Markdown plan and isolated before/after copies; nine relative evidence links resolve. No application storage behavior changed. |
| B5 | applied | Compared the real before/after document artifacts via before-after.diff and handoff tables. Evaluated 60-FPS/50-FPS numeric examples against the stated threshold. No model/provider/renderer input was executed or changed by this document edit, and their future tests are not credited. |
| C1 | applied | Compared four-to-six view proposal to current exact-six reference_set.go and full avatar-contract.v2.json. Partial-body proof cannot use unchanged full-avatar validation; APR-001/006. |
| C2 | applied | Reviewed required directional roles, optional supplemental face, duplicate/ownership/revision constraints, and provider subset selection. Added explicit valid/malformed input decisions. |
| C3 | na | There are no changed executable implementations promising parity; the three reconstruction routes are experiments, not parity claims. |
| C4 | applied | Reviewed future worker semantics against dispatch contract and current cited vendor costs. Found omitted preparation/variant budgets, stale preview activation, and late deletion handling; APR-003. |
| C5 | applied | Traced proposed identity/master/game revisions through both workflow descriptions to cache and acceptance. Existing ownership wiring remains explicitly pending. |
| D1 | applied | Document walkthroughs cover local male progress, legitimate anime likeness, owned reference packs, unattended completion, and 60 FPS; planning-cases.json and worked handoff table. |
| D2 | applied | Walked through generic faces, hand-fixed outputs, over-budget requests, deleted callbacks, wrong owners, and duplicated views; clarified rejection requirements rather than claiming implementation. |
| D3 | applied | Materialized body-view counts 0/1/3/4/5/6/7, supplemental face at maximum, preparation attempts 1/3/4, and a first attempt with no budget. APR-003/006. |
| E1 | applied | Compared human/anime gates and prototype/full-body scopes. Added style-aware likeness diagnostics and fresh full-body automation proofs before complete wardrobe work; APR-002/005. |
| E2 | applied | Found local start blocked by phase-0 anime/budget dependencies and partial prototype required to pass full-body locomotion. Reordered milestones; APR-001. |
| E3 | applied | Reviewed failure-to-preview and retry outcomes; added preparation exhaustion with continued chat availability and explicit stale/failed states. No error propagation code changed. |
| E4 | applied | Kept user acceptance, spend approval, actual-device testing, and service asset eligibility explicit. Added frozen automatic rejection calibration and human/anime negative examples. |
| E5 | applied | Reconciled phase table, route protocol, full production contract, and concluding next action. Kept old executable contract intact and prototype scope separate. |
| F1 | na | Markdown editing introduces no concurrent executable process or shared application state; lifecycle interleavings are requirements walkthroughs under C4/F4. |
| F2 | applied | Inspected proposed acceptance race semantics; specified revision comparison at activation and callback validity checks. No database atomicity is claimed from prose. |
| F3 | na | No migration, schema, SQL, or database behavior is changed in this plan review; the future implementation will require isolated migration execution. |
| F4 | applied | Walked first/pending/repeated request, appearance versus personality update, stale acceptance, cancellation/deletion, and uncertain submission. Materialized cases in planning-cases.json. |
| G1 | applied | Six isolated complete-fix reverse copies each fail their named document assertion and pass after restoring only the isolated copy. Reverse patches and negative.txt are retained per finding. The first control-script run exposed an overlapping reversal; corrected the disposable harness before accepting results. |
| G2 | applied | Each revised boundary has a passing and rejecting/deferred worked example. Document checks verify their received decisions; these are not production guard executions. |
| H1 | applied | Fresh Python document checks passed for six findings; all six reverse controls failed by assertion; all six restored copies passed; nine evidence links resolved. Runtime builds are inapplicable to Markdown-only changes. |
| Z1 | applied | Used feasibility-before-expansion and requirement-to-milestone tracing within the existing omission/reachability instruments. No additional protocol instrument needed. |

Findings: APR-001, APR-002, APR-003, APR-004, APR-005, APR-006; all corrected in the plan.
Controls: six fixed/reversed/restored document checks in `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht`; fresh full pass required.

### Findings and fixes

| Finding | Severity / instrument | Boundary and fix | Regression and negative control |
|---|---|---|---|
| APR-001 | P1 / B1, C1, E2 | Execution sequence and prototype acceptance: local-first work no longer depends on anime/spend; subset proof and isolated review contract precede full production acceptance. | `document_checks.py` APR-001; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-001/reverse.patch` |
| APR-002 | P1 / E1, E4 | Likeness acceptance: native evidence resolution and anime style are explicit; freeze automatic acceptance and rejection calibration before holdout, retain denominator and failures. | `document_checks.py` APR-002; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-002/reverse.patch` |
| APR-003 | P1 / C4, F4 | Prepared-reference/variant lifecycle: bounded creation/retries/spend, appearance-keyed reuse, deletion-safe callbacks, and explicit stale-revision activation. | `document_checks.py` APR-003; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-003/reverse.patch` |
| APR-004 | P2 / B5, D3 | Performance: percentile-only bounds admitted steady 50 FPS; require throughput plus tail-frame bounds with fixed quiet/active-show settings. | `document_checks.py` APR-004; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-004/reverse.patch` |
| APR-005 | P1 / E1 | Automation feasibility: require fresh full-body human/anime stage proof before wardrobe expansion; unattended worker behavior and physique eligibility remain explicit. | `document_checks.py` APR-005; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-005/reverse.patch` |
| APR-006 | P2 / C2, D3 | Reference handoff: explicitly reject malformed view sets, duplicates, ownership/revision mismatch before provider input selection. | `document_checks.py` APR-006; paired-decision assertion fails with full fix reversed; fixed/restored pass. `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omniavatar-plan-review-3pgku9ht/APR-006/reverse.patch` |

Additional techniques: none beyond protocol instruments. Semantic walkthroughs and document negative controls are limited to specification correctness, not proof of runtime behavior.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Reinventoried the revised plan, milestone consumers, current v1 default and v2 preview paths; plan/ledger remain the only intended workspace edits. |
| A2 | applied | Re-read pass-1 findings, six controls, prior incomplete dispatch ledger, and accepted product requirements before revised-plan inspection. |
| B1 | applied | Read the full assembled revised plan and twelve worked decisions. Local-ready and prototype-only inputs now have explicit distinct outcomes. |
| B2 | applied | Inspected full persisted Markdown and all six reverse-control outputs. Readback exposed no missing/truncated section; phase and acceptance tables are intact. |
| B3 | na | This prose-only change sends no HTTP/socket/queue/provider payload; future message requirements are reviewed under C2/C4. |
| B4 | applied | Read back revised plan and retained pass2-before.md; nine local evidence links remain valid. |
| B5 | applied | Compared real revised Markdown with pass-1 snapshot and reran six document controls. FPS probe distinguishes 60 from 50; production provider/runtime outputs remain future evidence. |
| C1 | applied | Found introduced wording calling v2 the production boundary inconsistent with createReviewAvatar preview flags and legacy editorial default. Reopened APR-001 and corrected that sentence. |
| C2 | applied | Reviewed required directional roles, optional supplemental face, duplicate/ownership/revision constraints, and provider subset selection. Added explicit valid/malformed input decisions. |
| C3 | na | There are no changed executable implementations promising parity; the three reconstruction routes are experiments, not parity claims. |
| C4 | applied | Rechecked preparation/master/variant spending, retry, cancellation, ownership, and stale-revision policies against the planned action and cache lifecycles; no further gap found. |
| C5 | applied | Traced proposed identity/master/game revisions through both workflow descriptions to cache and acceptance. Existing ownership wiring remains explicitly pending. |
| D1 | applied | Walked male-local start, anime-material acceptance, owned 4/5/6-view packs, fresh unattended processing, and 60-FPS examples against revised text. |
| D2 | applied | Walked generic face, manual repair, deleted callback, no budget, duplicate views, and cross-owner examples; all have explicit rejection/deferred requirements. |
| D3 | applied | Rechecked counts 0/1/3/4/5/6/7, six plus separate face, first/third/fourth attempts, and zero spending capacity; planning-cases.json unchanged. |
| E1 | applied | Compared human/anime/full-body/prototype siblings; all launch claims still require full gates and independent automatic processing. |
| E2 | applied | Local path remains reachable before paid or anime decisions; prototype no longer claims locomotion acceptance. |
| E3 | applied | Reviewed failure-to-preview and retry outcomes; added preparation exhaustion with continued chat availability and explicit stale/failed states. No error propagation code changed. |
| E4 | applied | Kept user acceptance, spend approval, actual-device testing, and service asset eligibility explicit. Added frozen automatic rejection calibration and human/anime negative examples. |
| E5 | applied | Reconciled milestone table and production-versus-preview terminology with source; APR-001 correction invalidates this as a terminating pass. |
| F1 | na | Markdown editing introduces no concurrent executable process or shared application state; lifecycle interleavings are requirements walkthroughs under C4/F4. |
| F2 | applied | Inspected proposed acceptance race semantics; specified revision comparison at activation and callback validity checks. No database atomicity is claimed from prose. |
| F3 | na | No migration, schema, SQL, or database behavior is changed in this plan review; the future implementation will require isolated migration execution. |
| F4 | applied | Repeated first/pending/cached/changed/deleted lifecycle walkthrough; explicit revision choice and late-callback rejection preserved. |
| G1 | applied | Regenerated all six isolated reverse patches against current text and reran fixed/reversed/restored checks. APR-001 fails local-dependency assertion; APR-004 fails missing-throughput assertion; four remaining controls fail missing paired-decision assertions. |
| G2 | applied | Paired examples still distinguish valid versus rejection/deferred outcomes; numerical FPS calculation is separate from the golden decision rows. |
| H1 | applied | Six document checks pass, six isolated negative copies fail specific assertions, six restored copies pass, nine file links valid. Control script parses as Python; no application tests credited. |
| Z1 | applied | No technique outside existing C1/E5 consistency and omission instruments was necessary. |

Findings: APR-001 reopened for production-versus-preview terminology; corrected and all document controls rerun.
Controls: regenerated six reverse patches and assertion outputs in the recorded artifact directory; current plan SHA-256 `445e147ed0311e4b1b2ee576f3f55264185430d9f85e25abfa5ea3249ddb2f64`.

## Pass 3

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Final surface: one revised plan plus this private ledger. Inspected all 12 numbered sections, five tables, nine local links, and future consumers; plan hash matches retained after.md. |
| A2 | applied | Read passes 1/2 and their controls before final inspection. Prior provider review remains incomplete and supplies no implementation certification. |
| B1 | applied | Printed all twelve received handoff decisions. Male-ready/anime-pending proceeds locally; upper-body-only remains a subset proof. Six paired boundaries retained in final Markdown. |
| B2 | applied | Loaded actual Markdown tables: 8 evidence rows, 3 routes, 7 gates, 5 phases, 12 cases. Checked consistent column counts, complete sections, trailing whitespace, and valid local file targets. |
| B3 | na | No HTTP, socket, queue, or provider request is emitted or modified by this planning artifact; future contracts remain documented requirements. |
| B4 | applied | Read back final workspace plan and isolated after.md; byte identity and SHA-256 445e147ed0311e4b1b2ee576f3f55264185430d9f85e25abfa5ea3249ddb2f64 confirmed. |
| B5 | applied | Executed document checks on actual final, reversed, and restored files; compared received valid/rejected cases and calculated 60-versus-50 FPS from the actual stated rule. No executable provider/model/renderer input changed; real avatar trials remain pending implementation. |
| C1 | applied | Compared 4–6 view roles, optional face, frame-time units, prototype/full gate scope, and current editorial-default/v2-preview distinction against source and all document occurrences. |
| C2 | applied | Checked reference storage revision versus provider four-view payload, malformed/partial input outcomes, supplement semantics, and user-selected preview activation. |
| C3 | na | No executable parity implementation changes in scope; providers are intentionally compared for quality rather than promised identical behavior. |
| C4 | applied | Reviewed each precompute/master/variant stage for ownership, budgets, idempotency reconciliation, retries, deadlines, cancellation, and result disposition. Configuration and vendor facts requiring later activation remain explicit. |
| C5 | applied | Traced identity revision to reference pack, master, game cache, old/new preview, and acceptance. Declared integration fields are not described as implemented. |
| D1 | applied | Re-evaluated valid male, anime, owned-view, repeat-request, unattended-output, and 60-FPS cases against the final received document decisions. |
| D2 | applied | Re-evaluated generic-face, hand-repair, no-budget, late-deletion, duplicated-view, and wrong-owner cases; explicit failure/deferred outcomes preserved. |
| D3 | applied | Inspected materialized 0/1/3/4/5/6/7 body-view counts, six plus separate face, first/third/fourth attempts, zero budget, and 11/12 holdout with/without manual repair. |
| E1 | applied | Compared human/anime and launch/automated siblings; both styles require fresh full-body proof and frozen acceptance calibration. Complete launch pair still requires full gates. |
| E2 | applied | Walked phase 0 through 4: local male start does not await anime/spend; repeatable full-body feasibility precedes wardrobe expansion; partial prototype cannot satisfy launch exit. |
| E3 | applied | Walked reference failure, stale completion, timeout reconciliation, cancelled callback, user rejection, and holdout accounting through their final documented outcomes. |
| E4 | applied | Checked authority for paid trials, source identity calibration, physique eligibility decision, fixed thresholds, and actual 8 GB device evidence. None is silently treated as done. |
| E5 | applied | Final phase table, next action, gate definitions, current-loader description, and cost/retry paragraphs agree; no duplicate executable validator introduced. |
| F1 | na | Document and ledger edits create no concurrent application execution; race scenarios are reviewed as future requirements without claiming runtime stress evidence. |
| F2 | applied | Rechecked compare-at-accept revision semantics and late-callback eligibility against lifecycle cases; atomic implementation remains a required later deliverable. |
| F3 | na | This change adds no migration or SQL and modifies no database behavior; no migration ladder applies to the planning artifact. |
| F4 | applied | Walked pending/reuse/update/delete/cancel/timeout/retry/accept scenarios again against final text and planning-cases.json; no new ambiguity found. |
| G1 | applied | Fresh final checks: six current copies pass, six isolated full-fix reverse copies fail named assertions, six restored copies pass. Inspected negative outputs and reverse patches in the recorded artifact directory. |
| G2 | applied | Each document decision pair preserves accepted and rejected/deferred cases; numerical throughput probe accepts 60 and rejects 50. These are specification controls, not runtime guard evidence. |
| H1 | applied | Document assertions, negative/restored controls, nine link checks, five table-shape checks, and final byte/hash check pass. Ledger completeness validator runs after this table is assembled. No application build or avatar test is credited. |
| Z1 | applied | Applied the existing semantic boundary, omission, and reachability techniques; no generally new instrument or skill modification needed. |

Findings: none
Controls: six final-document fixed/reversed/restored checks; see `controls.json`, per-finding `reverse.patch` and `negative.txt`, and `pass3-stamp.json` in the recorded isolated directory.

Final scope conclusion: the plan has no remaining confirmed in-scope issue from this pass. Provider reconstruction quality, automated likeness detection, production lifecycle correctness, and runtime/device capacity remain future implementation gates. No spending, uploads, production code edits, or avatar generation occurred during review.
