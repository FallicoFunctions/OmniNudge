# OmniChat RunPod workers

These are the GPU workers consumed by the server-side RunPod adapter. The API
and queue send the JSON contract in `docs/OMNICHAT_EXPANSION.md`; the workers
return signed HTTPS object URLs and never return local paths or data URLs.

## Checks

Run before building. The worker package has no compiler, so static analysis is
the only thing standing between an editing mistake and a silently wrong image:

```bash
cd infra/runpod
python -m pyflakes omnichat_worker/*.py
python -m unittest omnichat_worker.test_contract omnichat_worker.test_generators omnichat_worker.test_storage
```

**pyflakes specifically, not ruff.** Python permits redefining a function, so a
duplicate `def` silently shadows the earlier one: the edited version still
compiles and still passes tests, while the stale version is what actually runs.
pyflakes reports it as `redefinition of unused '<name>'`; ruff's `F811` does not
flag this case. Three such duplicates were introduced while building the
identity pipeline, and each presented as "the fix had no effect". The unittest
suite runs pyflakes too, so `python -m unittest` alone is sufficient.

## Build

Run each build from the repository root. The repository-root context is also
what RunPod's GitHub integration uses when it builds a Dockerfile by path:

```bash
TAG=v39
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  --build-arg OMNICHAT_WORKER_BUILD="$TAG" \
  --output type=image,name=docker.io/nickf579/omnichat-image-worker:"$TAG",oci-mediatypes=false,push=true \
  -f infra/runpod/image-worker/Dockerfile .
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  --build-arg OMNICHAT_WORKER_BUILD="$TAG" \
  --output type=image,name=docker.io/nickf579/omnichat-video-worker:"$TAG",oci-mediatypes=false,push=true \
  -f infra/runpod/video-worker/Dockerfile .
```

`--provenance=false --sbom=false` and `oci-mediatypes=false` are **required**, not stylistic.
By default `buildx` attaches a provenance attestation, which turns the push into
an OCI image index whose second entry reports platform `unknown/unknown`.
RunPod cannot pull that layout, and it fails silently: the worker sits in
`initializing` forever with `unhealthy: 0` and no error anywhere. Verify after
pushing — the MediaType must be `application/vnd.docker.distribution.manifest.v2+json`,
not `application/vnd.oci.image.index.v1+json`:

```bash
docker buildx imagetools inspect nickf579/omnichat-image-worker:v39
```

The explicit platform flag is required when building on Apple Silicon: RunPod
workers use Linux/amd64 even though Docker Desktop may default to arm64. A tag
pushed without it fails at pull time with
`no matching manifest for linux/amd64 in the manifest list entries`, and RunPod
marks the endpoint's workers unhealthy rather than falling back.

`--build-arg OMNICHAT_WORKER_BUILD` stamps the tag into the image. The worker
returns it as `worker_build` on every job, the API logs it and stores it in
`omnichat_generation_jobs.provider_metadata`, and it is the only reliable way
to tell which image actually rendered an asset. Pass the same value as the tag;
omitting it reports `unknown`.

Pushing a tag does **not** update a running endpoint. The RunPod template must
be edited to reference the exact new tag and saved to redeploy workers.

The RunPod endpoint environment must provide `OMNICHAT_OUTPUT_BUCKET`, AWS/S3
credentials, and (when using a private CDN) `OMNICHAT_OUTPUT_PUBLIC_BASE_URL`.
For Cloudflare R2, set `S3_ENDPOINT` to the R2 S3 API origin on both endpoints;
the generated presigned URLs then use that origin. When the S3 client uses
virtual-hosted addressing, include both the R2 origin and the bucket-qualified
hostname (`<bucket>.<r2-account>.r2.cloudflarestorage.com`) in
`OMNICHAT_INPUT_HOSTS`. Set it to every exact HTTPS hostname used for signed
persona/source image URLs, including the CDN hostname when that is the signed
origin. The default is `storage.googleapis.com`. Signed query strings are
accepted, but redirects and private-network resolutions are rejected.

