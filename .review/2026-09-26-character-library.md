# Character library evidence review

Scope: commits 6bd2239ce, b60b92aa3 and fddc2173a plus review fix 02c9df5e9; My Characters library, authorized local/cloud portrait delivery, concise public biographies, and affected persona consumers. No model/provider generation inputs or database schema changed.

Prior evidence: `.review/2026-09-24-roleplay-choice-creator.md`; relevant upload gateway/cookie/adapter/stream findings in `.review/d66091636.json`.

Controlled inputs: synthetic adult Casey investigator profile (legacy definition) versus plain Morgan investigator biography; owner versus stranger/anonymous; tracked local versus cloud portrait; populated versus empty library. Pin timestamps and fixture identifiers in probe scripts. Real library validation uses existing Nadia and Futaba cards without changing their stored data.

Artifacts: `/tmp/omninudge-library-{boundaries,portrait-boundaries,dev-rows,handlers,ui}-pass1.log`. Backend `/tmp/omninudge-character-profile-dev-final` SHA256 `0a7f0eb350327a486cb27e17a649a96ad35656d4ed78a96fb72378b86a7644b9`, PID 69572, start 2026-09-25 21:53:45 local (after final model code). Restarted Vite PID 83140 at 22:39:48 local, code/build stamp fddc2173a. Final Vite PID 92843 restarted 2026-09-25 22:51:43 local, runtime build ID 02c9df5e9. Browser local account 7 and cards 27/24 read without data mutation. Synthetic fixture IDs 1/2, owner 1, stranger 2; timestamp 2026-09-26T02:00:00Z in a package-isolated PostgreSQL database.

## Fixed findings

