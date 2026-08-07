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
| `OMNICHAT_VIDEO_TEXT_MODEL_ID` | — | required | Diffusers text-to-video model identifier |
| `OMNICHAT_VIDEO_IMAGE_MODEL_ID` | — | required | Diffusers image-to-video model identifier |

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
Wan text-to-video and image-to-video checkpoints are substantially larger than
the image model and are downloaded into the worker cache on first use.

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
The video worker uses the first curated reference as its initial frame when a
request is not already image-to-video. Additional references require a model
profile that explicitly supports multi-image identity embeddings.

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

- `OMNICHAT_IMAGE_MODEL_ID` (default `stabilityai/stable-diffusion-xl-base-1.0`; choose a gated
  model only when the endpoint also has a read-only `HF_TOKEN`)
- `OMNICHAT_VIDEO_TEXT_MODEL_ID` (default `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`)
- `OMNICHAT_VIDEO_IMAGE_MODEL_ID` (default `Wan-AI/Wan2.1-I2V-14B-480P-Diffusers`)

The worker validates all prompt, duration, aspect-ratio, reference-URL, and
seed fields before loading a model. `test_contract.py` runs without CUDA or
model downloads:

```bash
python -m unittest infra.runpod.omnichat_worker.test_contract
```
