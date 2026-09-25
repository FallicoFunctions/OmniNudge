# Roleplay choice creator evidence review

Scope: selection-only creator, curated catalog, creation API, persistence and nonadmin edit boundary.

Controlled inputs: (1) private investigator / missing person / New York City / restaurant / realistic; (2) college student / final exams / small-town Idaho / library / anime. Request UUID pinned to `123e4567-e89b-42d3-a456-426614174000` for cross-owner probes. The user authorized eight initial metered portraits and a separate four-image anime endpoint trial. Temporary personas 28, 29 and 30 were soft-deleted; their test conversations 38 and 37 were archived after inspection.
Process/build stamps: backend binary `/tmp/omninudge-review-server-character-creator-v8` SHA-256 `0c00a2b8cbde659754be2ad3295eaa325b1cb11e24a594bbcd0579f26f94b7c6`, serving port 8080 as PID 81672 from 18:07 local. Frontend Vite PID 83164 serves port 5176 after final UI copy change. Earlier processes were stopped. RunPod anime endpoint `riszcbluezj9lu` uses template `cdamsghor3`, worker image v54 and `cagliostrolab/animagine-xl-3.1`, with zero minimum, one maximum worker and a five-second post-job idle timeout.

## Fixed findings during review

- F-001 (low, B1, compiled opening): `A small town in Idaho` was emitted as `in A small town`. Lowercased the leading article in opening prose. Regression `TestBuildRoleplayPersonaOpeningLowercasesIndefiniteSettingArticle`; negative control `/tmp/omninudge-roleplay-control.Fdu222/reverse.patch`, assertion failed as expected, fixed copy passed.
- F-002 (medium, B3/B4, creation API to unique slug): the same request UUID from two owners collided on a global slug and made the second insert return 500. Scoped the slug by owner. Regression `TestOmniChatRoleplayCreationRequestIDsAreScopedToOwner`; negative control `/tmp/omninudge-roleplay-control.Fdu222/owner-slug-reverse.patch`, second-owner HTTP status asserted 201 but was 500, fixed copy passed.
- F-003 (medium, C4, paid portrait reroll): the reroll button remained active when price lookup failed. Disabled the action until the server price is known. Regression `does not allow a paid reroll when its price is unknown`; negative control `/tmp/omninudge-roleplay-control.Fdu222/reroll-price-reverse.patch`, `toBeDisabled` assertion failed, fixed copy passed.
- F-004 (high, F2/F4, claim and character persistence): insert and idempotency completion used separate transactions, allowing a saved character with a failed claim after a crash. `CreateOwnedWithClaim` now atomically stores both and recovers a prior insert under the owner lock. Regressions `TestOmniChatRoleplayCreationRecoversAnInsertBeforeClaimCompletion` and `TestOmniChatRoleplayClaimFailureRollsBackCharacter`; negative controls `/tmp/omninudge-roleplay-control.Fdu222/claim-recovery-reverse.patch` and `/tmp/omninudge-roleplay-control.Fdu222/claim-atomic-reverse.patch` failed by HTTP/status and missing-error assertions respectively; fixed copies passed.
- F-005 (low, H1, portrait prompt regression): a test still expected the removed free-text appearance. Updated it to compare queued prompt payloads from two curated characters. Negative control `/tmp/omninudge-roleplay-control.Fdu222/portrait-prompt-reverse.patch` bypassed guided briefs; the test failed asserting the missing New York setting, and the fixed copy passed.
- F-006 (low, H1, portrait wait screen): the component read the clock and a ref during render, failing React purity lint and making timeout state dependent on incidental renders. Replaced those reads with a one-minute timer and state. Regression `ends the initial wait after one minute and lets the user check again`; negative control `/tmp/omninudge-roleplay-control.Fdu222/portrait-wait-reverse.patch` left the timer unable to update state, causing a missing unavailable-message assertion; fixed copy passed.
- F-007 (medium, E5, 18+ choice policy): the client and server separately hardcoded the restricted school/family IDs, allowing policy drift. Added `adult_restricted` to the server-owned catalog, consumed by both. Regressions `TestBuildRoleplayPersonaRejectsAdultSchoolOrFamilyScenario` and `hides 18+ from admins when a catalog group is restricted`; negative controls `/tmp/omninudge-roleplay-control.Fdu222/adult-policy-reverse.patch` and `/tmp/omninudge-roleplay-control.Fdu222/adult-ui-reverse.patch` respectively allowed the school scenario on the server and displayed 18+ in the UI; fixed copies passed.
- F-008 (medium, F4, deleted character replay): a completed request replay returned its cached success after the character was deleted. The handler now verifies the claimed character is still active and owned before replaying. Regression `TestOmniChatRoleplayCreationReplayDoesNotReturnDeletedCharacter`; negative control `/tmp/omninudge-roleplay-control.Fdu222/deleted-replay-reverse.patch` failed status assertion (expected 409, got 200), fixed copy passed.
- F-009 (medium, C1/F4, character slot count): the studio options counted only active roleplay characters, but the transactional limit counted deleted rows. A deleted character therefore appeared to free a slot that creation refused to use. The transaction now counts only active rows. Regression `TestDeletedRoleplayFreesAPlanSlot`; negative control `/tmp/omninudge-roleplay-control.Fdu222/deleted-slot-reverse.patch` failed on the replacement insert, fixed copy passed.
- F-010 (high, B2/B5, portrait browser URL): all eight provider jobs succeeded, but the candidate images used `/api/v1/...` on the frontend origin, whose Vite server has no API proxy. Four anime images and four realistic images rendered as broken tiles. The picker now builds the private API URL and sends the session cookie. Regression `loads each picture through its own route, never a storage path`; negative control `/tmp/omninudge-roleplay-control.Fdu222/portrait-url-reverse.patch` failed asserting the missing API origin; fixed test passed and live browser read all eight images at width 768.
- F-011 (high, B5/C4, anime medium): the student/anime jobs sent `anime artwork` in the actual prompt but RunPod v54 used `SG161222/RealVisXL_V5.0` for both sets; all four anime outputs were photographs. Added a distinct anime endpoint and fail-closed routing. The creator exposes anime only when a distinct endpoint is configured, and a forged anime submission is refused otherwise. Regressions `TestAnAnimeCharacterIsNotRenderedAsAPhotograph`, `TestAnimeImageSpecFailsWithoutAnimeEndpoint`, `TestOmniChatRoleplayCreationOptionsReturnCuratedChoices`, `TestRoleplayCreationRejectsAnimeWithoutAnAnimeEndpoint`, frontend availability test and config loader assertion. Negative controls in `/tmp/omninudge-roleplay-control.Fdu222/anime-{route,alias,config,options,create-gate,ui}-reverse.patch` failed their assertions. A separate live four-job trial reported `cagliostrolab/animagine-xl-3.1` on each result; three cleared portrait review and displayed as anime. One was refused by the existing portrait standard, not by the provider.
- F-012 (low, B2, picker text): roleplay profiles have no `omniai_appearance`, so chat uses neutral pronouns and displayed `they looks` / `they appears`. Added pronoun-based verb agreement. Regression `uses plural verb agreement when the character gender is unknown`; negative control `/tmp/omninudge-roleplay-control.Fdu222/pronouns-reverse.patch` failed on the old wording; fixed test passed.
- F-013 (high, E1, sibling OmniAI creator): the image worker route is shared by roleplay and OmniAI, but only roleplay creation initially hid and rejected anime when the endpoint was absent. An OmniAI creator could still complete ten screens and receive no portraits. Filtered the existing OmniAI options response and rejected unsupported anime before claiming the request. Regressions `TestOmniAIOptionsHideAnimeWithoutItsImageEndpoint` and `TestOmniAICreationRejectsAnimeWithoutItsImageEndpoint`; negative controls `/tmp/omninudge-roleplay-control.Fdu222/omniai-anime-{options,create}-reverse.patch` failed their options/503 assertions; fixed tests passed.
- F-014 (low, B2, partial portrait set): one of four real anime renders failed the existing portrait review, leaving three available pictures, but the reroll note said “These four are replaced.” Changed the note to “Your current pictures are replaced.” Regression `prices the set from what the server charges` now asserts the partial-set count and accurate note. The isolated reverse patch `/tmp/omninudge-roleplay-control.Fdu222/partial-portrait-copy-reverse.patch` compiled but failed the exact copy assertion; the fixed copy passed.
- F-015 (medium, C4/F4, RunPod endpoint scaling): the anime endpoint had zero minimum and one maximum worker, but retained the cloned 60-second billable idle timeout after a job. Set the endpoint idle timeout to five seconds through the documented API. RunPod readback confirmed `workersMin=0`, `workersMax=1`, `idleTimeout=5`; the remaining `workersStandby=1` is a FlashBoot cached worker, not an always-on minimum worker. The isolated scaling regression `/tmp/omninudge-roleplay-control.Fdu222/check_endpoint_idle.py` failed against the pre-fix 60-second configuration and passed against the live readback; its reverse patch is `/tmp/omninudge-roleplay-control.Fdu222/endpoint-idle-timeout-reverse.patch`. No additional image job was submitted.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Mapped wizard, catalog JSON, create route, model transaction, likeness queue, studio and chat consumers. |
| A2 | applied | Read prior likeness and billing reviews in `.review/a8413c5c8c1e216743c13088de4172e2937322c0.json` and `.review/f6fa4f256.json`. |
| B1 | applied | Printed complete PI/New York and student/Idaho persona artifacts; the Idaho opening exposed F-001. |
| B2 | applied | Loaded creator in signed-in browser; PI and student choices showed distinct goals and venues, with no text inputs. |
| B3 | applied | Captured two POST bodies and responses in throwaway handler probe; same UUID for two owners exposed F-002. |
| B4 | applied | Read back stored persona rows and idempotency claims from test PostgreSQL; insert/claim split exposed F-004. |
| B5 | applied | Local UI, HTTP and database implementations compared PI versus student; external image rendering remained unverified pending authorization. |
| C1 | applied | Compared client answer keys, Go answer tags, catalog IDs and media price units; slot-count mismatch found later as F-009. |
| C2 | applied | Compared catalog HTTP JSON to frontend types and create response to `BotPersona`; omitted private prompt fields are persisted for server consumers. |
| C3 | applied | Same controlled answers through compiler and handler produced matching first message and setting; render-style change reached media profile. |
| C4 | applied | Traced create claim, generation enqueue and reroll billing; unknown reroll price enabled a paid button (F-003). |
| C5 | applied | Traced `adult_restricted` across catalog, Go structs and browser types; earlier duplicate hardcoded policy exposed F-007. |
| D1 | applied | PI/realistic and student/anime compile and persist; browser goal and venue dependencies differ as expected. |
| D2 | applied | Unknown role, mismatched goal/venue, arbitrary name, injected body fields and nonadmin 18+ rejected in focused tests. |
| D3 | applied | Age 0/20/101 rejected and 21/100 accepted for the investigator; role minimum, request UUID and plan limit checked. |
| E1 | applied | Compared OmniAI and roleplay creation, likeness, edit and export siblings; found stale portrait prompt test (F-005). |
| E2 | applied | Exercised realistic/anime, admin allowed/restricted and portrait wait/retry branches; timer purity defect F-006. |
| E3 | applied | Followed validation, claim, DB and queue errors to HTTP/status or logs; failed completion rollback added under F-004. |
| E4 | applied | Verified auth, plan-slot, admin 18+ and no-upload gates in route and tests. |
| E5 | applied | Removed duplicate client/server school/family ID lists via catalog metadata (F-007). |
| F1 | applied | Focused `go test -race` on services/handlers/models passed after initial fixes. |
| F2 | applied | Reviewed per-owner advisory lock and commit boundaries; atomic claim insert fix F-004. |
| F3 | applied | Isolated PostgreSQL migration 221 up/down/up passed; dev database later confirmed scope constraint applied. |
| F4 | applied | Exercised replay and failed claim; later deleted replay and slot probes exposed F-008/F-009. |
| G1 | applied | Disposable reverse patches for F-001 through F-007 each compiled and failed their targeted assertion, then fixed copies passed. |
| G2 | applied | Hostile invalid values rejected while PI/student and allowed admin adult paths passed. |
| H1 | applied | Feature Go/frontend tests, build, lint and schema checks passed; broad handlers suite had unrelated group-invite status failure. |
| Z1 | applied | Added dev-schema stamp and catalog cardinality/reachability probes as extra techniques for the next pass. |

