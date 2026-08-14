# OmniChat video generation

## Context

The image path now produces identity-correct, scene-correct stills. Video is the next
feature, and it has never actually run.

What is there today:

- The UI is complete. "Scene video" and `/video` exist in `OmniChatChatPage.tsx`, `/video`
  and `/clip` parse in `omnichatMediaIntent.ts`, `image_to_video` (animate an existing
  asset) is wired from `OmniChatCreatePage.tsx`, and billing already charges 40 credits
  for video vs 10 for image (`omnichat_billing.go:294`).
- The backend job, queue, polling, scan, storage and asset paths all handle `kind: video`
  already.
- `VideoGenerator.render` has no scene contract and no identity conditioning
  (`generators.py:1150`). It passes `request.prompt` straight to Wan 2.1 text-to-video, and
  when references exist it silently uses the first reference photo as the init frame
  (`generators.py:1158`, `:1174`) — which would render the persona in her reference photo's
  setting rather than the current scene.
- The RunPod `omnichat-video` endpoint is broken. It points at template `6l94ogw9ch`,
  which returns 404 (deleted). Only `nickf579/omnichat-video-worker:v1` and `:v3` were ever
  pushed. It is also running `workersStandby: 1`, holding a worker warm for a feature that
  cannot start.

**Outcome:** "Scene video" and `/video` produce a clip that is recognisably the persona, in
the current scene, in motion — reusing the identity pipeline rather than duplicating it.

## Decisions taken

| Question | Decision |
| --- | --- |
| Architecture | Two-phase: the image endpoint renders the still, the video endpoint animates it |
| Model | `Wan-AI/Wan2.2-TI2V-5B-Diffusers` (Apache-2.0, 720p/24fps, 121 frames, single 24GB GPU) |
| Intermediate still | Saved as a real gallery asset |
| NSFW | Required |

On "which architecture gives the best video quality": two-phase and a combined
single-container worker are pixel-identical. Both animate the same identity-correct SDXL
still; the only difference is whether the still crosses R2 as a lossless PNG in between.
The choice is operational, and two-phase wins there — the video container stays small (Wan
only, fast cold start), and every identity tuning knob lives on exactly one template
instead of two that must be kept in lockstep. Text-to-video is the only option that is
genuinely lower quality, because it has no identity conditioning at all.

### Cost model

One 40-credit charge now buys two GPU renders (SDXL still + Wan clip). That is deliberate:
the still is an input to the clip, not a separately saleable artifact, even though it lands
in the gallery. Refund semantics are unchanged and already correct — a Phase A failure
refunds the full 40, because billing is captured only once, after Phase B commits.

## Phase 1 — Reset the video endpoint

Not code, but it blocks every test.

1. Rebuild and push `nickf579/omnichat-video-worker` with the required buildx flags
   (`--platform linux/amd64 --provenance=false --sbom=false`, `oci-mediatypes=false`) —
   see `infra/runpod/README.md:39` for why omitting them fails silently with the worker
   stuck at `initializing`.
2. Create a fresh template (the old one is gone), container disk ≥ 50 GB, copying the R2/S3
   env block from the image template `7g36zlzlk5`.
3. Point endpoint `omnichat-video` at it and set `workersStandby: 0`.
4. Raise the endpoint execution timeout to match the new backend timeout in Phase 3
   (≥ 1800 s). A 121-frame 5B render does not finish inside the current 900 s.

## Phase 2 — Worker: Wan 2.2, image-to-video only

`generators.py` — `VideoGenerator`.

- Delete the text-to-video branch entirely: `_text_pipeline`, the `WanPipeline` import,
  `OMNICHAT_VIDEO_TEXT_MODEL_ID`, and the `bool(request.reference_image_urls)` init-frame
  fallback. After Phase 3 the backend always supplies `source_image_url`; a video request
  without one is a contract error, not a silent downgrade.
- Default `OMNICHAT_VIDEO_IMAGE_MODEL_ID` → `Wan-AI/Wan2.2-TI2V-5B-Diffusers`. Load per the
  diffusers Wan docs: `AutoencoderKLWan.from_pretrained(..., subfolder="vae",
  dtype=torch.float32)` passed into `WanImageToVideoPipeline.from_pretrained(...,
  dtype=torch.bfloat16)`, then `enable_model_cpu_offload()`.
