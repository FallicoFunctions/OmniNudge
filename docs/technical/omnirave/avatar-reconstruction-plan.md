# OmniAvatar reconstruction comparison and launch acceptance plan

Status: original planning draft dated 2026-09-04, revised 2026-09-05 UTC; implementation status updated 2026-09-13 UTC. Architecture agreed in discussion; numerical thresholds, benchmark scope, and spending below remain proposals. The current implementation summary below supersedes the historical checkpoints' descriptions of what has reached the runtime.

## Current priority: finish OmniRave for release

Nick redirected the work to shipping OmniRave with the male and female launch avatars. Each needs one complete outfit and working gameplay. Additional clothing options are deferred if they delay release. The OmniAI conversion pipeline, reconstruction-provider experiments and Fiverr hiring are deferred; no spending is authorized. This priority supersedes the earlier combined launch requirements and experiment recommendations below. The separate OmniAI requirement of 100% identity fidelity remains recorded for future work.

The current implementation adds the two complete characters to the normal signed-in Avatar panel. Selection loads the actual model before publishing or saving it, retains the current character if loading fails, and uses the existing account and multiplayer appearance path. Each newly selected character starts with its complete outfit. Existing guest signup behavior and explicit design previews remain. One outfit per character is the release scope; the existing visibility controls do not imply an alternate clothing catalog.

The live check also exposed a WebGPU startup hang before the loading UI. Startup now displays loading feedback during engine initialization and falls back to WebGL after a failed or ten-second stalled attempt, using a fresh canvas. A late WebGPU completion is disposed. Rejection, timeout and late completion are covered by tests; the final browser startup succeeded.

September 14 continuation: the female ponytail has fuller coverage with the same topology and secondary controls. Lossless avatar delivery is implemented for all six models: hero transfers are 19.4 MiB male and 15.6 MiB female. The production build loaded both characters and eight moving venue peers with ordinary avatar downloads blocked. Fixed 720p crowd checks on this M1/16 GiB/AC machine measured 60 FPS at 8 and 16 characters and 37.1 FPS at 32; the complete venue showed about 30 FPS with eight peers under automatic resolution. These are local results, not an acceptance of other devices, networks or the production account environment. Extra outfits and reconstruction-provider work remain deferred.

Current checks and views are in [launch-release-20260913](../../../omnirave-babylon/assets-src/avatars/complete-pair-study/launch-release-20260913/). The source models and current renders still have documented visual differences from the original artwork. Technical checks do not constitute visual approval or whole-game release acceptance. The live production account environment and controlled crowd performance remain outside the local selector check.

## Pipeline reassessment — 2026-09-13

### OmniAI identity requirement and artist fulfillment option

Nick reaffirmed that this pipeline serves users converting their existing OmniAI into a playable character for OmniGames. The required likeness is 100%: the 3D result must preserve that specific OmniAI's identity, face, proportions, hair, skin, distinguishing details and visual style. The authored launch-pair allowance for a close face does not apply. A successful technical import or a numerical similarity score cannot substitute for identity acceptance. No automated or artist route has yet proved this requirement and the couple-of-hours turnaround together.

The next pipeline benchmark must use an actual approved OmniAI identity pack. The dressed launch pair can supply technical comparison assets, but matching its complex clothing is a separate authored-wardrobe problem. Automated OmniAI conversion uses the established consistent body references and fitted OmniGames wardrobe; arbitrary profile-image outfit reconstruction remains optional. A realistic human and an anime human are needed before claiming support for both. Original 2D identity references remain authoritative; inferred unseen views require consistency review and cannot redefine that identity.

Artist fulfillment is now an option under consideration, not an approved hire or replacement for the long-term automation objective. Recommended initial evaluation: one paid pilot with a character artist experienced in likeness and game deformation, followed by an unseen identity if the first passes. Use the same identity and runtime acceptance requirements as automation. Establish likeness in fixed front and oblique previews before completing the rig; accept the finished asset only after animation, fitted clothing swaps and the intended game import pass. A marketplace portfolio or advertised “100% likeness” is not proof.

If a pilot succeeds, a small consistent artist team could fulfill early requests through a managed queue. Each accepted OmniAI receives one versioned editable master, retained with its identity references and approval history. Compatible OmniGames reuse it; required game variants derive from that master and are cached. Do not commission the same identity anew for every game or session. Automation can handle preparation, packaging, checks and compatible game variants; reconstruction assistance is useful only when it reduces the artist's total correction time without changing identity. This preserves the service workflow while its creation step is human-operated.

An artist quote must cover identity correction and revisions, editable source and textures, the required body/facial rig and deformation, separate fitted wardrobe compatibility, the first playable game import, permitted delivery and use by OmniGames users, total price, calendar turnaround and sustained weekly capacity. Compare cost per accepted playable identity, including internal review and rework. No price, staffing capacity or two-hour artist delivery is established. User identity approval should be explicit; its waiting time belongs in customer turnaround, separately from production labor.