Findings: F-001 through F-007 fixed; provider visual output unverified.
Controls: F-001 through F-007 reverse patches and negative/positive logs in `/tmp/omninudge-roleplay-control.Fdu222`.

Additional techniques: checked the live development database migration stamp separately from the isolated migration test; enumerated all catalog references and role-goal reachability rather than sampling only the two scenarios.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried creator, claim transaction, delete path, options count, render queue and admin editor after F-001–F-007. |
| A2 | applied | Rechecked prior likeness/billing ledgers and this pass-1 ledger for known queue and reroll behavior. |
| B1 | applied | `/tmp/omninudge-roleplay-assembled-final.log` prints fully compiled PI/New York and student/Idaho profiles; opening article is now lowercase. |
| B2 | applied | Signed-in browser showed separate goal/venue lists for investigator and student and age as a select, with no input/textarea in creation. |
| B3 | applied | `/tmp/omninudge-roleplay-http-final.log` captures two 201 responses with distinct owner-scoped slugs from the same UUID. |
| B4 | applied | Same HTTP probe read back both stored scenes and completed claim rows; stored scenes differ with the chosen role and setting. |
| B5 | applied | Real local browser, HTTP handler and PostgreSQL differed as expected; paid image rendering was awaiting authorization. |
| C1 | applied | Compared active count in options and transactional insert; discrepancy after delete exposed F-009. |
| C2 | applied | Response hides private prompt/scenario by JSON tag while DB retains them for conversation consumers; browser uses ID/name. |
| C3 | applied | Sent identical PI and student answers through compiler and HTTP path; first messages and media appearance agreed. |
| C4 | applied | `/tmp/omninudge-roleplay-queue-final.log` captured four RunPod-mode queued jobs per input with SFW/no user billing; no duplicate on replay. |
| C5 | applied | Followed catalog `adult_restricted` into Go validation and React rendering; no untrusted extra answer keys enter persona. |
| D1 | applied | Two creation POSTs and persisted rows succeeded; first set of four queued jobs per input in recording store. |
| D2 | applied | Invalid role/goal/venue/name, admin-only 18+ and cross-owner ID probes rejected; owner-specific duplicate UUID succeeded. |
| D3 | applied | Role minimum age, 100/101 boundary, plan limit and same-request replay checked with focused tests. |
| E1 | applied | Compared created and deleted persona siblings: options ignored deleted rows, transaction did not (F-009). |
| E2 | applied | Exercised rendered admin 18+ allowed on PI and absent on student; reroll disabled while its price is unavailable. |
| E3 | applied | Malformed claim payload becomes service-unavailable; completed claim with deleted persona had been returned as success (F-008). |
| E4 | applied | Auth, owner-scoped access, admin 18+, active persona and slot limits checked at server, not just UI. |
| E5 | applied | Catalog remains the shared source for roles and 18+ metadata; deleted-state handling checked across options and insert. |
| F1 | applied | `go test -race` focused services/handlers/models succeeded. |
| F2 | applied | Character and claim commit in one transaction; per-owner advisory lock controls concurrent slot checks. |
| F3 | applied | Migration rollback/reapply test passed; live development DB also had migration 221 and roleplay claim scope. |
| F4 | applied | Delete then replay exposed F-008; delete then new creation exposed F-009; timeout/wait and failed claim recovery checked. |
| G1 | applied | F-008/F-009 reverse patches in disposable copy failed assertion with compiling tests and fixed copies passed. |
| G2 | applied | Deleted replay now returns 409; active replay still returns 200, and active slot counts accept a replacement. |
| H1 | applied | 40 frontend tests, targeted ESLint, TypeScript/Vite build, focused Go race tests, vet, migration and JSON checks passed. |
| Z1 | applied | Applied pass-1 live-schema and catalog-reachability techniques; added deletion/replay as a lifecycle differential for pass 3. |

