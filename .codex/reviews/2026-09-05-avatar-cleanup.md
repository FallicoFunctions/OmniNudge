# Avatar cleanup and consolidated rebuild review

Scope: authorized September 5 source-asset cleanup, archive/deletion records, retained Blender sources, consolidated Astra recipe, and local review-page dependencies. Existing runtime/provider implementation and likeness acceptance are not certified by this review.

Prior evidence: read the skill, protocol, previous skill/prevention/plan ledgers and the incomplete provider-dispatch ledger before inspecting implementation. Likeness remains NOT_PASSED. No external paid sources or uploads authorized.

Controlled inputs: retained versus deleted paths; archived versus live scripts; fresh versus existing output paths; rebuild without versus with optional render; current versus freshly rebuilt loaded geometry. Fixed recipe seeds and Blender version; no warm renderer is credited.

## Pass 1

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/avatar-cleanup-review-90vziziy`. Blender 5.1.2 ec6e62d40fa9; fresh CLI renderer. Restarted the owned loopback HTTP server before capturing responses; index SHA-256 4a84e2557714add1c4bf172596a4576ef4545655f59e94fc4628667db2c53159.

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried 67 deletions, 13 archived scripts, 12 principal retained Blender files, 79 initial manifest artifacts, recipe and checkpoint consumers, docs, and 221 protected paths. |
| A2 | applied | Read prior skill/prevention/plan ledgers and incomplete provider ledger before source inspection; no prior provider or likeness certification inferred. |
| B1 | applied | Materialized CLI model-only and model-plus-PNG inputs; expanded four versions by four view names from actual index source. |
| B2 | applied | Fresh Blender opened all 12 retained sources with no missing file images/libraries. Visually inspected face19 and pose04 reference renders; differences remain study changes, not likeness acceptance. |
| B3 | applied | Restarted static server; received 19 HTTP bodies including 16 model views and compared each byte-for-byte with its file. See pass1-inventory-http.json. |
| B4 | applied | Deletion entries match original hashes/sizes and absent paths. All 13 ZIP entries match originals; all 221 protected files match before inventory. Current/rebuilt Blender files loaded back. |
| B5 | applied | Actual consolidated Blender run emitted model plus render; pass1-render.json shows zero pixel difference from retained face19. pass1-geometry.json compares 25 visible evaluated objects. Writer-double cases separately expose failed optional-render behavior. |
| C1 | applied | Compared retained checkpoint enums, UI version/view names, CLI path suffixes, seeds 912/918, input JSON roles, artifact sizes/hashes, and recorded deletion totals. |
| C2 | applied | Found Blender may append output extensions while preflight checks the unextended name; CANCELLED save result was ignored. AC-001. |
| C3 | applied | Current candidate and consolidated output have exact visible topology/positions/radii and pixel-identical reference render. Historical binary hashes are not expected to match compressed saves. |
| C4 | na | Cleanup and standalone local recipe touch no worker, provider, paid API, ownership, retry queue, or submission contract. |
| C5 | applied | Traced CLI arguments through preflight, Blender save/render, files, console success, manifest, and download targets. Optional render failure left a published model; AC-001. |
| D1 | applied | Existing-file guards and fresh model-only/model-plus-render writer cases pass; actual full Blender model/render succeeds. |
| D2 | applied | Tested late destination creation, existing PNG through an extensionless argument, dangling symlink, cancelled save, and renderer failure; confirmed AC-001. |
| D3 | applied | Zero/one optional renders, missing/valid suffix, absent/existing destination, one/two published files covered. No configurable model-count maximum exists in this single-candidate CLI. |
| E1 | applied | Compared save and render branches; both lacked publication-time protection, and only startup existence checks were shared. Both now use staged output publication. |
| E2 | applied | Reached both CLI branches and preflight failures; validated remaining renderer/inspector checkpoint selectors and all UI targets. |
| E3 | applied | Exposed ignored CANCELLED and partial success. New explicit FINISHED checks propagate errors and remove staged artifacts; no success message on failed operations. |
| E4 | applied | External paid sources remain deferred. New extension and symlink guards run before model construction. Existing runtime quarantine guards and sources unchanged. |
| E5 | applied | Historical scripts remain explicitly archived; current recipe has no ZIP/intermediate binary dependency. Refreshed current manifest for reviewed edits; historic records remain immutable. |
| F1 | applied | Deterministic late-writer interleaving reproduces overwrite. Fixed real filesystem stress uses 8 simultaneous hard-link publishers: exactly one winner and no staged leftovers. |
| F2 | applied | Replaced direct final-path writes with same-directory staging and no-replace hard links; ordinary second-publication failures roll back owned first links. Documented per-file atomicity and forced-kill limits. |
| F3 | na | No schema, database behavior, or migration is changed by source-file cleanup or Blender CLI publication. |
| F4 | applied | Existing-output retry, renderer failure, cancelled save, late collision, rollback, dangling links and normal staging cleanup exercised. Forced kills can leave recoverable staging files; no automatic deletion of unrelated files. |
| G1 | applied | AC-001 isolated before/fixed Python copies compile. Seven specific reversed tests fail through assertions; restored 12-test suite passes. Retained AC-001-reverse.patch and negative.txt/restored.txt. |
| G2 | applied | Passing model-only and model-plus-render cases remain allowed; guarded hostile cases fail before success. Eight concurrent publishers yield one complete file. |
| H1 | applied | 166 targeted asset/contract tests pass; 12 publication tests pass; 12 retained Blender files open; 79 initial hashes verified; git diff --check passes. |
| Z1 | applied | Used exact ZIP member basename equality after correcting a too-broad suffix match in the disposable audit probe. Existing boundary-comparison instruments suffice. |

Findings: AC-001 (P1, C2/C5/D2/F1/F2): consolidated rebuild could overwrite a late-created file or extension-appended target, report success after a cancelled save, and leave final output after renderer failure. Fixed with validated output names, staged publication, Blender result checks, and rollback; no geometry code changed.
Controls: AC-001-reverse.patch in the artifact directory; seven reversed behaviors compile and fail by assertion, restored full 12-test suite passes. Native Blender parity is tested separately from the small writer double.

Additional techniques: no additional reusable instrument beyond artifact identity and controlled interleavings was needed.

## Pass 2

Full review restarted after code, regression, documentation, and manifest changes. Same artifact directory. Final recipe SHA-256: 2e8af26fedf26678e43d2fb03735b66f6d01d81c1099142d744b517f8fce13d7. Fresh Blender CLI processes; static server restarted again after the manifest update, received manifest hash 6a85ce280ecfdb9377d9cd8ccc778109a8931c8fb078944538ff6578f5ab0636.

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried 1,793 pre-cleanup entries: exactly 80 missing, all accounted for by 67 deleted binaries and 13 archived scripts. Reviewed final recipe, 12 tests, cleanup documentation, and 80 manifest entries; pass2-surface.json. |
| A2 | applied | Re-read pass 1 and AC-001 controls before final source review; prior plan/provider limitations remain. No source likeness or runtime certification inferred. |
| B1 | applied | Printed final native arguments for model-only and model-plus-render builds with distinct new paths. Rechecked four version/four camera combinations assembled by the page. |
| B2 | applied | Fresh Blender loaded all 12 retained sources and both new full builds. Both generated files reopen with all image/library paths resolved and 56 rig bones. Inspected retained and fresh face19 render; pass2-reloaded-assets.json. |
| B3 | applied | Fresh loopback server returned 20 byte-identical bodies, correct sizes for four downloads, and 404 for deleted optics20; pass2-http.json includes response hashes. |
| B4 | applied | Re-read both final Blender outputs and JSON reports; verified all deletion hashes/sizes, archive member bytes, 221 protected hashes and 80 current manifest hashes. Owned audit binaries removed only after comparison, with hashes in temporary-model-cleanup.json. |
| B5 | applied | Ran final recipe through Blender with and without optional render. Both have exact visible geometry versus retained face19; only requested render presence differs. Final 768x896 RGBA render is pixel-identical, max difference 0. Native preflight failures also verified. |
| C1 | applied | Rechecked CLI .blend/.png names, PNG format/extension settings, FINISHED result sets, checkpoint selectors, 912/918 seeds, source JSON paths and manifest status values. No drift found. |
| C2 | applied | Native CLI existing-output and invalid-render-suffix cases exit 1 before loading the model with the expected diagnostic. Optional render absence/presence and save cancellation handled by explicit branches. |
| C3 | applied | Both final rebuilds match 25 visible evaluated object positions, topology and radii exactly; pass2-geometry.json and pass2-model-only-geometry.json. All four geometry/material function ASTs are unchanged from the pre-fix script. |
| C4 | na | No provider, worker, external API, credit, submission ownership, or dispatch lifecycle boundary is modified in this cleanup/local CLI scope. |
| C5 | applied | Traced parsed paths to validated destinations, same-directory staging, Blender results, collision-safe publication, final success console, manifest and unchanged page download targets. |
| D1 | applied | Real Blender model-only and model-plus-PNG runs succeed, re-open and match; positive writer cases preserve exact payloads and leave only requested files. |
| D2 | applied | Existing destinations, extensionless targets, dangling symlink, late model/render collisions, failed renderer and cancelled save reject without replacing prior data; native guards and writer controls both observed. |
| D3 | applied | Repeated zero/one optional render, one/two output files, absent/existing files, wrong/correct suffix and eight-contender cases. This single-model CLI declares no batch size or retry maximum. |
| E1 | applied | Save and render now share the same publication protection; both return statuses are checked. Retained checkpoint sets match their supported measurement/render consumers; deleted history is labeled. |
| E2 | applied | Native runs reach both optional-render branches. Twelve tests reach valid/preflight/failure/collision/rollback paths, and all 16 page image targets exist and are served. |
| E3 | applied | Confirmed failed native preflight includes path and cause, exceptions do not print success, cancelled save becomes RuntimeError, and renderer errors survive staging cleanup. |
| E4 | applied | Preflight guards precede expensive construction; final hard-link creation rechecks collisions atomically. Paid-source deferral and unaccepted likeness status remain explicit; runtime quarantine files unchanged. |
| E5 | applied | Current recipe depends only on fit05 and two JSON inputs, not historical archive/intermediate binaries. Current 80-entry manifest agrees with disk; previous manifests stay historical. |
| F1 | applied | Re-ran 8 simultaneous actual-filesystem publishers: one complete winning payload, seven collisions, zero staged leftovers. Deterministic late-writer cases preserve the other writer's bytes. |
| F2 | applied | Re-inspected staging and per-file no-replace hard links, result validation, owned-link rollback and finally cleanup. Second-file collision removes only this invocation's first output. Forced-kill limitations documented without promising a two-file transaction. |
| F3 | na | Source cleanup and standalone Blender output handling introduce no database/schema change or migration ladder. |
| F4 | applied | Repeated success, existing-output retry, cancelled save, render failure, late collision, second-publication rollback, reload and staging cleanup. Removed only three owned audit binaries after recording hashes; no staged orphans remain. |
| G1 | applied | Final recipe equals isolated fixed.py byte-for-byte and compiles. Seven reversed behavioral tests fail by assertion without import/compile errors; restored final 12-test suite passes. AC-001-reverse.patch, negative.txt and pass2-restored.txt retained. |
| G2 | applied | Native guard cases reject before model load, both real successful builds publish, and concurrency/rollback controls demonstrate the protection is reachable without suppressing valid output. |
| H1 | applied | Fresh final 166 asset/contract tests and 12 publication tests pass. Both rebuilt files reopen, 12 retained files open, 80 hashes match, and git diff --check passes. Native application build omitted because no application code or build configuration changed in this review. |
| Z1 | applied | Reapplied exact archive-member identity and controlled late-writer interleaving; no additional instrument or final-pass issue found. |

Findings: none
Controls: AC-001-reverse.patch and seven specific compiling assertion failures in negative.txt; current/restored 12/12 suites pass. Native Blender differential evidence is separate from the writer-double regressions.

Additional techniques: none beyond existing protocol instruments. Source AST comparison supplements native pixel and geometry parity; it does not replace them.

Conclusion: cleanup and consolidated rebuild output safety passed this review. Likeness remains NOT_PASSED; deformation, modular wardrobe completion, runtime/device performance and automated human/anime reconstruction remain outside this audit and unaccepted. No paid services, uploads, public asset replacements or commits occurred during review.