- CL-001 (low, C4/F1, library mutation lifecycle): Delete remained reachable during a pending Open Chat and could remove the character before navigation. Fixed mutually exclusive pending chat/deletion actions. Regression `does not let deletion race a pending chat request` failed before the fix with an unexpected live delete dialog (`/tmp/omninudge-library-race-before.log`). Isolated reverse control `pending-actions-reverse.patch` compiled, failed both modal/no-competing-chat assertions, then fixed copy passed in the disposable directory recorded below.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried three scoped commits and their model serialization, HTTP, storage gateway, library and query consumers. |
| A2 | applied | Read the creator ledger and the upload gateway evidence before implementation inspection; known private API origin, cookie path, adapter capabilities and exact-length streaming hazards retained as probes. |
| B1 | applied | Printed complete encoded legacy Casey and plain Morgan profiles with pinned date, IDs and opening; both produce the same neutral biography, preserving the original raw definition. |
| B2 | applied | Restarted Vite and personally inspected Nadia (768x1344) and Futaba (400x600) loaded images, top crop and concise paragraph; populated/empty library DOM covered in component outputs. |
| B3 | applied | Captured library and full-definition HTTP bodies for synthetic owner and stranger, and cloud portrait body/headers for owner/anonymous/stranger with both prefixed and bare storage keys. |
| B4 | applied | Read back exact synthetic persisted raw definitions and prompts, plus development portrait row 226 and persona rows 24/27; raw character data remains untouched. |
| B5 | applied | Real PostgreSQL and HTTP handler comparison preserves source-format differences in storage while emitting matching biographies; actual signed-in browser reads Nadia from cloud and Futaba from local storage. No generation inputs changed. |
| C1 | applied | Compared description optionality, 240-rune bio cap, exact media path prefix, object size, scan constants, character IDs and API origin across model, handler, browser types and renderer. |
| C2 | applied | Library reads personas[] and optional description; actual serialized raw legacy and plain inputs agree with TypeScript shape, while full definition retains original owner-authorized fields. |
| C3 | applied | Legacy and plain versions of identical investigator profile emit equal biographies; local and cloud delivery enforce the same owner and clean-scan gate. |
| C4 | applied | Traced storage GET/size/error/close semantics and library mutation retry/lifecycle; competing chat/delete operation was reachable (CL-001), now disabled while either is pending. No provider generation request changed. |
| C5 | applied | Traced Description from SQL scan to read-only public serialization to library/catalog/conversation; raw field remains available to prompt compiler and full definition. Authorized media record reaches cloud proxy without a second mismatched lookup. |
| D1 | applied | Both synthetic persisted characters and both storage key styles returned correct owner payloads; real Nadia and Futaba images loaded and library create/open/delete-cancel flows succeeded. |
| D2 | applied | Stranger and anonymous cloud GETs returned 404; stranger full definitions returned 404; malformed/template/raw-definition biographies fail to neutral fallback without private markers. Pending and infected media remain refused. |
| D3 | applied | Tested empty, one-rune, 239/240/241/300 Unicode biographies, empty library and two cards; media clean/pending/infected/missing/untracked cases covered. |
| E1 | applied | Compared catalog, owned list, conversation embedding, full definition and account export; raw private prompt consumers retain data and shared avatar renderer resolves the authenticated API URL. |
| E2 | applied | Reached empty/populated/error library, member/admin/guest, ordinary versus OmniAI removal, legacy/plain/fallback bios, local/cloud images and deferred pending actions. |
| E3 | applied | Storage unavailable returns 503; unauthorized and absent files 404; list/chat/delete failures show distinct retryable UI state; model marshal errors remain returned. |
| E4 | applied | Owner authorizer, public-media authorizer and clean-scan gates execute before either storage path; guest library fetch is disabled and auth cache clearing prevents account reuse. |
| E5 | applied | One public-biography serializer feeds catalog/library/conversation, and the already-authorized media record feeds local/cloud access. No duplicate editor or definition fetch remains in the library. |
| F1 | applied | Focused Go race detector passed on models and handlers; delayed frontend mutation regression reproduced CL-001 and fixed request exclusivity passed. |
| F2 | applied | Existing persona delete and queued-job cancellation remain one SQL transaction. Display serialization is read-only, does not mutate raw field or persistence; cache filters exact deleted ID before refresh. |
| F3 | applied | Existing expansion migration ladder through 221 rolled back and reapplied in a real package-isolated PostgreSQL database; no schema migration introduced by this scope. |
| F4 | applied | Exercised delete/cancel/retry and deferred deletion completion; pending modal cannot close, repeat-delete cannot submit twice, remaining card survives. Real browser confirmation cancelled without data mutation. |
| G1 | applied | Isolated controls for pending actions, cloud key and public biography each compiled and failed their behavioral assertion, then passed with the fix reapplied. Paths and failing bodies personally inspected. |
| G2 | applied | Delayed Open Chat now blocks Delete and delayed Delete blocks Open Chat; successful/retry paths stay reachable. Owner cloud delivery passes while stranger/anonymous fail; legacy and plain biography equality preserves allowed input. |
| H1 | applied | Go build ./..., focused vet and race checks, migration rollback/reapply, 32 frontend tests, production build/typecheck, ESLint and i18n checks passed. Dependency annotation/chunk size build warnings are non-blocking. |
| Z1 | applied | Reused prior private-URL/cookie and production-adapter probes; pinned IDs/dates and original/full-definition parity account for global serialization changes. No new general-purpose instrument needed. |