Findings: F-008 and F-009 fixed; provider visual output still unverified at this point.
Controls: F-008 `/tmp/omninudge-roleplay-control.Fdu222/deleted-replay-reverse.patch`; F-009 `/tmp/omninudge-roleplay-control.Fdu222/deleted-slot-reverse.patch`; negative and fixed logs alongside them.

## Pass 3

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried wizard, server catalog, claim and persona storage, likeness job, RunPod worker, candidate content route, chat picker and delete. |
| A2 | applied | Re-read pass 1/2 and prior likeness/billing reviews before the metered provider comparison. |
| B1 | applied | PI and student prompts in `/tmp/omninudge-roleplay-queue-final.log` differ in setting and medium; actual RunPod metadata confirms anime wording reached the worker. |
| B2 | applied | Browser showed four broken candidate tiles for each live persona, exposing F-010; after the URL fix both 768px sets displayed. Neutral picker text exposed F-012. |
| B3 | applied | Eight real RunPod submissions (four per persona) appeared in the server log and status responses; no rerolls or extra generations occurred. |
| B4 | applied | Read back eight succeeded likeness job rows, owner-scoped candidates, model provenance, two stored personas and conversations; exact trial IDs were later removed. |
| B5 | applied | The two real output sets displayed side by side. Realistic images were photographs, but the purported anime set was photographic too despite anime prompt; F-011. |
| C1 | applied | Compared catalog `render_style`, media identity profile, RunPod image endpoint config and browser API origin. Discovered both styles shared RealVisXL. |
| C2 | applied | Candidate JSON returns relative content URLs; browser `img` needs absolute API origin and credentials, unlike Axios. Fixed F-010. |
| C3 | applied | For the same appearance, PI/New York and student/Idaho yielded different backdrops, but realistic/anime medium did not differ as promised. |
| C4 | applied | Eight provider jobs completed with no retry; status, result metadata and local succeeded rows agreed. Image worker model selection made anime prompt ineffective. |
| C5 | applied | Traced medium from wizard answer through extension profile, job prompt, RunPod input and result model ID; added explicit endpoint routing and availability. |
| D1 | applied | Two private characters and eight real renders succeeded; corrected content route displayed all images, and realistic-only creator remains usable. |
| D2 | applied | Tested forged anime submission without endpoint, missing endpoint and endpoint alias; each now fails closed while realistic passes. |
| D3 | applied | Four candidates each, all eight succeeded; absent vs distinct vs aliased anime endpoint checked in unit tests. |
| E1 | applied | Compared likeness picker with ordinary generated-media viewer, which already uses the API origin and `crossOrigin=use-credentials`; F-010. |
| E2 | applied | Anime prompt branch was reachable but output still photographic; after fix, anime choice is unavailable without a distinct endpoint. |
| E3 | applied | Failed portrait content URL was silently a broken image element; corrected URL verified by naturalWidth, while server-side unavailable endpoint becomes a 503. |
| E4 | applied | Creation and image worker now both gate anime on a distinct configured endpoint; browser hides the unavailable choice. |
| E5 | applied | Kept one config method for endpoint availability and used it in server setup and queue; candidate URL is built from scoped IDs rather than trusting supplied URL. |
| F1 | applied | Focused Go race suite across services, handlers, models, queue and config passed after fixes. |
| F2 | applied | Create claim remains transactional; portrait completion and private candidate rows agree; no partial-running job remained after the eight results. |
| F3 | applied | Migration 221 rollback/reapply test passed earlier and dev schema retained the claim scope; no new migration was needed for style routing. |
| F4 | applied | Reloaded picker via chat, deleted both exact test personas and archived their exact test conversations; deletion hid them from studio. |
| G1 | applied | Disposable reverse patches for F-010 through F-012 compiled and failed targeted assertions; original tests passed. |
| G2 | applied | With no anime endpoint, live wizard offers only realistic; forged anime and aliased endpoint fail, while realistic pipeline passed the trial. |
| H1 | applied | 42 frontend tests, focused Go race suite, Go vet, targeted lint and Vite/TypeScript build passed. Broader group-invite handler test remains independently failing. |
| Z1 | applied | Used provider result `actual_prompt`, checkpoint ID and worker build in addition to visual comparison; this prevents a prompt-only style test from claiming visual correctness. |