For orientation only, public Fiverr listings checked September 13 advertised a [$175 starter character with 14-day delivery](https://www.fiverr.com/tauseefejaz/do-3d-game-characters) and a [$750 character package with 14-day delivery](https://www.fiverr.com/xandra3d/create-a-rigged-3d-game-character-model-ready-for-animation?pckg_id=1). Package scopes differ, and neither is a quote or verified match for OmniAI's requirements. [Custom offers](https://help.fiverr.com/hc/en-us/articles/360010559198-Creating-and-managing-custom-offers) support defined scope, pricing, delivery and revisions. No seller has been contacted, no user references have been sent, and no order has been placed.

### Earlier timed automation proposal

Nick's current requirement is a repeatable image-to-exact-likeness playable-character route taking a couple of hours per character. The current bespoke Blender refinement route has not demonstrated that turnaround or the required likeness. Further individual hair/fabric refinement is paused while the conversion approach is reassessed. This section supersedes the recommendation below to keep route A as the primary experiment; the remaining historical sections document previous decisions and evidence.

The earlier Tripo benchmark already generated the detailed male source in 2 minutes 13 seconds. Its fused construction, absent rig, and 1.45 million triangles prevented acceptance. Segmentation produced 14 parts but left head and hair together. These existing sources are diagnostic comparison inputs, not accepted avatars. The unresolved experiment is whether reconstruction can survive separation, reduction, rigging and runtime conversion without losing likeness. Rebuilding every visible feature by hand has not proved an economical solution.

Earlier proposed automation test: one character, one timed conversion attempt. Following the OmniAI clarification above, use an actual approved OmniAI identity pack; the existing detailed Tripo source is only a historical technical baseline. Meshy is an independent candidate if a new provider trial is authorized; current official documentation supports multi-image generation, pose normalization, remeshing and rigging, but does not establish exact likeness or our modular wardrobe requirements. No new provider upload, purchase or generation is authorized by this recommendation.

| Elapsed-time limit | Required evidence |
| --- | --- |
| 30 minutes | Original-versus-candidate full-body and face views at comparable framing, plus an oblique view. Inspect proportions, silhouette, outfit construction, hair and accessories before accepting a candidate for conversion. Reject visibly wrong candidates instead of beginning prolonged sculpting. |
| 90 minutes | Reduced mesh, preserved texture detail, actual garment/hair separation and rigged deformation in idle, walk, run and crouch. A fused dressed shell can establish a technical animation result but fails the modular requirement. |
| 120 minutes | The candidate controlled in Babylon, a recorded clothing swap, reference comparison after conversion, actual elapsed time and costs, and an explicit pass or failure for each requirement. Unfinished work is a failed timing result; do not silently extend the experiment into another day. |

These are proposed experiment deadlines, not validated service latency or a promise of acceptance. Count preparation, provider queues, retries and cleanup in elapsed time. The existing runtime, networking, wardrobe and account work should be reused where compatible. Model-specific binding and clothing compatibility still need checking. Keep all existing launch-pair assets and fixed hardware placements intact during a new isolated experiment.

Exact reference fidelity remains the criterion; speed does not authorize a visually approximate substitute. A single image leaves unseen surfaces unspecified. Generated supporting views must remain identified as inferred. Facial discretion for the authored launch pair remains Nick's judgment; automated OmniAI conversion still requires identity preservation. One accepted character would establish feasibility only; repeat the successful procedure on an unseen character before claiming a repeatable pipeline. Initial pipeline implementation time must be reported separately from measured per-character conversion time.

Current capability sources checked September 13: [Tripo multiview](https://docs.tripo3d.ai/model-generation/multiview-to-model-p1-20260311.html), [Tripo rigging and mesh-edit ordering](https://docs.tripo3d.ai/animation/rig-v2-5-20260210.html), [Meshy multi-image generation](https://docs.meshy.ai/en/api/multi-image-to-3d), [Meshy rigging](https://docs.meshy.ai/en/api/rigging). Historical prices below require verification before any new trial.

The last female hair export completed at all three detail levels with zero glTF errors. Fresh browser views, material report hashes, production build and the combined current-state manifest for that refinement remain unfinished because the work was paused for this reassessment. Earlier current-state hashes must not be presented as evidence for those latest files.

## Current launch-pair implementation — 2026-09-13

The current editable pair and review assets are in [complete-pair-study](../../../omnirave-babylon/assets-src/avatars/complete-pair-study/README.md). Both characters load in Babylon with the existing outfits, independent garment visibility, expressions, idle/walk/run animation and three distance levels. The local venue preview supports browser-saved wardrobes. Live multiplayer transfers the selected complete character and its visibility flags; remote copies share source assets while retaining independent rigs, expressions and wardrobe state. Replacements preserve the last working model and release stale or departed copies. WebGPU, distance changes, eight moving peers and departure cleanup have been checked locally.

Stationary clients suppress duplicate movement only after the server confirms their position. Unconfirmed targets still retry through the server's movement clamp, and reconnect/respawn clears queued positions. A live WebGPU client and passive socket observer confirmed checkpoint catch-up, respawn, continued presence and the scheduler's one room snapshot per second while stationary.

Complete-character crouch now bends the existing rigs while retaining ankle position and foot orientation. Interruptible 0.22-second transitions layer over idle/walk, and remote copies receive transient posture with matching collision height and grounding. Pose-only changes survive movement suppression; respawn restores standing. All six production rigs passed finite pose checks, and WebGPU/WebGL clients verified the remote crouch/stand/respawn sequence. That crouch implementation preserves the rig and clips used by the subsequent visual refinement. [Crouch validation](../../../omnirave-babylon/assets-src/avatars/complete-pair-study/crouch-validation.json) records the tests, screenshots and remaining action limits.

Saved complete looks now restore from session handoffs, login responses and the first authoritative snapshot before the client publishes its appearance. Login/logout switch the local body in place, retain the working body during loading, reject stale completions and rebind wardrobe controls. Ordinary reconnects retain session edits. Local WebGPU/WebGL session fixtures verified both characters and a subsequent clothing change on another client. The earlier restoration batch passed 119 tests and a separate runtime login/logout integration test.

Subsequent authenticated wardrobe edits now save through the existing account profile API. Ordered writes, failed-save retry, expired-credential reauthentication and account isolation are covered by runtime tests. Initial restoration and explicit character previews do not write account profiles. Field-specific database updates preserve unrelated settings, venue and return-point data during concurrent saves. Protected-route tests and an isolated PostgreSQL test database cover persistence and credential boundaries; the local browser fixture checks saving and a fresh account launch. [Account profile validation](../../../omnirave-babylon/assets-src/avatars/complete-pair-study/account-profile-validation.json) records this scope. Production account acceptance remains outstanding.

The current visual pass updates both characters’ fabric materials and the female swept hairline. It preserves existing zipper/hardware placements, the body and other garment geometry, the rig, skin weights, corrective shapes and animation data. The material pass is checked across all six GLBs; the hairline is transferred through native vertex correspondence at all three female detail levels. Native material-boundary and groom-motion checks pass. These are incremental visual changes; exact likeness and launch acceptance remain outstanding.

The [current validation record](../../../omnirave-babylon/assets-src/avatars/complete-pair-study/current-state-validation.json) identifies the exact files and evidence. The earlier multiplayer runtime run passed 163 tests in 18 files; its focused follow-ups covered 194 unique cases, including 27 socket tests. The restoration checks above are recorded separately. The production build and six GLB validations pass. Seventeen native audit runs cover their recorded finite samples. These checks do not constitute launch acceptance or certify arbitrary continuous motion.

| Gate | Current evidence | Still required |
| --- | --- | --- |
| G1: Body and facial fidelity | Finished-pair views and playable previews are available for review. | User acceptance remains pending. Visual work resumed: fabric optics and the female hairline have been revised. Garment folds, hair styling, painted details, footwear and the coating still differ from the artwork. Existing zipper/hardware placement stays fixed. All new nonfacial work must follow the reference; the face may remain an approximation. |
| G2: Conversion | Six validated GLBs load in Babylon; distance changes retain wardrobe and animation phase. | Acceptance of appearance and deformation at each intended viewing distance; simplified surfaces are outside the native contact certification. |
| G3: Modularity | Six visibility slots, attached-accessory behavior, browser persistence, saved-session restoration, authenticated profile saving and live remote synchronization work. | Two fitted clothing options per slot and supported outfit swaps in motion. Visibility toggles alone do not pass this gate. Production account acceptance remains pending. |
| G4: Playability | Idle/walk/run, expressions, joint retargeting, sampled garment deformation, repeated-snapshot gait continuity and complete-character crouch/stand transitions have evidence. Crouch also reaches remote clients and resets on respawn. | Remaining action coverage from the gate below, including dance and broader transition review; continuous-motion acceptance beyond the recorded crouch samples. |
| G5: Runtime | Bounded shared sources, distance levels, off-screen pose deferral, WebGPU buffer handling and departure cleanup are implemented. | An agreed device/crowd budget and a passing controlled benchmark. The recorded 32-character battery/Low Power Mode run was 8 FPS and does not establish launch readiness or a performance gain. |
| G6: Repeatability | Existing job infrastructure and historical reconstruction experiments remain available. | The automated OmniAI pipeline and unseen human/anime validation. Authored launch-pair work does not pass this gate. |

The complete pair is available through local review/preview routes and an existing valid complete-character session loadout. It has not replaced the default generated player avatar or been deployed. Historical study checkpoints below retain their original scope and results; use the current validation record for the present runtime state.

User priority clarified 2026-09-05: the two authored OmniRave launch characters and the OmniAI conversion pipeline have different facial acceptance requirements. For the launch pair, prioritize matching the reference bodies and completing rigging, animation, and modular wardrobe. Aim for complete facial likeness, but Nick may accept a close face after judging the finished playable character. For OmniAI conversion, preserving the existing 2D character's facial identity is mandatory; launch-pair discretion does not relax that requirement.

## 1. Agreed product scope

- Launch requires both the male/female OmniRave avatars with interchangeable clothing, hair, and accessories, and an automated OmniAI-to-playable-avatar pipeline.
- The first two OmniRave avatars are unique authored characters, not conversions of existing OmniAIs. Their immediate priority is the same physical body as the reference: proportions, silhouette, anatomy, and build, with usable topology, rig, animation, and separate clothing. Do not substitute an unverified generic body or keep body/playability work waiting for facial perfection.
- Nick wants 100% facial likeness for both tracks. For the launch pair only, a face he judges around 95–97% may be considered after the body, rig, animation, and wardrobe are complete; this is a future judgment call, not advance approval or a numerical pass threshold. OmniAI conversion retains the full facial-identity requirement. These percentages express visual intent, not a validated similarity metric or a guarantee that unobserved geometry can be recovered.
- Launch OmniAIs may be realistic humans or anime humans. Nonhuman rigs are outside this initial scope.
- At OmniAI creation, the backend silently prepares 4–6 consistent full-body T-pose images in fitted gym wear. The 3D job starts only when the user requests it. This is intended behavior, not a verified existing OmniChat integration.
- Gym wear is reconstruction input and must not become the avatar's permanent skin or launch outfit. Generated avatars receive fitted OmniRave wardrobe items. Reconstructing arbitrary profile-picture outfits is an optional later capability.
- The two authored launch outfits still need to resemble their approved full-body artwork. They are wardrobe assets, separate from automated body reconstruction.
- Preserve an editable master avatar and original identity references. Reuse that master across compatible games; create and cache a game-specific variant only when required and requested. New variants derive from the master and originals, never from another game's altered version.
- Individual physique support remains undecided. Initial experiments should preserve proportions within a proposed humanoid fitting range, without silently substituting a generic body. Establish that range from fitting tests and obtain a product decision before making it a launch eligibility restriction.
- Development machine: 2020 M1 MacBook Pro, 16 GB unified memory, 1 TB storage. Minimum client memory target: 8 GB. This does not imply support for every 8 GB device.
- Paid tools are acceptable for consideration. Present exact operations, costs, and inputs before spending or uploading to a new service. Existing historical vendor balances are not current spending authorization.

## 2. Existing evidence and reusable work

Paths below are repository-relative code paths; linked evidence is relative to this document.

| Evidence | Finding and implication |
| --- | --- |
| [Reference inventory](../../../omnirave-babylon/assets-src/avatars/reference-turnarounds/README.md) | Original images define visible identity. Generated views are inferred supporting evidence. |
| [Male original](../../../.superpowers/brainstorm/49113-1780456702/content/assets/avatar-luxury-festival.png), [female original](../../../.superpowers/brainstorm/49113-1780456702/content/assets/avatar-plurr-warehouse.png) | Authoritative launch appearance and outfits. |
| [Male turnaround](../../../omnirave-babylon/assets-src/avatars/reference-turnarounds/male-luxury-festival/turnaround-sheet-v1.png), [female turnaround](../../../omnirave-babylon/assets-src/avatars/reference-turnarounds/female-plurr-warehouse/turnaround-sheet-v1.png) | Existing dressed references; they are not the proposed gym-wear body inputs. |
| [Legacy audit](../../../omnirave-babylon/assets-src/avatars/omniavatar-v2/AUDIT-LEGACY.md) | Records generic faces, sparse locomotion, runtime proportion adjustments, and heavy exports. Findings are historical, not freshly measured performance. |
| [Reconstruction history](../../../omnirave-babylon/assets-src/avatars/omniavatar-v2/BUILD-LOG.md) | Tripo's detailed male output retained more appearance detail but fused body, hair, and clothing. A raw reconstruction is not a modular avatar. |
| [Quarantine](../../../omnirave-babylon/assets-src/avatars/omniavatar-v2/QUARANTINE.md) | Rejected/incomplete experiments stay diagnostic evidence; do not publish them through a renamed export. |
| `src/player/modularAvatarContract.ts`, `createReviewAvatar.ts`, `applyAvatarDefinition.ts` under `omnirave-babylon` | Existing slot handling, GLB loading, wardrobe application, and locomotion switching are candidates for reuse. |
| [Backend draft](../../../omnirave-babylon/assets-src/avatars/omniavatar-v2/PIPELINE-DESIGN.md), `backend/internal/omniavatar/` | Job state, evidence storage, leases, and dispatch infrastructure exist. The actual automated reconstruction stages and OmniAI ownership integration remain unproven/unwired. |

Keep existing files and gameplay assets intact during experiments. Use a new experiment directory and manifest for each candidate. Reuse the 56-joint rig only if it passes the selected body's deformation tests; preserving names is not proof of compatible bind transforms or animations.

## 3. Tool decision and comparison

Use Blender for editable mesh authoring, body fitting, rigging, baking, and export; use Babylon for the actual playable result. Keep reconstruction providers interchangeable. No Unity migration is proposed: Unity describes its generator as a static prop tool, which does not establish the required humanoid pipeline. [Unity documentation](https://unity.com/blog/unity-ai-3d-object-generator)

Use route A as the first local experiment. Routes B/C are comparative fallbacks when local likeness stalls or when testing automation offers clear value; paid comparisons do not block local progress. When comparing routes, use identical approved inputs:

| Route | What it tests | Primary risk | Cost basis |
| --- | --- | --- | --- |
| A: Astra-directed Blender, starting from a clean anatomical base | Whether targeted geometry/material work can preserve identity without a reconstruction service | Generic face, ineffective repeated edits, or bespoke work that does not generalize | Existing local tools; agent usage and compute still cost time/resources |
| B: Tripo reconstruction, then controlled fitting to an editable body | Whether a stronger visual source can survive topology conversion, hair separation, and gym-wear removal | Fused surfaces and texture artifacts surviving conversion | Reuse saved male output as a historical baseline; new requests are separately budgeted |
| C: Meshy multi-image reconstruction, then the same downstream requirements | An independent reconstruction comparison for human and anime identity | Better static appearance may still fail body recovery and deformation | Paid API access and credits; benchmark proposal below |

For A, MakeHuman/MPFB core assets are a possible starting topology, not an accepted final face. Core assets are CC0; inspect third-party wardrobe/hair licenses individually. [MakeHuman licensing](https://static.makehumancommunity.org/about/license.html)

Character Creator/Headshot is deferred from this first comparison. CC5 lists Windows and discrete-GPU requirements; it is not a native fit for this M1 workflow. Reallusion's FAQ also identifies permission requirements for character-generation services, directly relevant to OmniAI. Current bundle cost and service permission are unresolved, so no purchase recommendation is made. [System requirements](https://kb.reallusion.com/Product/53240/System-Requirements?KBkeyword=3+pro), [vendor FAQ](https://kb.reallusion.com/ExportPDF53107.aspx)

### Costed experiment proposal

Pricing checked 2026-09-04; confirm the selected endpoint/model and account quote before execution.

- Tripo publishes $1 per 100 API credits. Textured H2/H3 multiview generation is 30 credits ($0.30); detailed textures add 10. Rigging is 25, segmentation 40, and retargeting 10 per animation. An illustrative 30 + 10 + 25 + 40 + 30 sequence costs $1.35 before other work or retries; it is not an accepted-avatar cost. [Tripo API pricing](https://docs.tripo3d.ai/get-started/pricing.html)
- Meshy lists textured Meshy-6/7 multiview generation at 30 credits, remesh at 5, rigging at 5, and animation at 3. Four candidates with two generations each, then one remesh/rig/three-animation pass per candidate would consume 316 credits at those settings. API credit accounting must be verified against the account before running. [Meshy API pricing](https://docs.meshy.ai/en/api/pricing)
- Meshy's published Pro plan is $20/month with 1,000 credits and API access. Do not assume promotional pricing or that UI retry allowances apply to API jobs. [Meshy plan comparison](https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you-free-vs-pro-vs-premium-vs-ultra)
- Proposed initial vendor envelope: one $20 Meshy month plus at most $10 Tripo usage, subject to available balance, checkout minimums, taxes, and confirmation of API credit eligibility. This is a proposed $30 vendor budget, not authorization, and excludes reference-image generation, agent usage, hosting, and the later validation cohort. When a paid trial is approved, include auto-top-up and renewal settings in that approval and establish the trial end date. Nothing in this plan authorizes changing account settings.
- Provider rigging/segmentation are optional probes, purchased only when they answer the next unresolved question. Their output is never assumed compatible with the master rig.

Record total credits, agent/worker runtime, retries, human cleanup, and accepted outputs. A cheap raw mesh is not the cost of a working avatar.

## 4. Inputs and fair comparison

Initial development set: approved male and female, plus two distinct anime human references to be selected during preparation. Additional images are required; none were identified by an initial filename search. Agree on the anime appearance examples before tuning that route.

For each character retain the original profile image, approved supporting views, generation settings, role labels, hashes, and visible-identity notes. Record the native face-crop resolution. Enlarging or generating a face close-up does not reveal additional observed detail; mark newly invented detail and seek identity calibration if the original cannot support the requested precision. For the launch pair, retain the original dressed sheets for outfit matching and prepare separate body references for the automated-body experiment. Keep original and generated evidence visibly distinguished.

Use front/back/left/right as the common four-view provider input. Retain optional three-quarter views for consistency review; a generated held-out view is not independent ground truth. Meshy's endpoint currently accepts 1–4 images, so never send all stored views blindly. Convert supported image formats without changing aspect ratio and record the submitted derivatives. [Meshy multi-image API](https://docs.meshy.ai/en/api/multi-image-to-3d)

Reject reference packs with drifting faces, swapped asymmetrical details, missing limbs, inconsistent scale, or contradictory body/hair outlines. Generate missing views with the original identity as the anchor. A face close-up can supplement, but must not silently replace, the original face.

Route comparison protocol for OmniAI reconstruction (the authored launch pair follows the body-first sequence in section 10):

1. Compare uncorrected outputs first, using matched camera framing and both neutral-textured and clay views. Log exact provider model/settings, input hashes, runtime, and cost.
2. Review each surviving route in batches of up to three targeted local correction passes; continue a productive route in another batch and change approach after three consecutive non-improving passes. Retain the best candidate and record the defect each change is intended to fix. Compare effort as well as quality; disclose manual intervention.
3. Move a likeness-passing head/upper-body candidate immediately through a minimal shoulder/elbow/neck rig, removable top, and Babylon export. The prototype demonstrates the applicable subsets of G1–G4 only; mark full-body, locomotion, complete wardrobe, and LOD gates pending. Do not polish a complete wardrobe before this proof.
4. Select by likeness and preservation through conversion first; modularity and deformation must pass independently. Choose cost/latency among viable routes. Human and anime routes may differ.
5. If no route passes, explicitly record no winner and change the reconstruction approach. Do not select the least-bad face or call the phase complete because its budget expired.

## 5. Acceptance gates

Gate status starts as untested. Screenshots, binary validation, deformation, and performance establish different properties; none substitutes for another.

| Gate | Required evidence | Pass condition |
| --- | --- | --- |
| G0: References | Original plus labeled views and identity notes | Consistent visible identity; inferred details identified; user recognizes intended character |
| G1: Body and facial fidelity | Matched original-angle face close-up, neutral front/profile/three-quarter, full body, and rotating view; separate body and face findings | Launch pair: reference body matches and Nick accepts the face on the completed playable character. OmniAI: existing facial identity is preserved under calibrated acceptance; no generic substitution or material trick hiding geometry errors |
| G2: Conversion | Same cameras before/after fitting, rigging, export, and LOD derivation | Likeness is retained at the intended viewing distance; no damaged face, hair, neck, or skin surfaces |
| G3: Modularity | Hair and accessory removal; two actual options per clothing slot; layered outfit swaps in motion | Body remains complete, gym wear is absent from skin, clothing follows the rig, and supported combinations do not visibly clip |
| G4: Playability | Idle/walk/run/turn/crouch/arms-raised/dance; elbows and knees bent; head turn, blink and jaw test | No tearing, joint collapse, detached eyes/hair, sliding feet in locomotion, or broken transitions at review/gameplay distance |
| G5: Runtime | Export inventory, import result, resource totals, fixed scene captures, frame-time measurements | Actual Babylon asset passes the approved device/crowd target and visual gates |
| G6: Repeatability | Unseen human/anime inputs processed with a frozen pipeline; full attempt ledger | Successful outputs need no per-character manual modeling; failures are identified and bounded |

G1 has separate body and face decisions. For the launch pair, compare head-to-body ratio, shoulder and hip width, torso and limb lengths, anatomical build, and front/side/three-quarter silhouettes against the approved references. Check the actual unclothed body surface as well as dressed views; inherited topology and a valid skeleton do not establish a body match. Keep unobserved anatomy explicitly inferred. A facial discrepancy does not block development of the body, rig, animation, or clothes; it remains visible for Nick's final judgment once those parts work.

Diagnostic rubric: separately rate face proportions, facial features, hair, body silhouette, and skin/style from 0 (wrong identity) to 4 (close match with only small discrepancies). The former proposed minimum of 3/4 is not an acceptance threshold for either track and must not be translated into a likeness percentage. Score launch outfit fidelity separately. For OmniAI, do not average a weak face away with a good body/outfit or borrow the launch-pair exception. Calibrate accepted/rejected identity examples before using automatic scores; a perfect diagnostic score does not certify mathematically exact likeness.

Anatomical clay views diagnose surface damage and deformation; they do not require an anime face to look realistic without its intended shading. Benchmark likeness with the correct style materials as well as diagnostic views.

Landmark/silhouette errors and image similarity are diagnostics. Camera, pose, lighting, and anime style can confound them. Calibrate thresholds against accepted/rejected examples, including existing failed avatars; no arbitrary embedding threshold certifies likeness. Final user preview supports acceptance or rejection without requiring an artist to review every job.

Review at 1024px portrait output with face at least 350px high, and at 1920×1080 gameplay output with both nearby and normal third-person views. A proposed nearby face target is 150px high. Confirm this matches the editor's intended closest view before locking the capture rig. Include original-style and neutral lighting; venue lighting must not hide failures.

## 6. Construction rules to prove

- Build a complete reusable body beneath clothing. Recover skin color/detail without projecting gym-wear fabric or shadows onto it. Hidden anatomy is inferred; fitted reference clothing does not reveal exact geometry.
- Preserve coherent face topology around eyes and mouth. Keep eyeballs, eyelids, mouth interior, hair, and removable parts controllable as required by animation and wardrobe. A fused textured shell cannot pass solely because it resembles a photo at one angle.
- Support human and anime appearance families with compatible humanoid animation semantics. Do not force identical face topology or realistic shading when that damages anime identity.
- Fit garments to body geometry, transfer weights, then inspect deformation. Record the supported proportion range; failures outside it must be explicit. Physics-based cloth and secondary hair motion are optional later work.
- Preserve the full source body. Runtime body-coverage masks must depend on the currently equipped outfit and restore hidden regions on removal, including at reduced LOD. Never permanently delete skin under an optional jacket.
- Define slot/layer compatibility, attachment points, and versioned garment-fit data. Initial slots: hair, top, jacket, bottoms, shoes, accessories. Face/skin identity is not a clothing slot.
- Verify coordinate axes, handedness conversion, bind matrices, and animation mapping with an asymmetric exported test asset. Do not adopt the old draft's forward-axis or quaternion formulas without an end-to-end check.
- Source meshes may be quad-dominant; exported glTF geometry is triangulated. Keep high-quality editable sources separate from delivery budgets. Avoid blanket texture reductions that destroy facial detail.

Keep the existing gameplay defaults and executable v2 candidate gate intact until their replacements are explicitly validated. Current gameplay defaults to the legacy editorial asset; v2 loads through explicit preview options. The v2 candidate gate is not evidence that v2 is the current gameplay avatar. Before the partial-body proof, establish an isolated review scene with an explicit prototype manifest and only the relevant checks. Do not route a bust through the production loader or weaken production validation to admit it. Before the first complete candidate enters gameplay, resolve the full skeleton, morph, texture, and budget contract and migrate validators/loaders together. A prototype pass does not imply production-contract acceptance.

### Automation feasibility checkpoint

For the separate automated pipeline, prove the selected route on a fresh full-body human and an anime humanoid before expanding its generated wardrobe support, using explicit stage inputs/outputs: reference pack → identity/body reconstruction → clean anatomical surface with gym wear removed → separate hair/eyes → texture/rig → fitted catalog garment → animated GLB. Record exactly which steps are scripted, agent-directed, provider-operated, or manual.

The unknowns requiring this proof are face/skin preservation during surface conversion, automatic recovery beneath gym wear, hair separation, and garment fitting across physique differences. A successful bust does not settle them. If a stage needs hand sculpting, record that the automated launch requirement remains unsatisfied and change the stage method before expanding automated garment coverage. Manual authoring of the two launch characters may continue independently and does not count as automation evidence. Agent-directed corrections can be part of an automated worker only if they run unattended with saved artifacts, bounded compute/spend, resumable state, and repeatable acceptance; a desktop chat session is not the deployed service.

Asset eligibility must include permission to use the selected bases, clothing, generated outputs, and animations in this user-facing character-generation service. Vendor marketing about game export alone does not establish that permission. Resolve the exact product/asset terms before incorporating a paid route into the service; this does not block the existing local comparison.

## 7. Reusable identity and backend lifecycle

Proposed asset families:

- Identity revision: owned OmniAI ID, original profile image hash, reference-pack version, style family, and accepted identity notes.
- Master revision: source geometry/textures, skeleton/rest pose, fit measurements, validation evidence, and reconstruction recipe version.
- Game variant: master revision + game profile version + wardrobe/fit version + platform quality tier.

Compatible games use the master-derived delivery package directly. Games needing different art direction run a reusable game adaptation recipe when that character first enters. Cache by the full version tuple; preserve provenance and user acceptance. Do not regenerate avatars on every login or promise compatibility with outside games that lack an integration.

Split the lifecycle into two durable workflows:

1. OmniAI creation/update → prepare reference pack → consistency checks → references ready (or retry/failure). This happens before any 3D request and must not block chat availability.
2. Explicit 3D request → verify OmniAI ownership and selected reference revision → reuse compatible cached master or reconstruct → fit body/hair → texture → rig → fit wardrobe → animate/validate → preview ready → user accepts → available in OmniRave.

If reference preparation is still running, the avatar request waits on that version rather than duplicating generation. If identity changes mid-job, finish against the immutable requested revision and label the preview as an older appearance. It may become active only through an explicit user choice of that revision, never through an automatic completion callback. Atomically compare the selected revision when accepting a preview. An already accepted avatar stays usable until a replacement is accepted.

Reference preparation is keyed by owner, OmniAI, and appearance revision; text/personality-only updates reuse it. Proposed preparation limit: one initial pack plus two corrective attempts, with independent per-pack and per-owner spending ceilings and a platform quota. Exhaustion records a failure while chat continues. Do not allow precomputation for an unlimited number of creations to bypass cost controls. Master creation and each game-variant job need their own retry, timeout, and spend budgets. Exact currency ceilings and queue/worker deadlines must be configured before live activation, not invented by a worker.

Deletion revokes access and cancels pending work; late callbacks cannot publish or reactivate deleted/cancelled jobs. Before a callback or preview acceptance writes state, check current ownership, deletion/cancellation status, attempt token, and selected revision. Retain only the necessary billing/audit record under a defined retention policy; delete source/derived assets according to that policy, including vendor copies where supported. A network timeout after submission requires reconciliation of the accepted task before any new charge.

Required changes to existing backend drafts:

- Move prepared references out of an exclusively 3D-job namespace into owned, immutable identity/reference revisions. Attach verified snapshots to jobs without weakening existing ownership/hash checks.
- Replace the exact-six requirement in `reference_set.go` with four mandatory directional views and up to two supporting views; optional face close-up is a separate supplemental asset. Require unique roles/asset hashes, consistent ownership/revision, complete bodies in T-pose, supported decoded media, and calibrated cross-view consistency. Zero to three body views, seven body views, duplicate roles, cross-owner packs, corrupt images, and stale undeclared revisions fail before vendor submission. Adapters select supported view subsets and retain input provenance. Test four-, five-, and six-view packs against both the internal contract and the provider-specific submitted payload.
- Add authoritative OmniAI ownership lookup from OmniChat, explicit action endpoint, cache keys, progress/preview APIs, provider workers, and actual processing stages. Existing queue/outbox code alone does not provide these integrations.
- Verify vendor idempotency/reconciliation behavior before relying on retries. A local idempotency key cannot prevent duplicate external billing unless the vendor honors it or accepted tasks can be reconciled.
- Distinguish transport retries from new charged generation attempts; cap both. Proposal: initial reconstruction plus at most two quality retries, bounded by a per-job cost ceiling, then an explicit failure/review state. Production normal success must not require operator sculpting.
- Download durable assets before vendor retention expires. Keep API credentials server-side, validate imports in resource-limited workers, and record stage outputs and spend.

Companion gameplay is an integration dependency: loading a model does not implement autonomous play. Launch verification must show the user and their OmniAI as distinct entities in one session, with identity, appearance, animation, and the intended companion-control handoff. Locate the existing OmniAI control/navigation work before claiming this experience is complete.

## 8. Repeatability, cost, and launch decision

Before holdout testing, calibrate automatic acceptance on the development set plus known rejected outputs (wrong face, merged gym wear, damaged hair, and rig deformation), then freeze the acceptance thresholds, input eligibility rules, and retry routing together with the processing recipe. Include negative human and anime controls that must be rejected. An operator must not silently turn automatic failures into successes.

After tuning on four characters, freeze the recipe and run a proposed 12-character holdout cohort: six realistic and six anime, varied faces, skin tones, hairstyles, and supported physiques. These references must not be used for per-character tuning. If the recipe changes, use a fresh holdout set for the next claimed validation pass.

Proposed engineering checkpoint: at least 11/12 acceptable within the retry ceiling, including at least 5/6 in each style, no manually repaired outputs counted as automated successes, zero known bad outputs falsely marked ready, and all designated negative controls rejected. Reviewers score outputs independently after the frozen system makes its decision; user rejection must remain visible in the results. All 12 selected inputs stay in the denominator, including timeouts and failures; out-of-scope inputs are identified before selection. New eligibility exclusions after seeing results require a new validation pass. Report human and anime results separately, first-pass and eventual success rates, all failures, median/p95 time, and cost per accepted avatar. This small cohort is an initial gate, not proof of a population-wide success rate. Follow with a limited beta before unrestricted launch.

Track two economic stages because every OmniAI incurs reference preparation even if its user never requests 3D:

`total cost = all reference packs + requested master attempts + requested game variants + validation/worker compute + storage/delivery`

`cost per accepted master = all master-attempt costs, including failures, divided by accepted masters`

Account for agent usage, image generation, compute, retries, subscription minimums, storage, and human intervention separately. Set user-facing price/limits only after measurement; no per-avatar cost or completion-time promise is established yet.

## 9. Performance acceptance proposal

Generation runs in backend workers or approved services; an 8 GB client downloads and plays the result. The M1 is initially an authoring/test machine, not the production generation server.

- M1 target: 60 FPS at 1920×1080 internal render resolution, fixed camera/settings, with an initial launch acceptance scene of 10 visible avatars. Proposed passing floor: measured frame throughput ≥57 FPS (5% tolerance), p95 frame time ≤20 ms, and p99 ≤33.3 ms during warm playback; all three must pass.
- Actual representative 8 GB device: 30 FPS at 1280×720 with reduced settings, the same 10-avatar scene; proposed passing floor: measured frame throughput ≥28.5 FPS (5% tolerance), p95 ≤40 ms, and p99 ≤66.7 ms; all three must pass. An actual device test is required; 16 GB testing cannot certify it.
- Benchmark 0/1/10/25/50 avatars. Zero avatars establishes venue cost. Ten is the proposed launch target; 25/50 are capacity probes, not commitments or membership limits. Raise or revise capacity from measurements.
- Run a fixed two-minute camera/dance/locomotion sequence after warm-up in the real venue. Throughput is presented frames divided by elapsed wall time; retain every frame interval, including hitches, while the tab is foreground. Record exact quality settings and pin them across crowd sizes. Run a quiet venue and an active show with normal lights/effects; both must pass the launch target. Do not remove show effects or lower resolution in a crowded run without labeling it a different quality tier. Test distinct identities and wardrobe combinations, plus a repeated-character control. Measure cold loading separately and state the network profile.
- Record resolution/DPR, browser/OS, thermal conditions, CPU/GPU/frame timings where available, draws, triangles, texture estimates, process memory, load bytes/time, and LOD transitions. Test scene entry/exit cycles for memory growth and browser stability.
- Start delivery experiments near the existing 60k/30k/12k triangle tiers, but tune against face quality and measured scene costs. A 100 MB texture allowance per avatar cannot simply be multiplied across a crowd on an 8 GB machine.
- Share reusable wardrobe resources; reduce geometry, shading, and animation update frequency by distance with stable transitions. Preserve close-range identity. Do not assume ordinary instancing gives independent skinned animation for free.

No final GPU-memory, draw-call, download, or simultaneous-avatar limit is claimed until this benchmark runs. The actual 8 GB device and supported browser matrix remain to be selected.

## 10. Phases and recurrent work loop

| Phase | Concrete deliverable | Exit condition |
| --- | --- | --- |
| 0: Prepare local proof | Male original/reference inventory, comparison cameras, baseline capture, prototype manifest | Male G0; local work proceeds independently of anime selection and paid-tool decisions |
| 1: Match launch bodies and prove motion | Complete male and female reference-matched bodies, reusable rig, deformation tests, one removable outfit, isolated Babylon export | Body component of G1 and applicable G2–G4 evidence; face acceptance remains pending and does not block this work |
| 2: Complete and judge launch pair | Male/female masters, reference outfits, alternate wardrobe, hair/accessory swaps, playable preview | G1–G5 for both; Nick judges facial discrepancies on complete characters, with no automatic 95–97% approval |
| 3: Establish OmniAI reconstruction and integration | Full-body human/anime pilot, bounded physique proposal, unattended recipe, versioned jobs, contract migration and preview | Existing facial identities preserved through body recovery, hair separation, rigging, garment fitting and export; ownership, resume/failure and fresh-identity automatic processing demonstrated |
| 4: Qualify launch | Frozen-pipeline holdout, device/crowd report, user-plus-companion session | G6, agreed performance targets, and companion integration complete |

Each implementation iteration records: current gate, one observed defect, proposed correction, before/after artifact, visual result, structural/deformation regressions, elapsed effort, and cost. Capture images of the exact exported asset being judged. Keep a stable best version and reject regressions.

Three consecutive passes without meaningful improvement trigger a diagnosis and a different method, not another cosmetic revision or a lower acceptance standard. Phase completion requires its artifacts and evidence; no self-issued score or completed checklist substitutes for resemblance. Human calibration is concentrated at reference/likeness decisions, not routine reversible edits. This plan does not launch extra agents or scheduled work.

The next implementation deliverable is a full-body comparison of both launch characters against their reference images, followed by body corrections, rig/deformation proof, a removable outfit, and an isolated playable export. Preserve face19 and the facial controls as available starting evidence; they are not accepted bodies or final faces. Refine the faces alongside this work and present the completed characters to Nick for a facial acceptance decision. The OmniAI track is a separate required launch deliverable and keeps its stricter identity standard. External paid sources remain deferred. The prior face-first prerequisite is superseded.

## 11. Remaining decisions

1. Select two anime reference identities and later an independent holdout cohort.
2. Continue the local Blender proof. External paid trials are deferred by user direction; there is no active vendor approval request.
3. Select the actual 8 GB test device and browser matrix. Ratify or revise the proposed 10-avatar launch performance target from venue measurements.
4. Establish supported physique limits through garment-fitting experiments; sliders and unrestricted body shapes are not yet launch commitments.
5. Locate OmniChat ownership/reference-generation and companion-control integration surfaces. They have not been verified in this planning pass.

No completion date is estimated before the likeness/playability experiment. Its measured effort, success rate, and remaining manual stages determine a defensible schedule for both required launch deliverables.

## 12. Worked handoff decisions

These are expected decisions for future implementation and document review, not results from working providers or runtime tests. They resolve ambiguous boundaries; all proposed production thresholds still need ratification.

| Case | Controlled input | Required decision |
| --- | --- | --- |
| SEQ-A | Launch body references ready; faces imperfect; anime examples and paid trials pending | Continue launch body, rig, animation and clothing work locally |
| SEQ-B | Partial-body prototype bends correctly but has no locomotion or complete wardrobe | Record subset proof; full-avatar gates pending |
| LIK-A | OmniAI anime face preserves the original facial identity with appropriate style materials and sound deformation | Eligible for calibrated identity acceptance; recognition alone is insufficient |
| LAUNCH-A | Body, rig, animation and modular wardrobe work; Nick judges facial likeness around 95–97% | Present the completed launch character for Nick's discretionary decision; do not self-approve |
| LAUNCH-B | Very close face on an incorrect body or broken rig | Continue body/playability corrections; not a complete launch avatar |
| AI-FACE | Functional OmniAI avatar visibly changes the original person's facial identity | Reject identity acceptance; launch-pair discretion does not apply |
| LIK-B | Attractive generic face, or native face detail replaced with an unapproved generated identity | Reject likeness |
| LIFE-A | Two requests for the same owned appearance revision while reference preparation is pending | Reuse one bounded preparation job |
| LIFE-B | Third corrective reference attempt, exhausted cost ceiling, or a late callback after deletion | Reject further generation or publication respectively |
| FPS-A | M1: steady 60 FPS, p95/p99 16.67 ms, prescribed active-show settings | Pass proposed timing gate |
| FPS-B | M1: steady 50 FPS, p95/p99 20 ms, same settings | Fail proposed timing gate |
| AUTO-A | Fresh human and anime complete every stage unattended within limits; independent review accepts | Eligible for repeatability validation |
| AUTO-B | Attractive launch model requires per-character hand sculpting after reconstruction | Automated launch requirement remains unsatisfied |
| REF-A | Four unique correct directional T-poses owned by the selected identity revision | Eligible for provider-specific preparation |
| REF-B | Six images but a duplicated front role and no back, or an asset owned by someone else | Reject before provider submission |

## 13. First local implementation result — 2026-09-05 UTC

The male Blender experiment is preserved in `omnirave-babylon/assets-src/avatars/astra-male-proof/`. Four corrective studies improved surface coherence but did not establish the original identity. **G1 likeness fails**; the male launch avatar, deformation/modular-clothing subset proof and automated pipeline are not complete. The original and current result can be inspected side by side in the experiment's `index.html`; `README.md`, `structure-report.json` and `manifest.json` record the limitations and evidence. The existing gameplay assets and production validation contract were not changed by this experiment.

Historical proposal, superseded by the user direction below: after study04, three image-conditioned Meshy-7 candidates were proposed using the original male artwork and four existing dressed T-pose views. `benchmark-proposal.json` preserves that deferred experiment. It is not an active recommendation or approval request. No external uploads or purchases occurred in this local experiment. Body recovery, modular clothing, game conversion and the fresh human/anime automated proof remain mandatory. Under the later priority clarification, authored launch-body work proceeds before final face acceptance.


### User direction after the first local study

The user declined external paid sources and asked for sustained local iteration. The Meshy proposal is deferred and is not an active approval request. Continue local Blender reconstruction with repeated reference comparisons. The later body-first clarification governs the authored launch pair; measured facial landmarks and hair work remain supporting tasks. The first four studies establish a baseline failure, not an exhausted local route. No fixed four-pass stopping rule applies; retain honest likeness gates and the best checkpoints.

### Local continuation checkpoint: face19

The local proof now retains fitted-camera facial controls and a full experimental native-strand groom. `face19.blend` combines bounded jaw/mouth changes with the corrected crown/back paths; the comparison page defaults to it while keeping `pose04`, `fit05`, and `curl18` accessible. None passes G1 yet. Hair remains too heavy across the forehead, root transitions are blunt, crown coverage is uneven, and the face remains an approximation.

Structural inspection confirms 13,380 body vertices with unchanged polygon connectivity across inspected checkpoints, finite groom coordinates within the expected head region, head-bone parenting and no missing file-backed images. This is authoring evidence, not deformation, modularity, runtime or automation acceptance. The 73,700 native strands need later runtime conversion. All sixteen displayed model/camera combinations loaded in the local browser and selected the corresponding Blender download. A new evidence manifest supersedes the historical study04 hashes.

Next local changes should establish full-body reference matches for the male and female, then prove rigging, animation, garment separation and playable export. Retain the facial camera controls and record the fringe/root and eye/brow/cheek discrepancies for subsequent refinement and Nick's completed-character judgment. The 8 GB client and automated human/anime holdout requirements remain. External paid sources remain deferred.


### Authorized asset cleanup

The user approved removal of redundant backups and failed intermediate model binaries. Retained runtime/profile sources, original references, raw provider evidence, canonical body/rig sources, and active comparison controls are listed in `omnirave-babylon/assets-src/avatars/CLEANUP.md`. The hash-indexed deletion ledger is `.codex/cleanup/2026-09-05-cleanup-ledger.json`; past build-log references to removed binaries are historical records, not active inputs.

The current male recipe is consolidated in `scripts/astra-male-proof/rebuild_current.py`, using retained `fit05.blend` plus the facial pose and hair-guide JSON records. It needs no scalp12/curl13/curl14 intermediate files. Before deleting those files, the rebuilt face19 matched all 25 visible evaluated objects exactly and rendered identically at the reference camera. The current face19 was replaced with the equivalent compressed source. Public runtime assets and runtime/backend code were preserved. Cleanup does not advance G1 or any production-readiness gate.


### Launch body and motion checkpoint: body02

The separate `omnirave-babylon/assets-src/avatars/launch-body-proof/` study now contains male and female fixed-body masters, fitted 56-bone skeletons, complete unmasked feet, two independently skinned prototype tops, trousers and a five-second diagnostic joint animation. It reworks retained local editorial topology; it is not an accepted image reconstruction. The isolated Babylon page is `/body-review.html` on the local Vite server (currently port 4178). Public gameplay assets are unchanged by this study.

The arm-length correction improves body span, but reference-body acceptance remains pending, especially female arm span and both shoulder/torso silhouettes. These clothes are fitting prototypes rather than the reference wardrobes. Static pose checks missed clipping between poses, so validation now samples all 151 integer animation frames. Open armholes and bounded surface fitting address the shoulder intersections; `deformation-check.json` records residual findings rather than assuming acceptance. `export-check.json` inspects the actual GLB skin weights, indices and animation. The study README and manifest describe the boundary and current evidence.

Next: continue full-body proportion correction, refit the joints and wardrobe, author the actual clothing/hair/accessory modules, and add locomotion and player control in an isolated OmniRave test. Face judgment, crowd/device validation, and the separate automated human/anime conversion requirement remain outstanding.


### Proportion continuation: body03

The launch-body study now offers an Updated/Previous comparison for each character. Body03 extends arms, modestly broadens the upper torso, and softens the female waist while preserving body height, hand scale, body polygon connectivity and 56 connected bones. Measured arm-span/body-height ratios change from 0.978 to 1.020 (male) and 0.918 to 1.000 (female). These are authored body hypotheses from dressed references, not verified anatomy or likeness scores. The original artwork remains authoritative; generated T-poses provide supporting views only.

Both body02 controls remain available. The current versioned deformation/export reports and manifest live in `launch-body-proof`; unversioned reports describe body02. Continue with shape/deformation refinement and actual reference wardrobe construction before the full gameplay and launch-face acceptance stages. Neither model is a finished playable character yet.

### First male reference wardrobe draft: outfit01

The local body-review page now has a removable pearl/black/gold bomber and black underlayer for the male body03 study. The jacket uses connected torso/sleeve topology, an exact front cut and a collar derived from its neckline. The saved body geometry, weights and 56-bone skeleton are compared directly with body03 during validation. Native Blender fitting and bounded paired-surface corrections address the initial large armpit intersections; current results, source hashes and remaining limitations are in the launch-body README and `male-outfit01-deformation-check.json`.

This is a construction checkpoint, not clothing likeness or gameplay acceptance. Continue with sleeve/underarm shaping, satin folds, shirt tailoring and hardware, then the remaining cargo trousers, shoes and accessories; the female reference wardrobe is still outstanding. Preserve body03 and its comparison controls. No production asset replacement or paid service is part of this draft.

### Wardrobe refinement and expanded collision evidence: outfit02

The Refined/Construction wardrobe selector now preserves outfit01 while presenting an outfit02 candidate with additional sleeve topology/folds, fitted gold bands, surface-attached pocket hardware and revised pearl/black materials. The new layer diagnostic exposed a gap in the earlier acceptance evidence: garment vertices can clear the body while the shirt and jacket still intersect. Both versions therefore remain unaccepted for layered clothing, regardless of their body-distance result.

Continue with coupled shirt/jacket surface and skin-weight refinement and triangle-level layer checks before calling the outfit deformation-ready. The layer probe records its coplanar blind spot explicitly. Tailoring, silhouette matching, the remaining wardrobe, locomotion, facial judgment and device/crowd verification retain their existing requirements. Public gameplay assets are unchanged by this study.


### Layer-repair experiment and body deformation finding: outfit03

Outfit03 restores the shirt's distorted paired fabric thickness and reduces shirt/jacket crossings from 151 to 68 of 151 sampled frames; the actual GLB reimport agrees on affected frames. It does not resolve layering. A strict self-intersection probe exposes existing body armpit crossings when the arm is lowered, additional rest-pose body crossings elsewhere, and numerous garment self-intersections. Coat self-crossings increase in the experiment, so outfit02 remains the review default and outfit03 is labeled as a diagnostic experiment. Body03 and the prior outfit binaries are preserved unchanged.

The next step is now body underarm geometry/skinning repair, with investigation of the rest-pose self-crossings, followed by local garment topology/refitting that constrains self-intersections as well as body and layer distances. Passing a nearest-body vertex threshold or maintaining manifold edges is insufficient for deformation acceptance. The launch-body README, versioned layer/export/self-intersection reports and highlighted armpit render contain the current evidence. This checkpoint advances no likeness, gameplay, device or automated-conversion gate.


### Shoulder deformation correction: body04

The body-only body04 comparison now repairs the torso/upper-arm skin-weight transition for both characters, preserving their resting meshes, all joint placements and the prior diagnostic animation. All 151 sampled frames are clear of the scoped shoulder self-crossings in both saved sources and actual exported GLBs; body03 previously had 81 affected male frames and 73 female frames. This is a scoped deformation improvement, not full-body or likeness acceptance. Export seam duplication required correcting the self-adjacency check; a captured regression control and the versioned validation reports document that distinction.

Continue with foot-surface repair and the remaining body contacts, then garment refitting against body04. Old garments are excluded from the body04 export and remain available on the unchanged body03/outfit controls. Do not promote the earlier shirt/jacket experiment on the basis of the shoulder result: its own layer and self-intersection findings remain unresolved. The launch and automated-conversion gates retain their existing requirements.


### Complete-body sampled-contact correction: body05

Body05 repairs the folded toe surfaces in both characters, removes stray forearm influence from six male thumb vertices, and adjusts the female diagnostic's lowered forearms to clear its hips. The bind skeleton and mesh connectivity are preserved. Rest-coordinate edits are confined to the feet, within about 6.2 mm; the male action is unchanged, and the female T-pose/overhead reach and other local bone channels remain unchanged.

The rest meshes and all 301 samples at 60 Hz have zero detected strict non-adjacent, non-coplanar body crossings in both saved sources and actual exported GLBs. This supersedes the remaining body04 foot/contact findings for the body05 candidate. It does not certify adjacent folds, coplanar overlap, arbitrary animations, GPU parity, clothes, likeness or playable motion. The body review defaults to the body05 study and includes a Feet view, with earlier models retained for comparison.

Next refit/rebuild the modular wardrobe against body05 with simultaneous body, garment-layer and garment-self-intersection checks. Prior bomber experiments remain unaccepted. Continue the remaining reference outfits, hair/faces, locomotion and runtime/device work before launch acceptance, alongside the separate automated OmniAI conversion requirement.


### Body05 modular torso-layer checkpoint: top01

Male and female top01 studies now add one removable, independently skinned torso garment to the unchanged body05 characters. The male open-V layer and female cropped V layer are fit/construction prototypes; collar/shoulder shape, closure, edging and original-reference tailoring remain unfinished. The local review exposes Top fit study, None/Fitted top and a Torso close-up. The established body05 default and prior body/outfit controls are preserved.

Both saved Blender sources and actual GLB reimports have zero detected top self-crossings or top/body crossings in rest and all 301 samples of the five-second diagnostic action at 60 Hz. Body geometry, skin weights, bind skeletons and sampled body animation are unchanged. Midsurface triangulation now precedes fabric thickness, fixing opposite wall diagonals that had produced male crossings in 82/301 samples. Recorded failing triangles remain an active detector control. See the launch-body-proof top01 build, validation, export-check and diagonal-control reports for hashes and limits.

This scoped pass does not cover adjacent folds, coplanar overlap, continuous time, arbitrary animations, jacket/top layering, GPU parity, likeness or device performance. Each source/export pair adds only its torso top; it does not transplant the failed bomber surfaces. The male export is 40,552 triangles / 5,563,144 bytes and female 39,328 triangles / 5,529,048 bytes, both with 10 meshes and 56 bones. These are counts, not 8 GB or crowd benchmarks.

Next: rebuild the bomber sleeve/underarm surface and garment-specific deformation against body05, fit it over the torso layer, and validate body, layer and self-intersections together. Continue reference tailoring and the remaining male/female wardrobe after the connected cloth construction is sound. Playable-character, appearance and automated OmniAI conversion acceptance remain open.


### Connected bomber construction checkpoint: outfit04 (not promoted)

A new male jacket construction experiment is available over top01/body05. Its cuffs, collar and waistband extend the measured opening edges, with black/gold material bands in one connected fabric wall. Mesh reduction precedes precise cuts; the neckline/front cut no longer creates a nonmanifold connection. The source and seam-welded exported jacket are one manifold component. Body, top, their weights, bind bones and sampled body animation are unchanged.

The 6,846,896-byte GLB has 11 meshes, 79,632 total triangles and 56 bones; structural inspection passes. Deformation fails: T-pose is clear, but rest has 143 self-crossing pairs and the five-pose motion probe finds substantial jacket self/body/top intersections. Source and GLB results, exact hashes and a red contact render are retained under launch-body-proof/male-outfit04. The `--require-clear` inspection gate fails as intended. No continuous-motion, gameplay, likeness or device acceptance is implied.

Alternative surface/weight constructions and a cloth warm-up were tested and rejected; compact counts are retained without accumulating failed model binaries. Direct rest-pose construction also failed in motion. Next develop and test a focused shoulder/inner-sleeve corrective with the body/top held fixed, rather than repeating broad smoothing or declaring the T-pose sufficient. Keep outfit04 clearly marked as an experiment and preserve the passing body05/top01 controls.


## Latest underarm investigation and revised next step

No replacement Blender source or GLB was retained from this pass. Outfit04 remains **NOT_PROMOTED_CONTACT_CHECK_FAILED**; body05, top01 and all 32 existing model binaries are preserved. The review page continues to load the prior controls.

Separating the fabric walls from the midsurface shows actual folding in the jacket: the relaxed pose has 428 strict midsurface crossing pairs, as well as crossings between the inner and outer walls. Rebuilding or thinning the walls alone does not repair the folds. Body-surface following, Corrective Smooth, copied body topology, collar weight changes and thinner inner-sleeve trials all failed the combined contact checks. Compact results are in `outfit04-corrective-trials.json`; no failed trial model binaries were added.

The reproducible local probe corrects only a contact-seeded left-side patch. It pins the ribbed collar, cuffs and waistband plus two adjacent edge rings, and preserves the opposite side exactly. Collision projection uses the outer top wall with a bounded search distance; an earlier unrestricted nearest-wall projection distorted the garment. The final probe catches eight recorded positive crossing controls and verifies unchanged body/top data and pinned/opposite-side points.

| Relaxed pose, left side only | Original | Pinned local trial, 160 iterations |
| --- | ---: | ---: |
| Jacket/body crossing pairs | 298 | 9 |
| Jacket/top crossing pairs | 10 | 0 |
| Jacket self-crossing pairs | 1,092 | 622 |

The correction moves some points by 46.65 mm and leaves visible fabric problems. **It is rejected**, despite reducing some contacts. The complete jacket still has 1,728 self, 292 body and 12 top pairs in this single-pose trial. No interpolation or GLB validation was warranted. `male-outfit04-local-corrective-frame1.png` marks remaining contacts red and is a diagnostic render, not a new selectable avatar. The `--require-clear` gate correctly exits with a contact failure after recording the evidence.

A calibrated directional ray probe samples the space between the torso/top and left arm, rejecting unrelated surfaces through majority bone influence. Across 1,433 classified rays in four poses, the smallest sampled body gaps are 1.27 mm relaxed and 1.11 mm crouched, near the underarm. Where the top occupies the gap, the smallest remaining sampled gaps are 4.63 mm relaxed, 4.12 mm crouched and 4.35 mm stepping. The raised-arm pose has no qualifying gaps on this grid; that is not a clearance pass. These are sparse horizontal measurements, not global minimum distances or proof that fitting is impossible. The independent 5 mm gap calibration passes.

A first projection of the existing underarm triangles onto a shallow gusset target also failed: body contact decreased but self-folding increased, with 72–101 mm point changes. It was rejected without saving a model.

Next replace the underarm panel connectivity and sleeve connection with an explicit sewn panel that spans the tight skin crease, and a deliberate transition between torso and arm deformation. Preserve the shared garment edges and body/top controls. Wall thickness and clearance need to be designed together; simply thinning the current folded mesh was already rejected. First compare rest and the five poses for shape and all three contact classes, then test interpolation and actual GLB export before promoting anything.

Reproduce with local Blender `probe_bomber_correctives.py -- --render --require-clear` (one relaxed pose by default; failure is expected) and `inspect_bomber_clearance.py` (directional diagnostic only). The versioned JSON reports pin the source hash and exact scope. The remaining wardrobe, likeness, gameplay, device and OmniAI-pipeline work is still outstanding.


## Latest sewn-panel result and deformation-method change

The new `rebuild_bomber_underarm.py` actually replaces the underarm triangles. A geodesic disk is mapped into a positive harmonic chart, resampled with constrained Delaunay triangles, and sewn onto the exact existing boundary. The default 140 mm region shares 119 boundary vertices per wall and replaces 2,718 triangles with 582. It preserves every retained jacket position/weight, body/top data and bind bone. The resulting wall has no nonmanifold edges, inconsistent edge winding or degenerate faces. It still fails the contact and visual checks, so no new Blender source or GLB was saved.

The attachment boundary matters: the smaller 100 mm region leaves 33 crossing pairs in retained faces near its seam in lowered-arm poses. The 140 mm boundary's retained neighboring faces are clear in rest and the five sampled poses. This does not clear the panel interior or the remaining jacket. In the rebuilt 140 mm panel, relaxed-pose contacts include 391 panel self pairs, 221 panel/body pairs and 94 panel/top pairs. Counts across different triangulations are not comparable severity measures. `male-outfit04-underarm-panel.png` highlights the experimental panel green; it is not an accepted visual or a new viewer option.

The new cloth experiment exposed a real configuration defect. Blender 5.1.2 silently clamps attempted 0.2 mm collision distances and 0.4 mm self-collision distance to 1 mm at the model's native scale. Those requested values therefore did not describe the executed simulation. This finding concerns the new submillimeter panel trials; it does not retrospectively explain the older full-jacket trial that requested 3 mm.

`probe_bomber_panel_cloth.py` now reads back and verifies every effective distance. Its native-scale control rejects the mismatch before simulation. A temporary 10× unit conversion, including the collider geometry, bind bones and attachment motion, allows the intended physical distances; all measured geometry is converted back to meters for the triangle probe. The fixed T-pose rest surface and attachment targets are separate. Original model files stay untouched. The schedule is a temporary T-pose warm-up, arm lowering and settling, not the original five-second source/export check.

| Scaled simulation sample | Midsurface self pairs | Body pairs | Top pairs |
| --- | ---: | ---: | ---: |
| Initial T-pose | 0 | 0 | 0 |
| Stationary warm-up | 1 | 0 | 0 |
| End of arm lowering | 91 | 76 | 46 |
| After settling | 78 | 72 | 44 |

The scale correction avoids the warm-up's body/top contacts, but it does not solve the garment deformation. The scaled simulation and the rebuilt panel remain **NOT PROMOTED**. Only sampled strict non-adjacent, non-coplanar crossings are reported; neither a sampled pass nor a valid manifold establishes visual or runtime acceptance.

Reproduce the panel with `rebuild_bomber_underarm.py -- --render --require-clear`. Test the configuration rejection with `probe_bomber_panel_cloth.py -- --scale 1`; test actual calibrated behavior with `-- --scale 10 --require-clear`. Both contact gates fail for the recorded reasons. Compact alternate constructions, projections and retained-seam controls are in `outfit04-sewn-panel-trials.json`. All 32 prior model binaries remain preserved; no failed model binary or disk cloth cache was added.

The current fitting approaches have not produced an acceptable jacket. The next bounded experiment should enforce collision avoidance during deformation of this isolated panel, starting with a clear reference surface and clean attachment boundaries. Establish independent crossing and near-contact controls, then test arm lowering before rebuilding the complete jacket or exporting another model. Body/top controls and all broader avatar acceptance requirements remain unchanged.

One candidate for that bounded experiment is IPC Toolkit: its documented barrier and continuous-collision functions can support a solver that rejects intersecting steps. It is a toolkit, not a complete simulator, so integration and a valid initial configuration still need proof. See the [getting-started guide](https://ipctk.xyz/tutorials/getting_started.html) and [simulation scope](https://ipctk.xyz/tutorials/simulation.html). It is [MIT-licensed](https://ipctk.xyz/about/license.html). No package has been installed or purchased, and no avatar data has been uploaded. Evaluate local feasibility on one panel before making any broader pipeline commitment.


## Collision-aware underarm motion: isolated surface passes, jacket not promoted

The local IPC feasibility solver now completes T-pose-to-relaxed arm lowering with **101 collision-checked linear transitions and 102 independently checked poses**. All retained transitions are clear under IPC's continuous checks for the modeled linear vertex motion. Blender's separate strict-triangle probe finds zero panel self/body/top crossings at the 102 stored poses, both against the solver's collider arrays and the evaluated source rig. The analytic minimum triangle area over the stored linear transitions is 2.03637e-6 m², above the 1e-12 m² degeneracy threshold. Stationary, tunneling, filtering, known-distance, gradient and triangle-collapse controls pass.

These are scoped midsurface results. The rest of the jacket, fabric thickness, all other actions, export interpolation, visual acceptance and gameplay remain open. Evaluated skeletal motion differs from linear collider interpolation by up to 0.118 mm at the checked poses; the continuous result does not extend to the complete nonlinear rig trajectory. No Blender source or GLB was saved or replaced. All 32 existing model binaries remain unchanged.

Two experiment defects were exposed and corrected. First, a solver can traverse an obstacle-free optimization path while the straight animation transition between its endpoints intersects. The final solver checks both paths, includes intermediate-path barriers, and discards/re-solves intervals that require subdivision. Second, Blender changed body quad diagonals in 9 of the 61 input poses; retaining only the last pose's triangle indices hid four actual body contacts at frame 25.5. The corrected exporter covers both diagonal choices for every quad and asserts coverage of evaluated triangles. This defect was in the new IPC input exporter; it does not invalidate the earlier body05/top01 checks that evaluated geometry at each pose. Discarded trial counts are kept in `outfit04-ipc-discarded-trials.json`.

The final solve took about 713 seconds on this machine. It verified 1,512 optimizer steps including discarded attempts and retained 101 transitions after 41 interval retries, reaching subdivision depth three. This is an offline experiment, not a runtime or 8 GB performance benchmark. IPC Toolkit 1.6.0, NumPy 2.5.2 and SciPy 1.18.1 were installed only in `/tmp/omnirave-ipc-env`. No paid service, project dependency change or model upload was used.

The green-panel render still has a pronounced crease and is not visually accepted. Some strain is prescribed by the fixed attachment boundary itself: one edge grows from 3.625 mm to 4.906 mm (35.3%), and the 95th percentile absolute boundary-edge strain in the relaxed pose is 23.4%. Interior fitting cannot remove stretch imposed on pinned edges. Next extend this local method to a larger connected sleeve/torso region so the problematic seam can move, preserve body/top and deliberate cuff/collar/waist attachments, then address fabric thickness and complete-jacket contacts. A clear isolated surface is not an accepted outfit or avatar.


## Latest connected-jacket finding: constrain thickness during fitting

The enlarged local IPC experiment now covers the connected torso and both sleeves, freeing the internal underarm seam. It has 1,989 simulation vertices, 3,356 triangles and 417 fixed ribbing opening vertices. Cut-sliver cleanup changes only the temporary simulation surface; the maximum opening sampling deviation is 0.494 mm. Source bodies, shirt, bind skeleton and all 32 prior model files remain unchanged.

The damped solve retained 31 clear linear transitions from source frame 31 through frame 16, then was deliberately stopped after an independent intermediate-pose failure. It did **not** complete arm lowering. At frame 21 the reduced zero-thickness surface is clear, but transferring motion to the detailed walls gives 684 self/115 body/24 shirt crossing pairs. Even the transferred midsurface folds. Rebuilding normals, welding the fine mesh, thinning walls to 0.2 mm and direct coarse-wall construction all remain unsuccessful.

The surface develops 14 folds above 150 degrees (none in T-pose). A controlled static bending-surrogate correction reduces that count to 11 but leaves wall contacts and increases body/shirt contact counts. Both static correction paths pass their midsurface checks; neither is an accepted fabric or animation result. Do not promote the garment based on a clear zero-thickness surface or a reduction in one contact class.

Next account for finite fabric clearance and resistance to fold-back during deformation from the clear starting pose, and reject a candidate early using its actual walls before running the full motion. Preserve the existing controls. Source/export action checks, reference tailoring and likeness, remaining wardrobe, gameplay/device budgets and the automated OmniAI pipeline remain outstanding. No paid source, upload or model binary was added. Detailed measurements and reproduction commands are in the body-proof README and `outfit04-connected-ipc-trials.json`.

## Finite fabric clearance and early wall screening

The follow-up starts fitting in the clear T-pose with finite separation and local fold resistance. It retains the original zero-distance collision checks, adds 1.2 mm clearance between nonlocal garment regions and 0.7 mm from the midsurface to body/top, and penalizes increasing adjacent-face angles. Local triangle neighborhoods cannot satisfy a blanket fabric gap; their extra-gap exclusion is explicit, and their original crossing checks remain enabled. This is a numerical fitting experiment, not calibrated cloth physics or a uniform finite-volume guarantee.

The detailed wall transfer fails early: one inner-wall crossing occurs at frame 30 with the new terms, versus frame 30.5 in the matched zero-term control. The captured triangles are not degenerate and their barycentric coordinates stay inside their different driving triangles. No severe fold is required for this transfer to fail. Do not resume a long detailed-wall run merely because the reduced midsurface is clear.

A separate 1 mm wall construction sharing the reduced simulation topology has 3,978 vertices and 7,960 triangles. With the initial numerical guard it completes four intervals from frame 31 through frame 29.375, then stalls near frame 29.354. Independent reconstructed-wall checks cover 21 poses and 20 straight vertex transitions, with no crossings, at least 0.769819 mm measured wall/body/top clearance, a passing 0.2 mm continuous linear-path clearance check, and a minimum analytic wall triangle area of `2.2544169e-7 m²`. These include a final partially advanced state; they do not establish a completed interval, full arm lowering, exact nonlinear rig/normal reconstruction between samples, the original action, GLB, likeness or gameplay.

The guard investigation isolates a conservative finite-distance CCD rejection on a four-vertex control whose all-time distance lower bound is 1.189999 mm, above the unchanged 0.7 mm requirement. Tightening numerical tolerance clears that control but a matched fit still stalls at nearly the same frame. A separate optional conservative-distance-bound method now subdivides unresolved primitive motions and rejects contact or uncertainty; it keeps the original zero-distance CCD and both optimizer/animation path gates. See `outfit04-finite-clearance-trials.json`, `outfit04-finite-ccd-control.json` and the launch-body README for the per-trial outcomes, controls and reproduction commands.

Body05/top01, the failed unpromoted outfit04 control and all 32 existing model binaries remain preserved. No gameplay asset, model binary, project dependency, provider request, upload or purchase is introduced. Reduced-wall diagnostic clay is visibly faceted and unfinished; no visual or likeness acceptance is issued. Both complete launch characters and the automated OmniAI-to-playable-avatar pipeline remain required and unfinished.

The conservative-bound variant subsequently completes six early intervals from frame 31 to frame 28 with clear reduced walls at all seven stored poses. Independent native-CCD wall validation covers 25 reconstructed poses and 24 linear transitions, including a 0.2 mm wall/body/top clearance gate; the smallest measured gap is 0.488428 mm. The analytic wall triangle-area minimum remains `2.2544169e-7 m²`. No fold exceeds 150 degrees in the stored fit poses. The original detailed transfer remains rejected (two self-crossing pairs at frame 28). This is an early-motion construction result, not completed arm lowering or avatar acceptance. Next extend the bounded fit beyond frame 28 while retaining actual-wall checks, then develop coherent higher-detail topology and reference tailoring. No source/export model or gameplay asset was changed.

## Actual wall constraints during fitting

Continuation exposes a local failure that the nonlocal midsurface clearance cannot cover: at frame 27, three reduced outer-wall pairs cross and one neighboring offset face reverses orientation. The midsurface is clear, no severe fold is present, and the analytic triangle-area gate alone passes. The crossing regions are one edge hop apart and contain no fixed attachment vertices. This negative trial remains in the evidence ledger.

The finite solver can now retain its original rest state when resuming and optionally differentiate the actual 1 mm walls into the fitting objective. It adds a wall barrier and sampled linear wall CCD while keeping existing gaps, fold stiffness, attachment motion and midsurface checks. Derivative, construction-parity and known-clear/known-failing motion controls pass. With these additional wall constraints, the fit clears the frame-27 failure and reaches frame 25. Independent wall checks cover the two continuation stages with nine/eight and seventeen/sixteen poses/transitions respectively; their minimum measured body/top gap is 0.465121 mm. Detailed commands and limits are in the launch-body README.

This is an offline reduced-wall construction result. All source/export binaries and viewer controls remain unchanged; the original detailed transfer still fails and no avatar, likeness, garment, full action or gameplay result is accepted. Complete arm lowering, coherent detail topology, reference tailoring, full export/action checks, remaining wardrobe, device budgets and both the characters and the automated OmniAI pipeline remain required.


## Current checked scope: frame 20, with a corrected numerical bound

Actual-wall fitting completes the next batch through frame 22. The attempt toward frame 19 times out after 30 minutes, retaining four completed intervals through frame 20. The recovered prefix has explicit partial-batch provenance and must not be reported as a completed frame-19 run. Joined saved motion covers 23 fitting poses / 22 fitting intervals and 89 independently reconstructed wall poses / 88 linear wall transitions from frame 31 through frame 20. Native zero-distance wall CCD and endpoint checks pass, minimum measured body/top gap is 0.430361 mm, and analytic wall triangle-area minima exceed `2.2543891e-7 m²`. One conservative native 0.2 mm finite-gap rejection is resolved by an independent separating-plane interval bound; the native negative is preserved. This check shares IPC broadphase coverage but does not reuse its primitive distances or the fitting bound routine.

**Correction:** the original fitting Lipschitz helper misgrouped point-first IPC vertex/face degrees of freedom and could falsely certify clearance. A moving-point/moving-face analytic collision reproduces the defect; the helper and controls are fixed. All 22 retained midsurface intervals pass a post-hoc recheck using the corrected finite bounds and native zero CCD. Unsaved optimizer trajectories cannot be reconstructed, so their earlier certification claims are withdrawn. Historical raw reports remain as provenance, subject to this correction. Reproduction commands now use the corrected implementation and are fresh experiments rather than promises of identical historical paths.

Native edge/edge CCD dominates a late timeout profile. The optional bounded-query experiment caps each native call but requires corrected clearance verification regardless of its result; its unit-step proposal also differs from the earlier method. Its corrected guard passes the saved final interval, but the optimization replay was stopped after 10 minutes 26 seconds without a completed interval. It has not demonstrated a fitting performance fix and must pass a completed fit and independent wall checks before further continuation. No model or runtime asset is promoted. Next resolve the fitting cost using captured difficult motion and conservative rejection controls, then continue incomplete lowering with actual-wall gates before attempting coherent detail, reference tailoring and the full source/export actions. Both launch characters and the automated OmniAI pipeline remain required.

## Fitting-cost investigation: validated replay, no extension beyond frame 20

An initial batched-certificate prototype crashed Python in native IPC because borrowed candidate bindings outlived their owning container. The corrected implementation retains that owner. Subsequent completed replays and analytic collision controls pass; the crash did not write a model, and all 32 model hashes remain unchanged. Batched fixed-plane certificates and relative-motion scalar bounds reduce the captured final-interval guard to 2.47 seconds in one local run. Different concurrent loads prevent interpreting this as a controlled speedup ratio. Every unresolved interval still requires the corrected scalar bound, and independent reconstructed walls still require native zero-distance CCD.

The fast fitting control completes frame 20.5 to 20 in 55 iterations and 998.62 seconds, with five independent wall poses, four linear transitions and analytic wall-area checks passing. It is a separate replay, not spliced into the retained trajectory. A fresh strict continuation from the existing frame-20 checkpoint to frame 19.5 then times out at 1,800 seconds without completing an interval. No later batch runs. The verified scope remains 31 to 20 and 89/88 reconstructed poses/transitions.

A one-micron displacement-stopping trial retains the same energy and clearance gates and is compared against a prospective 0.1 mm coordinate-error limit. It takes the same 55 iterations and returns the same endpoint to floating-point precision; independent wall and area checks pass. Both controls terminate on the existing gradient criterion, so loosening the displacement threshold provides no iteration reduction. The default remains one nanometre and the looser setting is not used for continuation. Free-only gradient checks pass at the retained endpoint. Incomplete optimizer snapshots are diagnostic telemetry, never resume checkpoints.

Next investigate cloth-settling search directions or conditioning against the completed strict replay before attempting further lowering. Do not repeat the timed-out batch or claim a tolerance speedup from these results. The original detailed garment remains rejected; neither launch avatar, the full wardrobe/actions, game/device budgets nor the automated OmniAI pipeline is accepted. The launch-body README and finite-clearance ledger contain the controls, exact scope and numerical-policy distinctions.

## Controlled construction comparison: carry forward the rest-shape change

Following the strategy review, a bounded construction experiment compares an unchanged jacket, 16 local underarm diagonal changes and a smooth underarm rest-depth change of up to 4 mm. All use the same checked frame-20.5 warm start, frame-20 target, fixed openings, stiffnesses and clearance/solver settings. The selected 448-vertex underarm region has no fixed attachments. The protocol caps each solve at 55 iterations with no subdivision and 1,200 seconds; benefits and regression limits are recorded before fitting in `outfit04-construction-study.json`.

The rest-shape variant converges in **32 iterations versus 55** for a freshly rerun unchanged control, with independent five-pose/four-transition actual-wall, finite-clearance and analytic-area gates passing. Its minimum measured wall/body/top gap is 0.437549 mm. Global p95 edge strain stays slightly below the control, and underarm p95 fold angle increases by only 0.11 degrees. The control reproduces the prior strict endpoint to floating-point precision. Post-hoc free-vertex force and finite-difference checks support the comparison: the rest-shape endpoint has a lower maximum and L2 gradient, so the lower iteration count does not hide a larger tested endpoint residual. The diagonal-change variant reaches the 55-iteration limit and misses the predeclared benefit threshold despite clear walls.

The next step is a **fresh T-pose fit of the modified rest construction**, keeping actual-wall gates. This result is a local sensitivity comparison from a common deformed pose, not a completed construction from T-pose or a new joined motion segment. It does not extend the verified frame-31-to-20 trajectory. The renders still show unfinished, faceted underarms; original detailed walls, reference tailoring, complete actions and source/export validation remain outstanding. All 32 existing model binaries and the body05/top01/outfit04 controls remain unchanged. No avatar, garment, device budget or automated OmniAI pipeline is accepted.

## Fresh rest-shape trajectory follow-up

The selected up-to-4-mm underarm rest-shape change has been fitted afresh from T-pose, with no old construction checkpoint. Its separate verified range is frame 31 to 6: 205 reconstructed wall poses/204 linear transitions, exact panel/wall/body/top joins, native zero-distance wall checks, finite clearance and analytic area gates passing. Minimum measured wall/body/top gap: 0.227096 mm. The user paused this work during the frame-5.5 solver attempt to switch to Blender skill research. All fitting processes are stopped. Frame 6 remains the last independently checked endpoint; the interrupted attempt is neither a solver-failure nor collision claim.

The fixed-attachment preflight passes all 61 input poses and 60 linear motions, covering all 417 pins via 418 edges; minimum measured gap 4.624220 mm. This necessary constraint check does not establish free-cloth or complete garment feasibility. The newer frame-6 diagnostic remains faceted and pinched at the underarms; outer offset face 1478 is reversed relative to its midsurface despite passing collision/area gates. Frame 6 also stops on the 1 nm step criterion while the maximum free-coordinate gradient remains 0.0034894938, so geometric gate passage does not establish force equilibrium. All 32 model binaries and runtime assets remain unchanged; neither this separate trajectory nor the older original-construction frame-31-to-20 result promotes a garment. The earlier 32-versus-55-iteration matched-start benefit is not a demonstrated full-fit speedup.

Evidence: `omnirave-babylon/assets-src/avatars/launch-body-proof/outfit04-rest-tpose-fit.json`; repeatable runner and collector: `run_jacket_rest_fit.py` and `summarize_jacket_rest_fit.py`. That historical trajectory remains stopped. The resumed work below uses a separate Blender construction and deformation experiment.

## Resumed with the Blender character/clothing skill

The new skill was applied to shared-rest binding, explicit cloth/collider setup, garment topology and evaluated thickness. Native weight-transfer and modifier-order variants fail the existing poses. Binding the archived fitted surface in its matching pose also fails subsequent motion, including the QuadriFlow variant. No such garment is exported or promoted.

Matched stationary controls isolate a native cloth setup defect: the complete thin shirt collider causes 5,070 shirt crossing pairs at frame 11, while an outer-surface-only shirt collision proxy stays within a micron of its initial position and has no tested crossings. The independent inspector always checks the full original shirt, including its inner wall and rims. A separate regular-topology trial reveals that QuadriFlow capped both cuff holes despite requested boundary preservation. Removing those cap proposals and explicitly checking all three opening loops fixes that construction error.

The revised proxy has 2,284 vertices, 4,408 triangles, 162 boundary pins and 2 mm additional normal ease. It passes all 11 stored warm-up samples with its actual 1 mm walls and positive offset-face orientation. It remains **NOT PROMOTED**: the bend-200 trial first fails at source frame 18 after 36 initially clear stored frames. At that failing sample there are three midsurface self pairs and 20 wall self pairs; the later source-frame-16 endpoint has zero midsurface pairs but eight wall pairs. Higher stiffness also introduces a failed stationary warm-up, so it is not a general remedy.

The measurements cover stored frames, not continuous native-cloth motion or the full original action/export. The temporary 10× geometry enables the configured small collision distances but does not establish scale-equivalent or calibrated fabric physics. The smoother renders remain construction diagnostics with unfinished underarms and reference tailoring. All 32 original model binaries, body05/top01/outfit04 and runtime controls remain unchanged; no model binary, dependency, upload or paid service is added.

Evidence and reproduction commands are in the launch-body README and `outfit04-blender-skill-study.json`. Next redesign the underarm rest pattern and its sleeve/torso transition on the corrected Blender setup, keeping the clean openings and full-thickness checks. The old IPC fit remains stopped. Both complete launch characters, remaining wardrobe/actions, likeness, game/device budgets and the automated OmniAI pipeline remain unfinished.


## Direct underarm-depth follow-up

The 12 mm depth construction slightly extends the clear sampled arm-lowering prefix to source frame 17.5, then fails at frame 17 with eight actual-wall self pairs. A 30 mm depth change fails earlier, at frame 24. Independent every-stored-frame wall/body/full-shirt and orientation inspections cover both runs. These preserve topology, all 162 boundary pins and later prescribed poses, changing only the initial 399 free underarm vertices. Neither repairs the visible pinch or completes lowering; no model is promoted.

The custom cloth rest-key experiment remains unresolved. Different rest inputs produce identical simulated coordinates in paired tests with either absolute or relative keys. A misleading initial control was corrected: its relative shape key had mix value 1 and started shortened. With zero mix and asserted initial length, no rest-driven contraction is observed; a gravity control confirms active simulation. Relative keys therefore do not establish a rest-key fix. The direct construction changes avoid dependence on that behavior. Exact scope, controls, reproduction and the withdrawn inference are recorded in the launch-body README and `outfit04-underarm-rest-study.json`.

All 32 prior model binaries and runtime controls are preserved. Next change the sleeve/torso junction and fold distribution rather than repeat depth/stiffness increases. Both complete launch characters, reference tailoring, remaining wardrobe/actions, export/device validation and the automated OmniAI pipeline are still unfinished.


## Sleeve-junction reconstruction follow-up

Both underarm patches were replaced by a constrained triangular lattice with exactly shared boundaries and unchanged 162 original attachments. The new connected construction has 2,532 vertices and 4,904 triangles. Boundary recovery rejects unconstrained triangulations that omit seam edges. The six tested variants cover the lattice alone, unbounded/bounded smoothing, two soft-guide strengths and combined bounded smoothing/guides.

None improves on the earlier 12 mm depth diagnostic, which remains clear through source frame 17.5 before failing at 17. The best new guided patch is clear through 18 and fails at 17.5; denser topology alone fails at 20.5. Unbounded smoothing introduces an initial T-pose wall crossing and is retained as a negative control. Every stored frame of all six variants is independently checked against actual 1 mm walls, original body/full shirt and offset orientation. All six construction inputs reproduce exactly. Guide variants explicitly add weighted motion constraints while retaining original hard attachments.

The launch-body README and `outfit04-sleeve-junction-study.json` record the full comparison and its sampled-only limits. No new garment or avatar is accepted, and all 32 model binaries and runtime controls remain unchanged. Next author the sleeve/armhole pattern independently of the inherited body-derived surface; further tuning of these local patch variants has not established a useful replacement. Both complete launch characters, wardrobe/actions, reference tailoring, export/device checks and the automated OmniAI pipeline remain outstanding.

## Independent pattern and corrective-prefix follow-up

A new jacket is constructed from independent front/back outlines and analytic depth, with exactly welded seams and three openings. No surface is copied from the inherited body-derived garment, and no physically sewn-cloth claim is made. The default curved-chart mesh has 5,041 vertices and 9,862 triangles. Its initial 1 mm walls pass self/body/full-shirt and orientation checks. Uniform-chart, long-edge refinement, released-pin and three QuadriFlow controls remain documented negatives; all three main construction arrays reproduce exactly.

Raw native cloth now stays clear through source frame 16, then fails at 15.5. Bounded post-cloth corrections affecting eight stored poses extend a separate checked prefix through source frame 10. All 53 saved poses and 156 quarter-step linear interpolation samples pass wall/body/full-shirt and orientation checks against the actual body rig. The 3 mm corrective cap has a 0.0001 mm numerical allowance; every hard attachment remains exact. The next frame, 9.5, remains rejected. The full 91-frame raw capture contains later body/shirt contact and is explicitly diagnostic. These sampled strict crossing results do not establish continuous motion, finite clearance, full lowering or export acceptance.

A new editable `male-authored-jacket-pattern-study.blend` retains the unbound static T-pose only, with playback restricted to frame 31 and an internal scope note. Reopening confirms geometry parity and wall checks, with no missing external images. Front/back/profile inspection still shows boxy tailoring and scalloped boundaries; reference details and underarm behavior need work. The launch-body README and `outfit04-authored-pattern-study.json` contain commands, controls, scope and hashes.

All 32 previous model binaries and runtime controls are preserved. The next step is contact-aware garment deformation for the unresolved underarm closure beginning at source frame 9.5, followed by complete lowering and other actions before detail/export. Both complete launch avatars and the automated OmniAI pipeline remain unfinished.

## Contact, sewing and fitted-sleeve follow-up

Balanced facet-contact proposals with a 6 mm post-cloth displacement cap extend the preceding curved construction to 58 clear stored poses through source frame 7.5. A new, narrower sleeve outline based on measured arm sections extends the separate corrected result to **59 saved poses through source frame 7**, with all 174 quarter-step interpolation samples independently passing actual 1 mm wall, original body, full shirt and offset-orientation checks. Fifteen poses are corrected; all 210 hard attachments remain exact relative to raw simulation. The next source frame, 6.5, still fails with wall self/body contact. Full lowering and settling are not accepted. Native cloth alone first fails at source frame 16.5, so the improvement belongs to the separate corrected trajectory.

Paired projected/unprojected controls show that increasing the old cap from 3 to 6 mm, rather than projection alone, repairs its source frame 9.5. Balanced facet proposals help at a later pose; synthetic triangle/sphere controls verify both a solvable small facet and a larger rejected facet despite clear vertices. Larger caps, transported corrections, section-weight changes and medial compression fail to complete motion.

Actual flat-panel sewing uses three pieces and 202 loose seam edges. Correcting the cut/attachment cuff mismatch and temporarily guiding seam placement closes seams at simulation frame 31, but the welded thickness still self-intersects. Releasing guides reopens the seams. Freezing a repaired welded drape into a new 3D rest shape loses the original flat-material strain and fails motion earlier than the independent construction. These remain separate negative controls.

The new `male-fitted-sleeve-pattern-study.blend` is editable, unbound and restricted to static source frame 31. Reopening verifies geometry, wall checks and packed resources. Front/back/profile and corrected endpoint inspection still show boxy torso depth, unfinished neckline/edges and underarm compression. The launch-body README and `outfit04-contact-and-sewing-study.json` preserve reproduction commands, 69 reports, input/source/result hashes and the controls. Four construction variants reproduce, with the documented default flat-schema addition and sub-femtometer target roundoff; the final sewing runner exactly reproduces the failed guided frame-31 archive. Six new scripts pass lint, formatting and compilation checks.

All 33 preceding model binaries and runtime controls are preserved; one new static construction study is added. No continuous-motion, finite-clearance, calibrated cloth, finished wardrobe or runtime acceptance is claimed. Next resolve the fitted sleeve/torso fold at source frame 6.5 without another general cap increase, then prove full lowering/settling and other actions. Both finished launch avatars, reference tailoring, remaining wardrobe, device validation and the automated OmniAI pipeline remain outstanding.

## Rigged jacket strategy reset

The new `rigged-jacket-study/male-rigged-jacket-study.blend` is an editable fitted base with native shoulder topology, the retained armature, 12 finite pose-space corrective keys and a live 1 mm Solidify modifier. Six authored support poses cover intermediate/full elbow bend, forward reach and overhead reach. A single fixed bind-space shirt-clearance adjustment, capped at 1.5 mm and applied equally to Basis and all keys, completes the reviewed gesture fits. No runtime contact solver or new cloth simulation is used.

Independent saved-rig checks pass 49 samples for each of those three motions and 18 one-arm variants, using both reconstructed walls and the actual modifier against themselves, the body and the complete shirt. Three review actions are saved for inspection. Reopening the exact delivered file passes all 291 sampled outbound playback positions; the return keys mirror the outbound values, with return subframes not separately sampled. Source/key preservation and external-image checks pass.

**Full lowering remains rejected:** 59 of 61 original samples fail, first at source frame 30. Gaussian keys extrapolate poorly along that motion and introduce earlier contacts than the uncorrected base. Failed full-down fitting targets are excluded from the corrective set. The asset remains a close-fitting deformation study with unfinished chest contours, boundaries, bomber proportions and reference materials. No avatar, wardrobe or runtime candidate is promoted.

All 34 preceding model binaries remain unchanged. The launch-body README provides reproducible commands and the retained input bundle; `outfit04-rigged-armhole-study.json`, `saved-rig-check.json` and `review-actions-check.json` record controls, scope and hashes. Next resolve the lowered-arm shape and corrective activation outside the reviewed gestures before detailing or export. Both finished launch avatars and the automated OmniAI pipeline remain unfinished.


### Rigged jacket activation follow-up

A separate `rigged-jacket-gated-study` source preserves the 291 checked review samples while limiting each arm's correctives to the three calibrated motion curves. The original lowering matches the muted-key control after the early activation regression is removed; its fully lowered endpoint still fails. Preserve Volume also failed a bounded three-pose control and was not adopted. The next garment work remains a valid shoulder/armhole shape for full lowering, followed by motion validation before finished tailoring. Original bodies, shirt, skeleton and prior model binaries remain preserved.


## Male jacket original lowering resolved — 2026-09-06

The retained study at `omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-lowering-study/` contains an editable fourteen-key jacket and its portable inputs. Two new native per-arm endpoint keys use a scoped bone-direction gate; no runtime collision handler was introduced. The exact saved/reopened model passes 61 original half-frame lowering samples, 291 existing review samples with exact old-key parity, and two one-arm-down/T controls. The new lowering checks include actual 1 mm Solidify contacts, midsurface crossings, body containment, shirt layering and thickness-face orientation. All source model binaries and the original body, shirt, skeleton, weights, topology, twelve keys and animation content are preserved.

The geometric change follows the measured inward-sloping underarm gap, retains the original shirt fit away from contact regions, and removes a local front-opening fold. The accepted target is an authored NPZ input; the installer recreates the native keys and drivers from it. See the study README, `lowering-audit.json`, `target-authoring.json` and rendered views for evidence and exact scope. Luna was increased to max after implementation faults; two further diagnostic errors prompted Terra high for verification and installation. Astra directed and reviewed the geometry work.

This closes the original full-lowering blocker for the scoped rigged study. It does not promote a finished reference avatar or runtime asset. Further work covers tailoring/reference appearance, wider independent-arm motion and export validation; female appearance and existing independent wardrobe/body findings retain their earlier status.


### Open-front jacket tailoring — 2026-09-06

Advanced the validated male lowering rig into an open-front tailoring study at `omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-tailoring-study/male-rigged-jacket-tailored.blend`. Shared-edge clipping transfers all corrective shapes; a three-ring standing collar uses measured shirt/body envelopes and a bounded fixed bind-space fit. Pearl satin, black knit, paired gold bands and zipper detail use rest-coordinate shaders without displacement. The 2,671-vertex/5,088-triangle garment remains one connected component with three opening loops, at most four bone influences, 14 native keys and the existing 1 mm Solidify.

The exact delivered file passes 354 sampled configurations (61 lowering, 291 gesture samples and two independent-arm controls), with zero native strict self/body/shirt crossings, midsurface crossings, inside/ambiguous flags, near-normal layer flags or thickness reversals. Existing driver values remain exact, and independent lowering keys activate at the expected 1/0 values. Minimum area is 7.35e-9 m²; minimum thickness orientation ratio is 0.413. The body, shirt geometry, rig, action contents, modifiers and 37 preceding model binaries remain preserved. Retained original key coordinates are exact; retained original weights differ by at most 2.98e-8 from normalization/float storage. Independent rebuilds match geometry, skin, keys, drivers, rest attributes and native T/down output exactly.

Portable scripts and retained provenance/negative-control evidence are documented in the study README. This is finite sampled deformation acceptance. General motion, optimized topology, texture/UV/runtime export and device testing remain open. Next shape the looser bomber sleeves and authored folds, refine the collar silhouette, and add the reference embroidery, utility pockets and hardware. Both finished launch avatars, remaining wardrobe/actions and the automated OmniAI pipeline remain outstanding.


## Bomber sleeve volume checkpoint

`rigged-jacket-sleeves-study/male-rigged-jacket-sleeves.blend` continues the open-front tailoring study with fuller outer sleeves and subtle broad oblique folds. It offsets 358 vertices while preserving all shape coordinates on the other 2,313; topology, weights, 14 native corrective keys, original materials and the body/shirt/rig/actions remain preserved. The same bind offset is added to all fifteen shape blocks, with at most 5.96e-8 m relative-key float residual. Maximum authored T displacement is 13.798 mm. The inner sleeve channel and front elbow crease taper to the passing source shape after two rejected contact controls.

The exact new binary passes the established 354 finite checks (61 lowering, 291 gesture, two independent-arm endpoints), with all strict-crossing, containment, layering and thickness-orientation guards clear. A portable rebuild reproduces geometry, skin, keys, checked metadata/attributes and native T/down output exactly. The study README, provenance, two rejected quick controls, full audit, reproduction check and five rendered views are retained beside the model. All 38 preceding model binaries remain unchanged.

This is a sleeve-volume milestone. Detailed satin wrinkles, smoother silhouette topology, collar refinement, embroidery/pockets/hardware, full reference likeness and runtime export remain unfinished. Continuous motion, coplanar contact, positive minimum clearance and general animations remain unvalidated. The working body05/runtime candidate is unchanged.


## Refined standing-collar checkpoint

`rigged-jacket-collar-refinement-study/male-rigged-jacket-collar-refined.blend` replaces the collar rim's inherited arm/shoulder flare with a chest/neck blend on its 123 existing ring vertices. The original 2,548 vertices, sewn seam, body panels, sleeves and cuffs preserve exact weights and all shape coordinates. The rim uses 25% spine_03 /75% neck_01, with the influence blend and relative-key attenuation fading down the middle/quarter rings. The same topology, 14 corrective drivers, body/shirt, skeleton, actions, modifiers and shader attributes remain. Default lowered rim width improves from 217.6 to 183.7 mm, and maximum adjacent Z second difference from 3.797 to 0.869 mm.

The exact binary passes all 354 established samples (61 lowering,291 gestures, two independent-arm endpoints) with all native strict-crossing, containment, layering and thickness guards clear. A fresh rebuild reproduces geometry/skin/keys/attributes/checked metadata and native T/down output exactly. Seven review images and the associated reports are retained beside the model; all 39 preceding model binaries are preserved.

An added eight-control neck probe identifies an explicit unfinished boundary: all four lowered controls and one T control pass; three T controls retain 4/4/12 original shirt-seam pairs versus 4/4/16 in the source. There are no introduced crossing pairs. General neck motion remains unaccepted, as do continuous/coplanar/positive-clearance guarantees and runtime export. Detailed satin wrinkles, smoother silhouette topology, pockets/embroidery/hardware and full reference likeness remain unfinished. The working body05/runtime candidate remains unchanged.


## Neck-seam clearance checkpoint

The new `rigged-jacket-neck-seam-study/male-rigged-jacket-neck-seam.blend` clears the three inherited 4/4/12-pair shirt-contact cases at the refined collar. The exact file passes all 354 established arm-motion samples, all eight neck endpoint controls and the 36-sample single-axis neck sweep. The neck scopes overlap; combined-axis/general neck motion, continuous/coplanar/positive-clearance guarantees and runtime export remain unvalidated.

The correction offsets 44 sewn-surface vertices by 0.15–0.35 mm in the authored T pose, using one coherent translation at the tiny front collar junction. All other 2,627 vertices preserve exact shape coordinates. Topology, weights, relative corrective shapes within 7.451e-9 m float residual, driver behavior, body/shirt/rig/actions and shader attributes are preserved. The full audit, paired source controls, intermediate sweep, rejected controls, exact rebuild check, provenance and five renders accompany the model. All 40 preceding model binaries remain unchanged.

This resolves the finite neck-seam boundary documented in the prior checkpoint. Body-panel tailoring, satin folds, pockets/embroidery/hardware, full male/female likeness and remaining outfits, broader animation coverage, runtime export and in-game/device validation remain unfinished. Estimated overall effort completion for both game-ready avatars is roughly 25%, a planning estimate rather than a measured acceptance score.


## Jacket front-panel shape checkpoint

The new `rigged-jacket-chest-study/male-rigged-jacket-chest.blend` removes the body-derived nipple relief and gives the chest and waist smoother hanging front panels. A curved surface is fitted in the actual lowered pose, with transitions before the neck, hem and side/armhole regions. Local tangential relaxation separates inherited overlapping XZ triangle footprints before flattening their depth. The initial depth-only candidate failed 14 self-crossings and is retained as a rejected control. Maximum forward displacement is 45.175 mm; local tangential displacement is at most 5.665 mm.

The delivered model passes all 354 established arm-motion samples and all 36 finite single-axis neck samples, with every existing strict-crossing, containment, layer-order and thickness-orientation guard clear. Topology, weights, driver behavior, body/shirt/rig/actions and shader attributes remain exact. The same bind offset is added to all fifteen shape blocks; 624 vertices move by more than 1 nm, two taper endpoints have smaller computed offsets, and 2,047 vertices (including those taper endpoints) preserve exact stored shape coordinates. A fresh build reproduces mesh/keys/skin/checked metadata and native T/down output exactly. Five renders, provenance, source diagnostics, the rejected control, full audits and reproduction evidence accompany the model. All 41 preceding model binaries remain unchanged.

This establishes smoother front-panel massing. Satin folds, pockets/embroidery/hardware, complete male/female likeness and outfits, broader animation coverage, runtime export and in-game/device testing remain unfinished. The existing body05/runtime candidate is unchanged. Finite samples do not certify arbitrary/combined motion, continuous clearance, coplanar contact or a positive clearance margin.


## Jacket satin folds and finish checkpoint

`rigged-jacket-satin-study/male-rigged-jacket-satin.blend` adds three broad front-panel fold fans and outer-sleeve compression, followed by a jacket-only satin material refinement. The front folds preserve a flat 10 mm strip beside the zipper; the outer sleeve field preserves the inner arm channel and elbow/cuff transitions. Maximum authored T displacement is 5.998 mm. The same bind offset is added to all fifteen shape blocks, preserving topology, weights and native driver behavior. Fine normal detail uses the existing TailorRest attribute; the material adds no geometric displacement.

All 354 established arm-motion samples pass on the geometry intermediate. An exact geometry/skin/shape/deformation-metadata preservation bridge links it to the final styled binary; all 36 finite neck controls pass directly on that final file. Every existing strict-crossing, containment, layer-order and thickness-orientation guard remains clear. The final minimum offset-orientation/area ratio is restored to 0.4130 after a superseded passing candidate compressed a tiny zipper-adjacent triangle to 0.1166. A fresh two-step rebuild reproduces geometry, skin, keys, checked materials/metadata/attributes, native T/down output and provenance arrays exactly. Seven review views, source sampling diagnostics, the earlier control, full motion/neck reports and the shading bridge accompany the model. All 42 preceding model binaries remain unchanged.

This is an initial folds-and-finish milestone. Pockets, embroidery, hardware, more detailed reference tailoring, complete male/female likeness and outfits, broader animation coverage and runtime/device validation remain unfinished. The jacket has no UV layers and its procedural material still needs an export/baking strategy for Babylon. The working body05/runtime candidate remains unchanged; finite samples do not certify arbitrary/combined motion, continuous/coplanar contact or positive minimum clearance.


## Jacket pocket and hardware checkpoint

`rigged-jacket-hardware-study/male-rigged-jacket-hardware.blend` adds two closed hip zipper faces, a closed left sleeve utility zipper face, and four hollow gold pull tabs. Seven new meshes use the original armature and matching corrective values, with four normalized influences per vertex at most. Each tooth and pull has a shared support anchor; dense panel sampling and outward projection resolve the first candidate's faceted-normal intersections. The original jacket, body, shirt, skeleton, actions, shaders and corrective geometry are preserved exactly.

The exact new binary passes 354 established arm samples and 36 finite neck controls. New hardware has zero unintended strict crossings with the jacket/body/shirt, within components or between objects; tooth-to-nearby-panel and pull-to-own-slider mating are explicitly allowed. Source geometry/deformation preservation carries the existing coat checks forward. A fresh build reproduces all geometry/skin/keys/checked metadata, smoothing, native T/down results and provenance exactly. Nine rendered views, the failed-fit control, full audit and measured attachment/metal-strain summaries accompany the model. All 43 preceding model binaries remain unchanged.

These are closed decorative zipper fronts, without working pocket openings or zipper animation. Hardware adds 20,276 authoring triangles and still needs runtime/LOD review. Hip weight truncation reaches 4.391%; walking and leg motion are untested. Embroidery, full male/female likeness and outfits, broader animation, UV/material baking, corrective export and in-game/device validation remain unfinished. Finite scopes overlap and do not certify arbitrary/combined motion, continuous or coplanar contact, physical cloth response or positive minimum clearance. The body05/runtime candidate remains unchanged.


## Right-sleeve embroidery checkpoint

`rigged-jacket-embroidery-study/male-rigged-jacket-embroidered.blend` adds an authored gold filigree interpretation of the reference's visible right-sleeve linework. A packed 2048² atlas supplies color coverage and thread normal relief through a sleeve-specific UV; the finish adds no geometry. The first thin-line style was strengthened for visibility at the review distance. The pattern is an authored interpretation of a foreshortened reference, not an exact recovered design.

The independent preservation bridge verifies every existing mesh/skin/shape and shape metadata, rig/action/driver/transform, original attribute and non-jacket material. Only the jacket material, JacketEmbroideryUV and TailorEmbroidery face mask change; material displacement is absent. It validates the preceding hardware audit's SHA and source-model match, carrying forward its accepted 354 arm and 36 neck samples through unchanged geometry. Those scopes overlap; no redundant full collision run is claimed. The named packed atlas and actual-T cylindrical UV contract pass, and wrong-image-hash/wrong-UV controls fail as intended.

A fresh build reproduces all checked geometry/skin/keys/UV/material/rig metadata, packed image bytes and native coat/hardware T/down output exactly. Eight review views, the initial faint-style control, interpretation notes, bridge audit and rebuild evidence accompany the model. All 44 preceding model binaries are unchanged. Complete male/female likeness, hair, remaining clothing/accessories, closer reference tailoring, broad animation, full UV/material baking and runtime export/device testing remain unfinished. This local UV layer does not constitute a full garment unwrap. The body05/runtime candidate remains unchanged.


## Shirt detail checkpoint

`rigged-shirt-detail-study/male-rigged-shirt-detailed.blend` adds a center placket extending to the measured hem, two pointed collar overlays and four dark buttons with gold rims. Seven closed meshes add 3,618 vertices and 7,208 triangles, using the original shirt's skinning with four normalized influences at most. All original mesh/skin/shape/rig/action/material/embroidery data remain exact. The independent auditor reconstructs the transferred weights from original shirt triangles; maximum top-four weight truncation is 0.65291%.

The exact saved model passes 354 established arm samples and 36 single-axis neck samples with zero strict crossings involving the new details: shirt/body/coat/hardware, self and inter-detail. There are no mating exceptions for the shirt details. The original accepted coat/hardware scope carries forward through unchanged source geometry and a verified embroidery-audit bridge. A fresh build reproduces checked static data, packed images, all 26 evaluated meshes in native T/down and all 35 provenance arrays exactly. Eight reviewed views, the rejected fit control, source surface probes, full audit and reproduction evidence accompany the model. All 45 preceding model binaries remain unchanged.

The collar flaps are an initial tailoring pass; their visible upper ends still need a continuous neck band. Button holes are shader wells. Maximum collar edge strain is 23.421% and unsigned distance to the open shirt reaches 12.704 mm; these are reported metrics without physical acceptance thresholds. The finite scopes overlap and do not certify arbitrary/combined motion, continuous/coplanar contact, positive clearance or locomotion. Full likeness/outfits, closer reference tailoring, material baking, corrective export and runtime/device tests remain unfinished. The body05/runtime candidate remains unchanged.


## Connected shirt-neckband checkpoint

`rigged-shirt-neckband-study/male-rigged-shirt-neckband.blend` joins both pointed collar flaps into one closed collar mesh with a band around the neck. All 1,152 original flap vertices preserve exact coordinates, weights and attributes; sixteen upper cap triangles per flap are replaced by shared-vertex connections. The resulting mesh has 9,054 vertices and 18,104 triangles, adding 7,902 vertices and a net 15,808 authoring triangles. The band's rear lower edge is fitted 0.5 mm above the measured shirt rim in the authored T pose; it remains a separate fitted layer rather than a sewn shirt seam. Every other mesh, rig/action, skin/shape, material and packed image remains exact.

The exact final binary passes all 354 established arm samples and 36 single-axis neck samples with zero strict collar crossings involving body, shirt, coat, hardware, remaining shirt details or itself. No collar mating exceptions are used. An independent auditor verifies the preserved flap surfaces, one consistently wound closed component and the reconstructed body/shirt anchor weights, including localized smoothing. A fresh rebuild matches static data, raw topology/edge indices, packed images, all 25 meshes in native T/down and all 13 provenance arrays exactly. Explicit sorted edges resolve Blender's thread-dependent edge indexing. Nine reviewed views, development controls, provenance and full audit/reproduction evidence accompany the model. All 46 preceding model binaries remain unchanged.

Physical cloth acceptance remains open: maximum edge strain is 69.384% in overhead review. A localized neck-control transition improved from 133.919% to 40.857%, but neither value is a passed physical threshold. Body/shirt-derived head influence is merged into the neck for the tested scope; independent head motion is untested. These overlapping finite scopes do not certify arbitrary/combined motion, continuous/coplanar contact, positive clearance or locomotion. Sewing the collar into a refined shirt pattern, full reference likeness/outfits, material baking and runtime/device validation remain unfinished. The body05/runtime candidate is unchanged.


## Collar deformation checkpoint

`rigged-collar-deformation-study/male-rigged-collar-deformation.blend` reduces maximum sampled collar edge strain from 69.384% to 53.807%, a 22.45% relative reduction. The band interior blends toward weights interpolated along measured cross-section arcs, while both rim rows retain their original skin. Compensating bind coordinates preserve the source T shape within 0.2384 micrometers. Exactly 5,306 band vertices change; all other 3,748 collar vertices remain exact, including the 1,152 original flap vertices and 1,756 rim vertices. Topology, raw edge indices, smoothing, attributes, materials, all other meshes and rig/action/corrective data are preserved.

The exact saved model passes 354 established arm samples and 36 single-axis neck samples with zero strict collar crossings against body, shirt, coat, hardware, remaining shirt details or itself. An independent audit reconstructs the arc fractions and weights from the source, checks exact rim preservation and verifies the preceding accepted audit bridge. A fresh rebuild matches all checked static data, packed images, all 25 meshes in native T/down and all seven provenance arrays exactly. Nine reviewed views, motion comparisons and a rejected lower-rim contact trial accompany the model. All 47 preceding model binaries are unchanged.

Substantial strain remains; this is a deformation improvement, with physical cloth behavior still unaccepted. Sewing the band into a refined shirt pattern, independent head motion, broader/combined animation, full likeness/outfits, material baking and runtime/device tests remain unfinished. These overlapping finite samples do not certify continuous/coplanar contact or positive minimum clearance. The body05/runtime candidate remains unchanged.


## Collar pose-correction checkpoint

`rigged-collar-corrective-study/male-rigged-collar-correctives.blend` adds four collar shape keys driven by the existing left/right overhead and forward controls. Maximum sampled source-relative edge strain falls from 53.807% to 39.316%, a 26.93% relative reduction. The largest target-pose displacement is 1.252 mm. Raw collar basis, skin weights, topology, attributes, materials and all other source data remain exact; all original flap vertices remain exact in every key. Native T/down output is unchanged.

The saved model passes 354 established arm samples, 36 single-axis neck samples and 16 additional unilateral reach samples with zero strict collar crossings against body, shirt, coat, hardware, other details or itself. The auditor reconstructs all four exact key arrays from source pose matrices and retained fit inputs, verifies driver ownership and checks the preceding accepted source audit. A fresh build reproduces checked static data, packed images, all 25 native T/down meshes and all five provenance arrays exactly. Four target-pose renders were reviewed. All 48 preceding model binaries are unchanged. This pass used Astra alone.

These overlapping finite checks do not establish physical cloth acceptance, arbitrary/combined movement, continuous/coplanar collision or positive clearance. The open shirt pattern and separate collar-to-shirt gap remain visible with the jacket hidden; sewing, independent head motion, full avatar likeness/outfits, baking and runtime export remain unfinished. The runtime candidate is unchanged.