Findings: CL-001 fixed; a new full pass follows the fix and regression additions.
Controls: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omninudge-library-control.0iyk1foj/{pending-actions,cloud-key,public-bio}-reverse.patch` with negative and fixed logs; no working-tree fix was reversed.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried final scope through 02c9df5e9: three library/portrait/bio commits plus mutually exclusive actions; only review ledger untracked and no implementation edits remain. |
| A2 | applied | Re-read pass-1 evidence, original creator final pass and upload gateway adapter/cookie/stream findings; CL-001 controls now prove both pending directions. |
| B1 | applied | Re-ran complete legacy/plain serialized profile artifacts with timestamp 2026-09-26T02:00:00Z and deterministic fixture IDs in disposable copy; outputs match pass 1. |
| B2 | applied | Vite restarted as PID 92843 after final guard commit; browser again showed both loaded portrait dimensions, top crop and concise biography, with no character form fields. |
| B3 | applied | `/tmp/omninudge-library-boundaries-pass2.log` captures actual list/definition/portrait response bodies and headers for each owner and stranger branch and two storage prefixes. |
| B4 | applied | Second probe read persisted raw definition/prompt and clean portrait records before HTTP responses; no development row was edited. |
| B5 | applied | Compared real isolated PostgreSQL/HTTP responses side by side and actual signed-in cloud/local portrait renders after restart; source definitions differ, concise equivalent biographies agree, unauthorized requests remain 404. |
| C1 | applied | Rechecked 240-rune cap, optional description, owner IDs, scan values, API origin and storage prefix in final source and received artifacts; runtime i18n build ID is 02c9df5e9. |
| C2 | applied | Actual personas[] and description values remain valid frontend payloads; nil description is omitted, while full-definition raw fields remain intact behind existing access checks. |
| C3 | applied | Equivalent legacy/plain persona bios and prefixed/bare cloud storage keys again give equal authorized results; library and conversation share public serialization. |
| C4 | applied | Re-traced storage size/download/close, owner/scan preconditions and library pending-state exclusivity against final code. Retry and cancel preserve selected ID; no new provider or generation action introduced. |
| C5 | applied | Re-traced original DB Description into public serializer and raw prompt/full-definition consumers; authorized record reaches remote object directly. Runtime module shows both final pending guards. |
| D1 | applied | Both synthetic profiles and both cloud key styles passed actual handlers; live Create Roleplay AI reached the existing saved guided Concept page, then My Characters returned to library. No new character generation triggered. |
| D2 | applied | Repeated stranger/anonymous 404 probes and malformed/template legacy definition fallbacks; existing no-upload/import-removed/owner-only regressions included in broader persona suite. |
| D3 | applied | Repeated 0/1/239/240/241/300 Unicode artifact probe in disposable copy; empty/two-card, missing storage, pending/infected scan paths remain covered. |
| E1 | applied | Recompared catalog/private list/conversation serializer with raw prompt, definition and account-export siblings; import and editor remain absent. Production repository delegates both authorization capabilities. |
| E2 | applied | Final live library/create-return/cancel routes reachable; component tests cover member/admin/guest, empty/list error, deferred chat/deletion, ordinary/OmniAI confirmation and retry. |
| E3 | applied | Re-traced map serialization errors, SQL rows.Err, storage unavailable/absent and UI mutation failures. No swallowed error introduced by scope; deletion cache removes exact ID before refresh. |
| E4 | applied | Guest fetch disabled, owner/scan gates precede proxy and raw definition access retains ownership/public checks; no media upload or free-text editor reappeared. |
| E5 | applied | Rechecked one public-biography function and one shared private media URL helper; delete and chat pending guards intentionally share mutation state, without duplicate backend definitions or editor transformations. |
| F1 | applied | Re-ran Go race detector on final persona/bio/authorized upload handlers; delayed frontend action tests passed in the 62-test integration set. |
| F2 | applied | Re-inspected delete SQL transaction, job cancellation and exact-ID cache update; no change to persona storage writes, claim transaction or prompt construction. |
| F3 | applied | Re-ran real isolated expansion migration rollback/reapply through 221; no new migration or schema change in audited commits. |
| F4 | applied | Final library tests exercise both pending directions, cancel/escape while deleting, retry after failures and exact-card removal. Live ordinary-character confirmation/cancel preserves both development cards and differs correctly from OmniAI departure copy. |
| G1 | applied | Replayed all three isolated reversals on source byte-identical to final files: two pending-action assertions, cloud owner 200 versus 404 and public biography versus raw definition each failed while compiling, then fixed copy passed. Summary `/tmp/omninudge-library-controls-pass2.log`. |
| G2 | applied | Pending actions block only competing operations and become usable after completion/failure; owner proxy succeeds while unauthorized access fails, and legacy/plain biographies preserve the shared public contract. |
| H1 | applied | Final 62 frontend tests and broader persona/roleplay/upload Go suites passed; second Go race and isolated migration runs passed. Production build/typecheck, full Go build, focused vet, ESLint, i18n and commit checks remain valid for unchanged final source. Backend health reports database connected. |
| Z1 | applied | Reused prior private API URL and production-adapter checks, verified final runtime build stamp and source byte equality before controls; all actual boundary artifacts remain consistent and no further technique or finding arose. |

Findings: none
Controls: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omninudge-library-control.0iyk1foj/{pending-actions,cloud-key,public-bio}-reverse.patch` with second-pass compiling assertion failures and passing fixed logs. Temporary probes remained outside the working tree on pass 2.