Findings: F-010, F-011 and F-012 fixed at code boundary. The anime-specific real-system comparison remains unverified because no separate endpoint exists.
Controls: `/tmp/omninudge-roleplay-control.Fdu222/portrait-url-reverse.patch`, `pronouns-reverse.patch` and `anime-{route,alias,config,options,create-gate,ui}-reverse.patch`, with assertion-failure logs beside them.

Additional techniques: captured provider-reported checkpoint and actual rendered prompt, inspected eight browser image elements for naturalWidth, and checked exact trial-persona and conversation deletion IDs rather than trusting a name-only list.

## Pass 4

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-mapped shared image queue into both roleplay and older OmniAI creator, their options APIs, create handlers, picker and worker. |
| A2 | applied | Re-read passes 1–3 and earlier likeness/billing reviews before sibling tracing. |
| B1 | applied | Reprinted PI/realistic and student/anime compiled profiles and queued prompts; style is explicit in the latter payload. |
| B2 | applied | Live roleplay wizard offered only realistic with no anime endpoint; OmniAI options still exposed anime, revealing F-013. |
| B3 | applied | Captured options response and forged anime POST at both creator endpoints; roleplay refused while OmniAI initially accepted. |
| B4 | applied | Confirmed the roleplay claim was not stored for refused anime; the older OmniAI path would have claimed and stored a persona before render. |
| B5 | applied | Compared the eight real provider outputs from pass 3 and current browser render; anime remained photographic before endpoint separation. |
| C1 | applied | Compared `render_style` names, available endpoint predicate, provider endpoint IDs and both creator option shapes. |
| C2 | applied | Both creators now return render choices according to server availability; neither relies solely on UI hiding. |
| C3 | applied | Identical forged anime choice with no endpoint now returns 503 in both creator handlers, while realistic creation remains accepted. |
| C4 | applied | Shared worker uses distinct endpoint; no-endpoint request stops before a metered provider submission or creation claim. |
| C5 | applied | Traced config loader → server wiring → both handlers → queue selection; missing OmniAI gate was F-013. |
| D1 | applied | Existing realistic create and both creator options tests passed with configured realistic endpoint. |
| D2 | applied | Absent and aliased anime endpoints, forged anime body, stale UI choice and nonadmin 18+ reject in focused probes. |
| D3 | applied | Zero endpoint, one distinct endpoint and endpoint alias cases exercise availability boundary. |
| E1 | applied | Sibling comparison found OmniAI still advertising unsupported anime (F-013). |
| E2 | applied | Anime option reachable only with distinct endpoint after both handlers changed; realistic stays reachable. |
| E3 | applied | Unsupported anime returns 503 before claim; failed image path remains a separate queue error. |
| E4 | applied | Both server create handlers now gate unsupported anime regardless of frontend option state. |
| E5 | applied | Reused the one endpoint-availability flag for both creator handlers. |
| F1 | applied | Focused `go test -race` for handlers, queue and config passed after F-013. |
| F2 | applied | Verified the OmniAI rejection occurs before idempotency claim, matching roleplay's boundary. |
| F3 | applied | Isolated migration 221 rollback/reapply passed; F-013 added no schema change. |
| F4 | applied | Tested fresh and replay paths, deleted-persona replay and stale UI style selection. |
| G1 | applied | OmniAI options and create-gate reverse patches compiled and failed their respective assertions; fixed copies passed. |
| G2 | applied | Forged unsupported anime failed in OmniAI, whereas its existing supported creation tests still passed. |
| H1 | applied | Focused Go race tests, vet, frontend suites, lint and build passed; broad group-invite status failure remains unrelated. |
| Z1 | applied | Extended pass-3 model provenance check to all creator siblings rather than only the new wizard. |