- Frames and fps: default `OMNICHAT_VIDEO_FPS` 16 → 24. Wan requires `num_frames` of the
  form 4k+1 and is trained at 121; compute the nearest valid count for
  `duration_seconds * fps` and clamp to `OMNICHAT_VIDEO_MAX_FRAMES` (default 121). Quality
  degrades away from the trained length — note it in the README rather than silently
  honouring a 10 s request.
- Dimensions: stop using the SDXL `ASPECT_RATIOS` table for video. Derive height/width from
  the source still's own aspect ratio using the documented snap — `mod_value =
  pipe.vae_scale_factor_spatial * pipe.transformer.config.patch_size[1]`, `max_area` from
  `OMNICHAT_VIDEO_MAX_AREA` (default 720*1280). The still is authoritative; a mismatched
  frame would letterbox or crop the identity work.
- LoRA hook: `OMNICHAT_VIDEO_LORA_MODEL_ID` / `_WEIGHT_NAME` / `_SCALE`, applied with
  `pipe.load_lora_weights` when set. Mirrors the identity-LoRA env shape already in the
  contract. This is how an NSFW motion LoRA gets dropped in without a rebuild — see Phase 5.

`contract.py`: drop nothing, but the backend will now always send `mode: image_to_video`
for video, so the existing `source_image_url is required` check becomes the enforcement
point.

## Phase 3 — Backend: two-phase video job

`omnichat_generation_handler.go`.

### 3a. Factor the provider loop

The submit → poll → cancel → fetch-result loop inside `process` (lines ~244–356) is
currently inlined against a single spec. Factor it into:

```go
func (h *OmniChatGenerationHandler) runProviderPhase(ctx context.Context, job *models.OmniChatGenerationJob, p providerPhase) (*runpod.Result, error)
```

where `providerPhase` carries `spec`, `submit bool`, `providerJobID string`, and
`progressMin, progressMax int`.

**Its semantics do change** — three things that are implicit today become parameters:

- **Submit vs resume.** Today the branch is `if job.Status == queued` (`:255`). Phase B
  always runs with the job already `running`, so left as-is it falls into the
  `else if providerJobID == ""` branch and returns `provider_state_invalid`. The caller
  decides; the phase obeys.
- **How the provider job id is recorded.** Phase A keeps `MarkGenerationJobRunning`
  (`queued` → `running`). Phase B needs the new repository method in 3d — the existing one
  is `WHERE id = $1 AND status = 'queued'` (`omnichat_media.go:391`) and would silently
  no-op, leaving Phase A's id on the row for a retry to poll.
- **Progress bounds.** The loop climbs `progress` to 90 (`:314`). Phase A alone would reach
  90 and the bar would sit frozen through the entire, slower, video render. Phase A gets
  1–40, Phase B 40–90. Seed from `max(job.Progress, progressMin)` so a resumed Phase B does
  not restart the bar. `UpdateGenerationProgress` already uses `GREATEST`, so this is
  monotonic across phases without extra guarding.

Everything else — cancellation checks, the timed-out-cancel defer, the terminal status
mapping — is unchanged and moves verbatim.

### 3b. Factor persistence

Extract lines ~368–409 into:

```go
func (h *OmniChatGenerationHandler) persistGeneratedMedia(ctx context.Context, job *models.OmniChatGenerationJob, kind models.OmniChatMediaKind, result *runpod.Result, commit func(*models.MediaFile, *models.OmniChatMediaAsset) error) error
```

**`kind` must be a parameter, not read from `job.Kind`.** Four call sites in this block
read the job's kind and would all say "video" during Phase A:

- `selectRunPodMediaResult(job.Kind, result)` (`:361`) — would look for `result.Video` and
  fail on the image endpoint's `result.Images`.
- `maxBytes` (`:364`) — would apply the video size cap to a PNG.
- `modelsMediaKind(job.Kind)` passed to `downloadGeneratedMedia` (`:367`).
- `download.Extension`, which decides `.png` vs `.mp4`.

The storage key is `omnichat/generated/%d/%s%s` with `job.ID` (`:406`), so the two phases
differ only by that extension. That is sufficient — but it is load-bearing, not incidental:
do not "simplify" the extension out of the key.

The orphan-cleanup `defer` (`:410`) becomes function-scoped inside `persistGeneratedMedia`,
firing when `commit` returns an error. The billing capture (`:452`) stays in `process` and
runs only after Phase B commits.

### 3c. The two phases

- **Phase A** builds the image spec — the exact same `buildImageSpec` path, with the same
  scene, identity profile, references and prompt that a Scene photo would get. Split
  `BuildRunPodGenerationSpec` into `buildImageSpec` / `buildVideoSpec` so both callers share
  one implementation.
- The resulting still is downloaded, scanned and stored through `persistGeneratedMedia`
  with `kind = image` and `commit = AttachIntermediateAsset`, saved as a gallery asset, and
  recorded on the job as `source_asset_id`.
- Between phases, re-check cancellation (`stopIfGenerationCancelled`) before submitting
  Phase B. A user who cancels during the still render must not be charged for a clip.
- **Phase B** builds the video spec with `mode: image_to_video` and `source_image_url`
  minted from that asset, and runs it. Its output completes the job as today.
- `mode: image_to_video` requests from the Create page skip Phase A — they already carry
  `source_asset_id`.
- Delete the dead `"resolution": "1080p"` field from the video input (`:813`) — confirmed
  zero references anywhere under `infra/runpod/omnichat_worker/`.

**Signing the Phase A URL.** Do not write a second signing path. The tail of `resolveInputs`
(`:581`–`:598`) already loads the asset, checks `kind == image` and `scan_status == clean`,
signs for 20 minutes and validates against `safeProviderReferenceURL`. Extract it as:

```go
func (h *OmniChatGenerationHandler) resolveSourceImageURL(ctx context.Context, ownerUserID int, assetID uuid.UUID) (string, error)
```

`resolveInputs` calls it when `job.SourceAssetID != nil`; Phase A calls it directly with the
asset it just created. A resumed Phase B gets the URL from `resolveInputs` as before,
because `source_asset_id` is on the row by then. One implementation, one set of checks.

### 3d. Resume, without a new column

Add to the repository:

```go
func (r *OmniChatMediaRepository) StartSecondPhase(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error)
```

```sql
UPDATE omnichat_generation_jobs
SET provider_job_id = NULLIF($2, ''), last_activity_at = NOW()
WHERE id = $1 AND status = 'running'
  AND source_asset_id IS NOT NULL
  AND provider_job_id IS NULL
