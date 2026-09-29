# OmniAI → OmniAvatar backend pipeline

Implementation status: the provider-neutral state machine is executable in
`backend/internal/omniavatar/pipeline`; the GLB structural gate is executable
through `npm run avatar:validate -- <path.glb>`. Reconstruction, retopology,
rigging, and likeness remain provider/manual stages and are not represented as
complete merely because the state machine exists.

Durable job storage is defined by migration `111_omniavatar_pipeline_jobs` and
the PostgreSQL adapter in `backend/internal/omniavatar/repository`. Job updates
use optimistic versions and append the corresponding immutable event in one
transaction. Each update locks and replay-validates the stored job, then proves
the proposed snapshot preserves its immutable metadata and complete history
while appending exactly one event. Job rows and event histories are read in one
repeatable-read snapshot, then replay-validated before use. A public creation
endpoint is intentionally deferred until the OmniChat checkout supplies an
authoritative, ownership-checkable OmniAI character identifier; accepting an
unverified client character ID here would create an IDOR boundary.

Worker claiming is implemented by migration `112_omniavatar_worker_leases` and
the `pipeline.WorkerRepository` contract. Claims use PostgreSQL
`FOR UPDATE SKIP LOCKED`, a database-clock expiry, an opaque UUIDv4 attempt token,
and a monotonic attempt number. Claim order uses the oldest of each job's
creation/last-claim timestamp: untouched jobs get a turn after older work is
claimed, while a stream of newly arriving jobs cannot permanently starve work
that previously released or lost a lease. Renewal,
advancement, and failure recording all require the live token; an
expired/reclaimed worker cannot commit. Owner cancellation clears any live
lease. The old unleased system-transition methods were removed, so ordinary
repository updates can only record owner cancellation.

Migration `113_omniavatar_provider_dispatch_outbox` and the
`pipeline.ProviderDispatchRepository` boundary now make entry into
`reconstructing` atomic with creation of an immutable provider command. The
command binds the job/owner/version, canonical ordered reference keys, provider
route, model, a dispatch-derived idempotency key, and the authorized per-job
credit ceiling before a paid call can occur. Dispatch workers use independent
expiring leases, provider-visible retries reuse the same idempotency key, and
explicit pre-submission failures are bounded to five attempts before a terminal
outbox failure. Cancelling a job atomically cancels any pending command. The
dispatcher executable and provider adapter remain intentionally unwired, so no
vendor call, upload, or credit spend occurs from this implementation. A future
dispatcher must treat a crash after provider acceptance but before local task
persistence as an idempotent resubmission, and must translate cancellation of
an already-submitted provider task into a durable cancel command.

Stage evidence is executable through `pipeline.EvidenceRecorder`. It writes the
artifact and validation report to deterministic job-scoped keys using atomic
create-if-absent storage operations, records SHA-256 for each, accepts
byte-identical retries, and rejects a different payload at an existing key as a
hard integrity conflict. The local adapter confines operations with `os.Root`
and publishes through an atomic hard link; the S3/R2 adapter uses
`If-None-Match: *`. A failed second write can leave
an unreferenced first object, but a retry safely completes the same deterministic
pair and no job transition occurs until both objects are verified.
Artifact and report keys must be unique across the complete job history, so a
retry creates a new immutable evidence pair instead of reusing an earlier
attempt's namespace. The recorder downloads and hashes both newly created and
pre-existing objects before it emits evidence, verifies the claimed media type
and canonical filename extension, rejects image bytes after the true JPEG, PNG,
or WebP envelope, fully decodes image artifacts within a bounded pixel budget,
requires a structurally valid GLB 2.0 envelope where applicable, and requires
the report to be a top-level JSON object. Evidence snapshots bind the verified
media type and byte length as well as each key and SHA-256 digest.
Retry history is bounded to five failures and 27 persisted events; application
validation and database constraints enforce the same limits.

## Job states

`queued → validating_image → generating_views → checking_consistency →
reconstructing → conforming_topology → texturing_pbr → separating_slots →
rigging_skinning → retargeting → testing (deform/clip/GLB/Babylon) →
ready → published | failed_retryable | manual_review | cancelled`