Findings: F-013 fixed. An anime-specific live output comparison remained pending endpoint creation.
Controls: `/tmp/omninudge-roleplay-control.Fdu222/omniai-anime-options-reverse.patch` and `omniai-anime-create-reverse.patch`, with negative logs alongside them.

Additional techniques: checked the entire endpoint-advertisement surface, including the older OmniAI creator, before inviting an actual metered trial.

## Pass 5

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried wizard, both creator handlers, RunPod routing/template, portrait review, browser picker and deletion path. |
| A2 | applied | Reviewed passes 1–4 and prior media/billing evidence before provisioning. |
| B1 | applied | Student trial saved a complete prompt including 22-year-old woman, pink hair, green eyes, campus clothing, Idaho and anime medium; compared it to PI realistic prompt. |
| B2 | applied | Signed-in creator offered Anime when endpoint was configured. Three displayed candidates were anime; the fourth was refused. The note still said “These four,” revealing F-014. |
| B3 | applied | Four actual `likeness` jobs routed to endpoint `riszcbluezj9lu`; provider statuses all completed with model `cagliostrolab/animagine-xl-3.1`, worker v54. |
| B4 | applied | Persona 30 and four job rows read back; three candidates persisted, one `portrait_standard_refused`; deletion made persona inactive. |
| B5 | applied | Inspected first trial's four realistic photographs against three displayed anime images. Medium now differs as promised; one generated anime image was rejected by portrait review. |
| C1 | applied | Distinct anime endpoint ID, SDXL model name, worker image, 0/1 worker limits and API config agreed across RunPod and local env. |
| C2 | applied | Provider output model/build and private content route matched backend result; browser loaded the three approved image tiles. |
| C3 | applied | Same student/anime choices now yield drawn anime rather than the prior photographic outputs; realistic route remains RealVisXL. |
| C4 | applied | Exactly four submitted provider jobs, no rerolls or retries; RunPod completed all, app accepted three and permanently rejected one by portrait policy. |
| C5 | applied | Followed anime selection through answer JSON, persona profile, generation job, endpoint ID, checkpoint and browser candidate. |
| D1 | applied | Real anime create returned 201, all four jobs completed, three portraits loaded and could be chosen. |
| D2 | applied | Forged anime request fails closed without endpoint; private candidate route remains owner-scoped, refused output never reaches picker. |
| D3 | applied | Config zero/distinct/alias cases, four requested jobs, three accepted and one refused tested; worker min/max read back as 0/1. |
| E1 | applied | Rechecked OmniAI sibling after F-013: options and creation both gate anime without endpoint. |
| E2 | applied | Live anime path reached the model; portrait-refusal path proved partial-set UI branch reachable. |
| E3 | applied | Portrait standard rejection reached `failed` job status and left three candidates; misleading replacement copy exposed F-014. |
| E4 | applied | Admin-only 18+ and distinct anime endpoint gates remain enforced before creation or generation. |
| E5 | applied | One server endpoint predicate serves both creators and queue; picker is shared by both. |
| F1 | applied | Focused backend race suite passed; no queue duplicate was observed in four-job run. |
| F2 | applied | Persona and idempotency claim committed together; each completed job wrote at most one candidate; refusal wrote none. |
| F3 | applied | Isolated migration ladder remained green; RunPod provisioning required no DB schema change. |
| F4 | applied | Browser delete soft-deleted exact persona 30; studio showed only Nadia and Futaba; DB has four jobs/three retained candidates by policy. |
| G1 | applied | F-013 controls stayed failing when reversed; F-014 control was prepared after the real partial-set observation. |
| G2 | applied | Endpoint available in live creator, absent-endpoint forged input denied in tests, and refusal never displayed its image. |
| H1 | applied | Backend race/vet/migration, frontend 42-test suite, lint, build and diff check passed after F-013; F-014 then changed copy. |
| Z1 | applied | Added provider model/build metadata and actual app moderation result to visual comparison, catching a partial set the provider alone could not show. |