```

`AttachIntermediateAsset` (Phase 4) sets `provider_job_id = NULL` in the same transaction
that sets `source_asset_id`. That makes the state machine unambiguous from the row alone,
with no new column:

| `source_asset_id` | `provider_job_id` | Meaning |
| --- | --- | --- |
| `NULL` | set | Phase A in flight — resume polling it |
| set | `NULL` | Phase A landed, Phase B not submitted — submit Phase B |
| set | set | Phase B in flight — resume polling it |

The `provider_job_id IS NULL` predicate makes `StartSecondPhase` a compare-and-swap: if a
concurrent worker won, it returns false and this worker cancels its duplicate submission
via `cancelSubmittedGeneration`, exactly as the `MarkGenerationJobRunning` false path does
today. Phase A is never re-billed or re-rendered after it lands.

The one remaining window — Phase A's provider render completes but the process dies before
`AttachIntermediateAsset` commits — re-renders the still on retry. That costs RunPod time,
not credits, and closing it would require a column. Accepted.

### 3e. Timeout

`RUNPOD_REQUEST_TIMEOUT_SECONDS` defaults to 900 (`config.go:399`) and bounds the whole of
`process`. Two phases now share one budget: an SDXL still plus a 121-frame Wan 5B render
does not fit. Raise the default to 1800 and set the endpoint timeout to match in Phase 1.
If Phase 5 forces the move to `I2V-A14B`, this is the knob to raise again.

### 3f. Motion prompt

The still already carries appearance; repeating it in the video prompt only invites drift.
Add `buildOmniChatVideoMotionPrompt` beside `buildOmniChatEffectivePrompt` in
`omnichat_generation.go`, composing a short motion description from `scene.Activity`,
`scene.Pose`, `scene.Mood` and `scene.CameraDirection`. For create mode, the user's `/video`
text is the motion prompt as written.

## Phase 4 — Migration and repository: two artifacts per job

`omnichat_media_assets.generation_job_id` is `NOT NULL UNIQUE`
(`137_omnichat_media_generation.up.sql:60`), so a job cannot own both a still and a clip.

New migration pair: drop the unique constraint, replace it with a plain index. Nothing
queries by that column (verified — only the insert at `omnichat_media.go:552` and the select
list at `:612` reference it), and `omnichat_generation_jobs.output_asset_id` already
identifies the final artifact.

**The down migration must handle its own failure mode.** Re-adding `UNIQUE` errors on any
job that owns both a still and a clip. Delete the intermediate assets first in the down
migration — the rows reachable as `omnichat_media_assets.id = generation_jobs.source_asset_id`
where that job also has a different `output_asset_id` — or declare the migration
forward-only in the file header. A down that fails halfway in production is worse than one
that refuses up front.

### Repository work in `omnichat_media.go`

The intermediate still cannot reuse `CompleteGenerationJob` (`:460`), which reads `kind`
from the job row (`:483`), posts a chat message (`:563`–`:586`), and marks the job
succeeded (`:592`). Add:

```go
func (r *OmniChatMediaRepository) AttachIntermediateAsset(ctx context.Context, jobID uuid.UUID, media *MediaFile, asset *OmniChatMediaAsset, kind OmniChatMediaKind, prompt string, freeTierBytes, proTierBytes int64, provenance OmniChatGenerationProvenance) error
```

It inserts the `media_files` row and the `omnichat_media_assets` row with an **explicit
kind and prompt** — the job row's `kind` is `video` and its `prompt` is the video prompt,
neither of which describes the still — sets `source_asset_id` on the job, clears
`provider_job_id` (see 3d), records Phase A provenance (below), and leaves `status =
running`. No chat message: a photo message for a video request is noise.

Factor the shared body of `CompleteGenerationJob` — the `FOR UPDATE` job read, the owner
check, the quota check, and the two inserts — into one unexported tx helper so there is a
single implementation, parameterised by the kind and prompt the caller supplies.

### Provenance must merge, not overwrite

`provider_metadata` is a single JSONB column on the job row, and `CompleteGenerationJob`
overwrites it wholesale (`:596`). Phase B would erase Phase A's `worker_build` — which is
exactly the field the verification plan uses to confirm which image rendered each stage.

`provider_metadata` is `JSONB NOT NULL DEFAULT '{}'` with an object-typeof check
(`137_...up.sql:38`), so:

- `AttachIntermediateAsset` writes `provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || jsonb_build_object('source', $n)` with Phase A's `{worker_build, actual_prompt}`.
- `CompleteGenerationJob` changes its `SET provider_metadata = $4` to
  `SET provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $4`, so Phase B's
  keys land alongside `source` rather than replacing it.

Single-phase jobs are unaffected: merging into `{}` yields the same object they write today.

## Phase 5 — NSFW

Two separable things, and only one of them is new work.

Explicit content in the frame is already solved by the two-phase design: the still comes
from your NSFW SDXL checkpoint, and the diffusers Wan pipelines carry no safety checker, so
nothing filters an explicit initial frame. What base Wan lacks is explicit motion
vocabulary.

I have not verified a specific, reputable, diffusers-loadable NSFW LoRA for TI2V-5B — the
community NSFW work I can find is ComfyUI workflows targeting the 14B I2V-A14B
high/low-noise pair. So: ship the LoRA hook from Phase 2, validate base 5B motion on an
explicit still first, then evaluate candidates against what is actually missing. If 5B
motion proves inadequate, the fallback is `Wan2.2-I2V-A14B` on a larger GPU tier, which
needs another raise of the Phase 3e timeout.

The tier gate collapses to the image tier split already scoped, because Phase A is the only
place explicit pixels are produced:

- `allow_nsfw` column on `omnichat_generation_jobs`, written at creation — the queue handler
  has no user context and must read the decision off the row.
- `RunPodImageEndpointIDSFW` beside `RunPodImageEndpointID` in `config.go:93`, consumed only
  in `buildImageSpec`. This depends on the 3c split and must land after it.
- Inject `OmniChatPlanReader` into `OmniChatGenerationService` mirroring the existing
  `SetBilling` wiring; both entry points funnel through `CreateGeneration`.
- Add the missing `PlanPremium` constant — `"premium"` is a bare literal in 8+ places today,
  including the quota check at `omnichat_media.go:506`.

One mechanism covers images and videos. No separate NSFW video endpoint is needed.

## Verification

- `cd backend && go test ./internal/services ./internal/models ./internal/queue ./internal/handlers -count=1`
- `cd infra/runpod && python3 -m unittest discover -p 'test_*.py' -q && python3 -m pyflakes omnichat_worker`
  (pyflakes, not ruff — ruff does not catch duplicate `def`)
- `cd frontend && npx tsc --noEmit && git diff --check`
- Migration up/down against a scratch database, **including a down run against a database
  that has a two-asset job** — that is the case the down migration has to survive.
- Resume test with no GPU: unit-test `process` against a fake provider that dies after
  Phase A commits, and assert the retry submits Phase B rather than re-rendering the still
  or polling Phase A's id.
- No-GPU contract check:
  `go run ./cmd/omnichat_prompt_preview -conversation N -owner N -kind video -json | python3 -m omnichat_worker.preview`
  — confirm the Phase B input carries `mode: image_to_video`, a `source_image_url`, and a
  motion-only prompt.
- End to end: "Scene video" on a live conversation. Confirm `provider_metadata` carries both
  `source.worker_build` and the Phase B build, that the intermediate still lands in the
  gallery and looks right, and that the clip preserves the still's face and setting. Then
  `/video` with an unrelated request to confirm scene state does not bleed in.
- Judge the clip on three axes separately, because they have different fixes: likeness
  (Phase A — image pipeline), scene fidelity (scene-state extractor), motion quality
  (Phase B — Wan model/LoRA).

## As built

Phases 2–5 are implemented. Phase 1 is not, and nothing about video works until
it is — the runbook for it is in `infra/runpod/README.md` under "Bringing the
video endpoint back up".

Decisions taken during implementation that this plan did not specify:

- **The video input was narrowed further than planned.** It carries no
  `aspect_ratio`, no `reference_image_urls`, no identity fields and no `scene`.
  Each was unused by the new worker, and the `resolution: "1080p"` field this
  plan deletes is precisely what an unread field turns into. `runPodVideoAspectRatio`
  went with them.
- **`mode` on the video input is always `image_to_video`**, which is what makes
  `contract.py`'s existing "source_image_url is required" check the enforcement
  point.
- **The video worker now returns `actual_prompt`**, as the image worker already
  did, so the motion prompt is recoverable from provenance.
- **`NormalizeOmniChatGenerationRequest` clears `SourceAssetID` outside
  `image_to_video`.** Without it a client could set the field on a scene video
  and make the queue skip an image phase it never ran, which is the one thing
  that would make the column-free resume signal ambiguous.
- **A running job that is not a two-phase video and has lost its provider id
  still fails permanently.** The animation-phase branch is guarded on the full
  condition rather than on the empty id alone, so a corrupt row is refunded
  instead of silently left running.
- **`downloadGeneratedMedia` is injectable on the handler.** The real one
  refuses loopback addresses by design, so an in-process test server cannot
  stand in for the provider's object store, and the two-phase flow would
  otherwise be untestable end to end.
- **`omnichat_prompt_preview` gained `-kind`**, prints both phases for a video,
  and `omnichat_worker.preview` renders video payloads as motion rather than
  running them through the image prompt builder it would never use.
- **NSFW is gated to premium** (plus persisted administrators), per the product
  decision taken during implementation. `RUNPOD_IMAGE_ENDPOINT_ID_NSFW` is
  optional and falls back to the standard endpoint, so nothing changes until a
  second endpoint exists.

## Out of scope

- LoRA as a paid identity add-on — still deferred.
- `Wan2.2-Animate-14B` (pose-driven video). Interesting later; needs preprocessed pose video
  that diffusers does not yet generate.
- Frontend changes beyond whatever copy is needed if the intermediate still surfaces
  confusingly in the gallery.