The API's `S3_ENDPOINT` and `CLOUDFRONT_URL` hosts are automatically added to
its own download allow-list. They still must be copied into each RunPod
endpoint's `OMNICHAT_INPUT_HOSTS` setting because the worker validates URLs
before it downloads them.

Each endpoint should set the following worker-only variables in RunPod's
environment settings (never in the API's browser-facing configuration):

| Variable | Image endpoint | Video endpoint | Purpose |
| --- | --- | --- | --- |
| `OMNICHAT_OUTPUT_BUCKET` | required | required | Private S3-compatible bucket for completed files |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | required | required | Least-privilege bucket write/read credentials |
| `AWS_REGION` / `S3_ENDPOINT` | optional | optional | Object-store region and S3-compatible endpoint |
| `OMNICHAT_OUTPUT_PREFIX` | optional | optional | Safe object-key prefix; defaults to `omnichat` |
| `OMNICHAT_OUTPUT_PUBLIC_BASE_URL` | optional | optional | HTTPS CDN/origin that signs the uploaded object |
| `OMNICHAT_OUTPUT_URL_TTL_SECONDS` | optional | optional | Presigned URL lifetime, bounded to 60–3600 seconds |
| `OMNICHAT_INPUT_HOSTS` | required | required | Exact HTTPS hosts workers may fetch |
| `HF_TOKEN` | optional | optional | Read-only Hugging Face token when a configured model requires gated-model access |
| `OMNICHAT_WORKER_BUILD` | build-arg | build-arg | Image tag stamped at build time and returned as `worker_build` on every job |
| `OMNICHAT_IMAGE_MODEL_ID` | required | — | Diffusers image model identifier; defaults to `SG161222/RealVisXL_V5.0` |
| `OMNICHAT_POSE_CONTROL_ENABLED` | optional | — | `1` (default) enables the OpenPose layout pass for contextual physical scenes |
| `OMNICHAT_CONTROLNET_MODEL_ID` | optional | — | OpenPose SDXL ControlNet; defaults to `thibaud/controlnet-openpose-sdxl-1.0` |
| `OMNICHAT_POSE_CONTROL_SCALE` | optional | — | ControlNet strength, bounded to `0`–`2`; defaults to `0.85` |
| `OMNICHAT_IP_ADAPTER_MODEL_ID` | required | — | Identity adapter repository; defaults to `h94/IP-Adapter` |
| `OMNICHAT_IP_ADAPTER_SUBFOLDER` / `OMNICHAT_IP_ADAPTER_WEIGHT` | optional | — | Adapter files; defaults to `sdxl_models` / `ip-adapter-plus-face_sdxl_vit-h.safetensors` |
| `OMNICHAT_IP_ADAPTER_IMAGE_ENCODER` | optional | — | CLIP encoder folder; defaults to `models/image_encoder`. Every `*_vit-h` adapter needs the ViT-H encoder at the repo root — pairing one with `sdxl_models/image_encoder` does not error, it silently weakens identity |
| `OMNICHAT_IDENTITY_CROP_RATIO` | optional | — | Fraction of the reference's short edge kept before identity conditioning; defaults to `0.48`. The plus-face adapter wants a face crop, not a half-body portrait |
| `OMNICHAT_FACE_DETECT` | optional | — | `1` (default) frames the identity crop on the detected face. `0` falls back to fixed geometry. No face found is normal (anime, objects) and always falls back |
| `OMNICHAT_FACE_CROP_MARGIN` | optional | — | How much context around the detected face to keep; defaults to `2.1` |
| `OMNICHAT_BODY_ADAPTER` | optional | — | `1` (default) also loads `ip-adapter-plus` so body shape comes from the references. `0` runs face-only. The face adapter carries no body information, so figure drifts between generations without this |
| `OMNICHAT_BODY_ADAPTER_SCALE` | optional | — | Strength of the body adapter; defaults to `0.3`. Deliberately far below the face scale — it also carries clothing, pose and background, which fight the scene prompt. Raise cautiously |
| `OMNICHAT_BODY_ADAPTER_WEIGHT` | optional | — | Body adapter file; defaults to `ip-adapter-plus_sdxl_vit-h.safetensors`. Must share the ViT-H encoder with the face adapter |
| `OMNICHAT_FACE_MIN_CROP_PX` | optional | — | Minimum native face-crop size for a reference to feed the face adapter; defaults to `224`, the CLIP encoder input size. Larger crops are downscaled and lose nothing, so this rejects only faces that would have to be upscaled |
| `OMNICHAT_PORTRAIT_FACE_RATIO` | optional | — | Face-to-frame-height ratio above which a reference counts as a close portrait and is kept out of the body adapter; defaults to `0.30`. A portrait carries no proportions and would dilute them |
| `OMNICHAT_IDENTITY_ANCHOR_REPEAT` | optional | — | How many times the persona avatar is repeated among the face references; defaults to `2`, so curated extras refine identity instead of averaging it away |
| `OMNICHAT_LONG_PROMPT` | optional | — | `1` (default) encodes prompts in 75-token chunks and concatenates the embeddings, lifting CLIP's 77-token ceiling. Set `0` to fall back to a single truncated window |
| `OMNICHAT_PROMPT_MAX_WORDS` | optional | — | Prompt budget in words; defaults to `150` with chunking and `58` without. The lower value is not a preference — beyond it CLIP silently discards the tail |
| `OMNICHAT_IDENTITY_FALLBACK_IMAGE2IMAGE` | optional | — | Set `1` only as an explicit migration fallback; unset/`0` fails clearly if IP-Adapter cannot load |
| `OMNICHAT_LORA_MODEL_ALLOWLIST` | required when using LoRA | — | Comma-separated Hugging Face LoRA IDs approved for platform-owned personas |
| `OMNICHAT_VIDEO_IMAGE_MODEL_ID` | — | optional | Diffusers image-to-video model; defaults to `Wan-AI/Wan2.2-TI2V-5B-Diffusers` |
| `OMNICHAT_VIDEO_FPS` | — | optional | Sampling and export frame rate, bounded to `8`–`60`; defaults to `24`, the rate Wan 2.2 was trained at. One value drives both, because exporting at a different rate only speeds the clip up or slows it down |
| `OMNICHAT_VIDEO_MAX_FRAMES` | — | optional | Frame ceiling, bounded to `5`–`241`; defaults to `121`. Snapped down to a legal `4k+1` length |
| `OMNICHAT_VIDEO_MAX_AREA` | — | optional | Pixel budget for one frame; defaults to `720*1280`. The frame's shape comes from the source still, this only bounds its size |
| `OMNICHAT_VIDEO_STEPS` | — | optional | Sampling steps, bounded to `1`–`100`; defaults to `50` per the model card. This is the first knob to lower if renders approach the endpoint timeout |
| `OMNICHAT_VIDEO_GUIDANCE_SCALE` | — | optional | Defaults to `5.0`, the published Wan 2.2 value |
| `OMNICHAT_VIDEO_CPU_OFFLOAD` | — | optional | `auto` (default), `1`, or `0`. `enable_model_cpu_offload` streams the transformer, text encoder and VAE across PCIe on every denoising step — necessary on a card that cannot hold the pipeline, roughly a 2–3× tax on one that can. `auto` keeps the pipeline resident above the threshold below |
| `OMNICHAT_VIDEO_RESIDENT_MIN_VRAM_GB` | — | optional | VRAM at or above which `auto` skips offloading; defaults to `40`. TI2V-5B in bf16 (~10 GB) plus the UMT5 encoder (~11 GB) plus a float32 VAE is roughly 25 GB resident, which a 48 GB A40 or A6000 holds outright |
| `OMNICHAT_VIDEO_LORA_MODEL_ID` / `_WEIGHT_NAME` / `_SCALE` | — | optional | Operator-configured motion LoRA, applied at load. Unlike the identity LoRA this comes from the endpoint environment rather than a request, so it needs no allowlist — nothing a browser sends can reach it |

Use a separate object-store credential per endpoint and grant only the bucket
operations required by the worker. The API still validates and copies every
result into application-owned private storage before exposing it to a user.

The worker images are intentionally separate so an image endpoint never loads
the video pipeline (and vice versa). Persist model caches on a RunPod network
volume when available; the first cold start otherwise downloads the configured
model into the container cache.

Both Dockerfiles use PyTorch 2.7.1 with CUDA 12.8. RunPod's 24 GB serverless
tier can allocate a Blackwell MIG slice, which requires this newer runtime;
configure the endpoint's allowed CUDA version to `12.8` to match the image.

The image endpoint should allocate at least 50 GB of container disk for the
configured SDXL checkpoint plus the identity adapter and its CLIP encoder.
Model downloads
use temporary space in addition to the final cache; a small default container
disk can fail with `No space left on device` before the first image is generated.

The video endpoint should also allocate at least 50 GB of container disk: the
Wan checkpoint and its UMT5 text encoder are substantially larger than the
image model and are downloaded into the worker cache on first use.

Set the video endpoint's execution timeout to at least 1800 seconds and keep
`RUNPOD_REQUEST_TIMEOUT_SECONDS` on the API at or above it. A 121-frame render
at 50 steps does not finish inside the 900 seconds that was enough for a single
image, and a video job now spends part of that budget on its still as well.

## Two-phase video

A video is not generated from a prompt. Identity conditioning lives entirely in
the image pipeline, so a clip sampled from text alone is a different person in a
different room. The queue therefore renders the scene as a still through the
**image** endpoint first, stores it as a real gallery asset, and passes its
signed URL to the **video** endpoint as `source_image_url`.

Consequences worth knowing before changing either worker:

- The video worker has no text-to-video path at all. A `kind: video` request
  without `mode: image_to_video` and a source URL is a contract error, not a
  degraded render. The old fallback silently animated the persona's reference
  photo, which put her in that photo's setting instead of the current scene.
- The video input carries no references, no identity fields, no scene object and
  no aspect ratio. All of that is already in the pixels of the still, and the
  frame size is derived from the still's own dimensions.
- The video prompt describes motion only. Repeating appearance would give the
  model something to contradict.
- The video endpoint's `OMNICHAT_INPUT_HOSTS` must include the host that signs
  generated-asset URLs, not just persona references — the still it animates is
  fetched from the application's own bucket.
- Both stages stamp `worker_build`. The clip's lands in
  `provider_metadata.worker_build` and the still's in
  `provider_metadata.source.worker_build`, so an asset can be attributed to the
  two images that actually produced it.

`Wan-AI/Wan2.2-TI2V-5B-Diffusers` is loaded through `WanImageToVideoPipeline`
even though its model card demonstrates `WanPipeline`: the 5B model has no CLIP
vision encoder, and `image_processor`/`image_encoder` are optional on that
pipeline class from diffusers 0.35 onward. If a future diffusers release breaks
that, the symptom is a load failure rather than a bad render, and the fallback
is to point `OMNICHAT_VIDEO_IMAGE_MODEL_ID` at `Wan-AI/Wan2.2-I2V-A14B-Diffusers`
on a larger GPU tier with a correspondingly longer timeout.

## Bringing the video endpoint back up

**Done on 2026-08-08.** The endpoint now runs template `omnichat-video-wan22`
(`95d2tt9dpk`) on `nickf579/omnichat-video-worker:v52`, with a 60 GB container
disk, a 1800 s execution timeout, and `workersMin: 0`. A worker was observed
reaching `ready`, so the image pulls and the container starts. The steps below
are kept as the procedure for the next rebuild.

Before that, `omnichat-video` pointed at template `6l94ogw9ch`, which was
deleted and returned 404. Only `nickf579/omnichat-video-worker:v1` and `:v3`
had ever been pushed, and both predate the two-phase worker. Nothing about video
works until the steps below are done, and no amount of backend testing will
surface that — the job fails at submission.

**0. Apply pending database migrations.** `backend/.env` sets
`DB_AUTO_MIGRATE=false`, so a schema change this feature depends on is *not*
applied by starting the server. A missing column surfaces in the browser as
"Media generation is temporarily unavailable" — a generic 503 that looks like a
GPU problem and is not — and it breaks `/photo` as well as video:

```bash
cd backend && go run ./cmd/migrate -action=dry-run && go run ./cmd/migrate -action=up
```

**1. Build and push the worker.** From the repository root, with the same tag as
the image worker so the two stay legible together:

```bash
TAG=v52 && docker buildx build --platform linux/amd64 --provenance=false --sbom=false --build-arg OMNICHAT_WORKER_BUILD="$TAG" --output type=image,name=docker.io/nickf579/omnichat-video-worker:"$TAG",oci-mediatypes=false,push=true -f infra/runpod/video-worker/Dockerfile .
```

The buildx flags are load-bearing; see the Build section above for what happens
without them. Verify the manifest type before going further:

```bash
docker buildx imagetools inspect nickf579/omnichat-video-worker:v52
```

`MediaType` must be `application/vnd.docker.distribution.manifest.v2+json`. An
`oci.image.index.v1+json` will pull-fail silently and leave workers stuck in
`initializing` with no error anywhere.

**2. Create a fresh template.** The old one is gone, so this is a new template,
not an edit:

- Container image: the exact tag pushed above.
- Container disk: **at least 50 GB**; 60 GB is what is deployed. Wan 2.2
  TI2V-5B plus its UMT5 text encoder is a ~30 GB download, and Hugging Face
  needs scratch space on top of the final cache.
- CUDA version: **12.8**, matching the PyTorch base image.
- Execution timeout: **at least 1800 seconds**.
- Environment: copy the R2/S3 block from the image template `7g36zlzlk5`
  (`OMNICHAT_OUTPUT_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `S3_ENDPOINT`, `OMNICHAT_OUTPUT_PUBLIC_BASE_URL` if set).
- `OMNICHAT_INPUT_HOSTS`: must include the host that signs **generated asset**
  URLs, not only persona references. The still this worker animates comes from
  the application's own bucket, and a missing host here fails every clip at
  download with "reference image URL is not configured".
- No `OMNICHAT_VIDEO_*` overrides are needed; the defaults are the published
  Wan 2.2 values.

**3. Repoint the endpoint.** Set `omnichat-video` to the new template and set
the execution timeout to at least 1800 s.

Warm workers are `workersMin`, not `workersStandby`. The REST API's
`EndpointUpdateInput` has no `workersStandby` key and rejects the whole request
if you send one; the `workersStandby` that appears in a GET response is a
legacy read-only field and does not mean a worker is being held. Check
`workersMin` (and `/v2/<endpoint>/health`) to find out what is actually
running. On this endpoint `workersMin` was already `0`.

**4. Confirm the backend agrees.** `RUNPOD_VIDEO_ENDPOINT_ID` in `backend/.env`
must match the endpoint.

`backend/.env` is already set to `RUNPOD_REQUEST_TIMEOUT_SECONDS=1800`. It
pinned `900` before, which **overrides** the code default and aborts every clip
part-way through its animation phase — check it after any `.env` merge.

The stale worker-only `OMNICHAT_VIDEO_TEXT_MODEL_ID` and
`OMNICHAT_VIDEO_IMAGE_MODEL_ID` entries were removed from `backend/.env`. The
backend never read them, but they named Wan 2.1 and were the obvious thing to
copy into a video template, which would pin the worker back to the old model.

Restart the local queue worker afterwards; it does not reload `.env` on its own.

### ftfy is a hard dependency of the Wan pipelines

`v51` downloaded every weight, loaded the pipeline, and then died on the first
prompt with `NameError: name 'ftfy' is not defined`, raised from
`diffusers/pipelines/wan/pipeline_wan_i2v.py`. diffusers guards the *import* of
ftfy behind `is_ftfy_available()` but calls `ftfy.fix_text()` unconditionally
inside `prompt_clean()`, so it is required, not optional. It is pinned in
`video-worker/requirements.txt`.

The failure costs a full cold start and model download before it surfaces, so
check the call directly against a built image rather than on a GPU:

```bash
docker run --rm --platform linux/amd64 --entrypoint python \
  nickf579/omnichat-video-worker:v52 \
  -c "from diffusers.pipelines.wan.pipeline_wan_i2v import prompt_clean; print(prompt_clean('test'))"
```

## Persona identity conditioning

Every generation uses the same reference-first path, regardless of whether the
persona is a platform default or user-created. The queue selects the avatar as
the identity anchor and sends it as `reference_image_urls`. The current SDXL
IP-Adapter worker intentionally consumes one tight identity crop: Diffusers
interprets a list as one image per adapter, so a contact sheet or concatenated
gallery would create duplicate people. A future embedding aggregator or LoRA
can safely opt into additional references. The image worker uses IP-Adapter to
preserve identity while the normalized scene prompt controls location,
clothing, pose, and camera; it does not use the reference image as the
composition. Contextual physical scenes additionally receive a deterministic
two-person OpenPose layout through the SDXL ControlNet, so the identity crop
cannot collapse the requested interaction into a standing portrait. Contextual
requests also carry the validated structured scene snapshot separately from the
prose prompt, so recent physical events are not lost when a provider prompt is
compacted.

The optional `omnichat_media` object in a platform-owned persona's
`extensions_json` can enable a trained character LoRA:

```json
{
  "omnichat_media": {
    "identity_mode": "lora",
    "identity_adapter": "ip_adapter",
    "identity_adapter_scale": 0.65,
    "reference_limit": 1,
    "lora_model_id": "your-org/sadie-lora",
    "lora_weight_name": "pytorch_lora_weights.safetensors",
    "lora_scale": 0.8
  }
}
```

LoRA metadata is ignored for user-owned/imported personas, and invalid model or
weight paths fall back to reference conditioning. The worker validates the
same fields and can enforce an operator allowlist with
`OMNICHAT_LORA_MODEL_ALLOWLIST`; no browser request can choose a model path.
The video worker receives none of this: it animates a still the image worker
already conditioned, so identity is settled before it is called.

## Restarting the worker after configuration changes

There are two different workers in this deployment:

1. The local OmniChat queue worker consumes Redis jobs and calls RunPod. Restart
   it after changing `backend/.env` so it reloads endpoint IDs and credentials:

   ```bash
   cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-ai-chat-bot/backend
   go run ./cmd/worker
   ```

   Stop the old process first with `Ctrl-C`. This process needs the backend
   `.env`, Redis, and database access; it does not need the RunPod API key in
   the RunPod endpoint itself.

2. RunPod Serverless workers are managed by the endpoint. After changing an
   endpoint environment variable, save/redeploy that endpoint in RunPod; its
   worker containers are then replaced automatically. A local worker restart
   does not reload RunPod endpoint environment variables.

For the first test, configure the image endpoint with the object-store values
from the backend `.env` (`OMNICHAT_OUTPUT_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION=auto`, and `S3_ENDPOINT`) and redeploy it.
Without those values the request can be accepted by the API but the RunPod job
will fail before it can return an image.

If the configured Hugging Face model is gated, add a read-only `HF_TOKEN` to
that endpoint as well. Keep it in RunPod's environment only; it is not needed
by the OmniChat API or browser.

Build and push both images to a private registry, then create one RunPod
Serverless endpoint per image. Set the resulting endpoint IDs as
`RUNPOD_IMAGE_ENDPOINT_ID` and `RUNPOD_VIDEO_ENDPOINT_ID` in the API and the
background worker. When an image changes, update the endpoint's template to
the exact new image tag and save/redeploy it; pushing a tag alone does not
change an existing endpoint. Verify the template image before testing so an
older worker cannot silently accept a request without identity conditioning.
Do not paste registry passwords, S3 secrets, or RunPod API keys into this
repository.
Model IDs are deployment configuration:

- `OMNICHAT_IMAGE_MODEL_ID` (default `SG161222/RealVisXL_V5.0`; choose a gated
  model only when the endpoint also has a read-only `HF_TOKEN`)
- `OMNICHAT_VIDEO_IMAGE_MODEL_ID` (default `Wan-AI/Wan2.2-TI2V-5B-Diffusers`)

The worker validates all prompt, duration, aspect-ratio, reference-URL, and
seed fields before loading a model. `test_contract.py` runs without CUDA or
model downloads:

```bash
python -m unittest infra.runpod.omnichat_worker.test_contract
```