Findings: F-014 fixed. One of four anime renders was rejected by the existing portrait review; the other three visibly use the anime medium. The rejected output was not shown.
Controls: `/tmp/omninudge-roleplay-control.Fdu222/partial-portrait-copy-reverse.patch`; targeted assertion failed on old wording, fixed copy passed.

Additional techniques: compared provider completion against app-level acceptance, and checked exact job/candidate counts after deletion so a refused render cannot be mistaken for a provider failure.

## Pass 6

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Rechecked final diff and all creator, config, queue, persisted persona, picker, and RunPod template/endpoint consumers after F-014. |
| A2 | applied | Re-read passes 1–5, prior likeness/billing limitations, and F-014 control result before final verification. |
| B1 | applied | Rechecked assembled PI/realistic and student/anime prompt artifacts; the latter's actual provider request retained anime medium. |
| B2 | applied | Restarted Vite on final copy, inspected concept screen with role-dependent selectors and no free-text fields; reviewed the retained three-image anime browser capture and corrected partial-set copy test. |
| B3 | applied | Read four provider status results, all with Animagine model/v54; compared original PI job artifacts from first trial and final student create payload. |
| B4 | applied | Read exact persona 30 inactive state, four job rows and three approved candidates; earlier PI/student rows and claims remain owner-scoped. |
| B5 | applied | Recompared retained real-system output captures: realistic set is photographic, anime set is drawn. F-014 changed only explanatory UI copy, so no new metered render was required to verify model output. |
| C1 | applied | RunPod readback still reports distinct endpoint, Animagine checkpoint, worker v54 and 0/1 scaling; Go config and client style names match. |
| C2 | applied | Candidate private URL and cookie mode matched browser load; partial-set note no longer assumes all four passed. |
| C3 | applied | PI versus student role/goal/setting and realistic versus anime media branches differ in compiled and real outputs as selected. |
| C4 | applied | Four-job cap held; no retries or paid rerolls. One provider completion failed the stricter app portrait check and was withheld. |
| C5 | applied | Traced each choice to catalog, create payload, persona profile, job, endpoint, model result and picker; both creators gate endpoint availability. |
| D1 | applied | Valid realistic and anime creation paths exercised in live trials; three accepted anime portraits displayed. |
| D2 | applied | Invalid catalog IDs, arbitrary client text, nonadmin 18+, cross-owner and forged unsupported anime probes failed as tested. |
| D3 | applied | Age bounds, slot limit, endpoint absent/distinct/alias, four requested jobs and one moderation refusal remain covered. |
| E1 | applied | OmniAI and roleplay options/create handlers, chat, studio and shared picker checked for sibling omissions; none new. |
| E2 | applied | Available anime is reachable, unavailable anime hidden/refused; partial candidate set and reroll description are reachable in the regression. |
| E3 | applied | Claim, queue, provider, portrait review and API error paths preserve typed failure; refused image is not surfaced as a candidate. |
| E4 | applied | Auth, owner, adult, quota, endpoint and price-known gates checked across server/client; no new missing gate. |
| E5 | applied | Catalog remains server-owned; one endpoint predicate for both creators; reroll price derives from server and current-picture note does not duplicate count. |
| F1 | applied | Final `go test -race` across services, handlers, models, queue and config passed. |
| F2 | applied | Owner lock and single character/claim transaction rechecked; media candidate uniqueness and refusal path do not publish partial assets. |
| F3 | applied | Migration 221 rollback/reapply passed in isolated PostgreSQL; live DB has the claim scope. |
| F4 | applied | Verified persona 30 deletion, no active trial character, no duplicate/retried jobs, 0/1 endpoint scaling and retained candidates under soft-delete policy. |
| G1 | applied | All fourteen finding controls have assertion failures in disposable copy; F-014's exact copy reversal compiled, failed and passed again after restoration. |
| G2 | applied | No-endpoint hostile anime fails, configured anime passes real provider run, admin/nonadmin and partial-set controls preserve allowed paths. |
| H1 | applied | Final frontend 42 tests, ESLint, TypeScript/Vite build, focused Go race suite, vet, migration test, JSON parse and `git diff --check` passed. Broad unrelated group-invite handler test failure remains. |
| Z1 | applied | Reused provider-vs-moderation accounting and exact deleted-row check from pass 5; no additional technique or finding arose. |