- Each completed processing stage writes an artifact plus a machine-checkable
  report JSON. Queue entry, retry resumption, cancellation, failure, and manual
  review transitions are control events and do not claim new stage evidence.
- `failed_retryable` may run at most N times (configurable, default 2) with a
  different reconstruction route before `manual_review`.
- Manual review queue shows the turnaround sheet, consistency scores, failed
  checks, and side-by-side Babylon captures.
- Every persisted job has a canonical UUIDv4, an owning user ID, an optimistic version,
  bounded retries, immutable artifact/report evidence snapshots, monotonic
  event timestamps, and canonical job-scoped storage keys. Provider adapters
  receive storage keys rather than arbitrary
  user URLs, and every provider request must carry an idempotency key plus a
  positive per-job credit ceiling.

## Executable GLB gate

`avatar-contract.v2.json` is the machine-readable source-GLB subset of
`CONTRACT.md`. Runtime 1024px WebP derivation remains a later packaging gate.
The validator checks GLB magic/version/self-containment before parsing, then
fails closed on quarantined provenance, missing nodes/joints/animations/morphs,
duplicate names, unused scene resources, empty geometry/clips, invalid skin
bindings/weights/joint indices, absent UV/normal data, undocumented PBR texture
omissions, unsupported/empty/unverifiable/oversized textures, triangle budget,
and draw-call budget. Identity, topology flow, UV overlap, deformation quality,
and Babylon performance remain explicit downstream gates because none can be
honestly inferred from GLB inventory alone.

## Stage contracts (what the golden cases prove)

1. `validating_image`: single PNG/WebP, face visible, full or 3/4 body, NSFW/
   license screen. Output: normalized source + authority hash.
2. `generating_views`: exactly six neutral T-pose turnaround views
   (front/back/left/right/front-3/4/rear-3/4), plus an optional neutral face
   close-up. All objects stay within the job UUID namespace; storage keys and
   generated image hashes must be unique. Forbid action poses as geometry refs.
3. `checking_consistency`: face embedding distance, garment color histogram,
   accessory presence, left/right orientation, camera scale drift. Thresholds
   in config; failures regenerate views.
4. `reconstructing`: image→3D route of choice (local sculpt assist or approved
   vendor). Output: raw high-res mesh + albedo.
5. `conforming_topology`: wrap to canonical `AvatarBody` topology (13–18k
   quads), transfer identity deltas as shape-corrected sculpt, never as bone
   scale. Output: body mesh + identity report (landmark error).
6. `texturing_pbr`: albedo/normal/roughness minimum (+metallic/AO/alpha/
   emissive as needed), no baked studio light. Output: texture set + UV check.
7. `separating_slots`: hair/top/jacket/bottoms/shoes/accessories as distinct
   meshes with `AvatarSlot_*` roots and `none` options.
8. `rigging_skinning`: bind to canonical 56-bone skeleton, T-pose, weight
   validation (sums ±0.001, 4 influences max, tear check).
9. `retargeting`: map shared locomotion library by joint name + rest offset.
10. `testing`: idle/walk/run/turn/jump/crouch/arms-raised/dance stress renders
    in Babylon headless; GLB validity; budgets (tris/draws/memory/load/fps).

## Remaining manual steps (must automate later)

- Likeness sculpt (cheek/jaw/nose/eye identity deltas from photos).
- Hair mass sculpt (quiff locks, pony mass + flyaways) and card/strand decision.
- Garment pattern fit (bomber drape, cargo pocket placement, holo shell thickness).
- Tattoo/paint-splatter albedo painting (female crop + joggers).
- Chain/strap curve routing and pendant placement.
- Weight-paint cleanup at armpit, elbow, wrist, waist, groin, knee, ankle.
- Blink/jaw shape-key authoring and viseme spot-check.
- Emissive intensity grading for LED soles under venue lights.
- Final art-director likeness sign-off (human judgment gate before publish).