Findings: F-015 discovered on post-pass cost readback and fixed before the next pass.
Controls: F-001–F-014 disposable reverse patches and negative/positive logs are under `/tmp/omninudge-roleplay-control.Fdu222`; no working-tree file was reversed.

Additional techniques: rechecked the real endpoint template and scale limits after the metered trial, not just at creation, and distinguished raw provider completion from app approval. A closer read of the provider's idle-timeout contract exposed F-015 after the pass.

## Pass 7

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried final diff and the wizard, two creator handlers, catalog, persisted persona, image queue, RunPod template, picker and delete paths after the endpoint idle-timeout change. |
| A2 | applied | Re-read passes 1–6, prior likeness and billing reviews, and RunPod endpoint lifecycle documentation before finalizing the scaling finding. |
| B1 | applied | Compared the retained assembled investigator/New York/realistic and student/Idaho/anime payloads; role, goal, location and medium differ as selected. |
| B2 | applied | Inspected the current signed-in concept page after Vite restart: investigator and college-student role groups yield distinct options, with no free-text input; the accepted anime tiles were visually reviewed in the live trial. |
| B3 | applied | Rechecked four provider job statuses and the actual model reported by each; the read-only endpoint request showed the new idle timeout and did not submit a job. |
| B4 | applied | Re-read exact trial job states: three succeeded and one app-level portrait refusal; persona 30 remains inactive and the three approved private candidates are retained by soft-delete policy. |
| B5 | applied | Compared the retained real-system realistic photographs and three accepted anime images side by side. The endpoint-only scaling change does not change the model, worker, prompts or displayed candidates. |
| C1 | applied | RunPod readback matches local anime endpoint ID and template; model ID remains Animagine, and workersMin/max/idleTimeout are 0/1/5. |
| C2 | applied | The private candidate content route still resolves in the picker with credentials; the partial-set note matches three accepted images. |
| C3 | applied | Investigator and student inputs still compile to distinct goals and settings, while realistic and anime remain routed to different checkpoints. |
| C4 | applied | Four provider jobs completed without retry, three accepted and one refused; zero minimum worker and five-second billable post-job idle window bound cost while one maximum worker bounds concurrency. |
| C5 | applied | Traced catalog choice through create response, media profile, job, endpoint, provider result and picker; both creator handlers use the same anime-availability gate. |
| D1 | applied | Prior live realistic and anime creations succeeded; the current signed-in concept screen loads and offers role-dependent choices. |
| D2 | applied | Existing hostile catalog IDs, arbitrary text, cross-owner, nonadmin 18+ and missing/aliased anime endpoint regressions still reject. |
| D3 | applied | Verified zero/one worker bounds and five-second idle threshold; role-age, slot and four-portrait limits remain covered by focused tests. |
| E1 | applied | Rechecked roleplay and OmniAI creator siblings and their shared likeness picker; neither advertises anime without a distinct endpoint. |
| E2 | applied | Current live creator reaches the education branch and goal list; configured anime branch reached the model and the partial-set branch reached the picker in the live trial. |
| E3 | applied | One moderation refusal remains a failed app job with no candidate; endpoint PATCH rejected unsupported standby field and accepted documented idle timeout without losing 0/1 worker limits. |
| E4 | applied | Auth, owner, adult, price-known, slot and endpoint gates remain enforced in their server paths; the UI's absent-endpoint choice is not the only gate. |
| E5 | applied | Server-owned catalog and one endpoint predicate still supply both creators; no additional worker-scaling default was introduced into app code. |
| F1 | applied | Focused Go race suite passed again after the external setting change. |
| F2 | applied | Owner lock, atomic persona/claim transaction, unique media candidate and refusal-without-publication boundaries remain as tested. |
| F3 | applied | Isolated migration 221 rollback/reapply passed again; endpoint configuration required no database migration. |
| F4 | applied | Exact trial persona remains inactive, four jobs and three candidates account for all output, and the provider's post-job idle timeout is now five seconds. |
| G1 | applied | F-001–F-014 disposable reverse controls remain assertion failures; F-015's isolated 60-second configuration failed the cost-bound assertion and live five-second configuration passed. |
| G2 | applied | Unavailable anime remains rejected before claim while configured anime produced real images; the scaling check rejects 60 seconds while accepting current 0/1/5. |
| H1 | applied | Focused Go race suite, vet, migration test, 42 frontend tests, targeted lint, production build, JSON parse and diff check passed; an unrelated broad group-invite handler assertion remains separately failing. |
| Z1 | applied | Applied pass-6 post-trial endpoint readback and provider-vs-moderation accounting; the current readback and isolated scaling control found no further defect. |

Findings: none
Controls: `/tmp/omninudge-roleplay-control.Fdu222` contains isolated F-001–F-015 reversals and their failing controls; the working tree was not reversed.

Additional techniques: paired a provider readback with an isolated before/after scaling assertion to distinguish a cached FlashBoot worker from an always-on minimum worker without submitting another metered image request.
