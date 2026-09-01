# OmniChat Media, Social, Groups, and Calls

This document is the production and maintenance guide for OmniChat's generative media, Explore, mixed group chat, character voice, and call systems.

## Launch status and follow-on roadmap

The current OmniChat and OmniRave work is targeted at an initial go-live. The OmniAI
short-video feed, AI Nursery live video, and expanded live OmniAI video-call work are
post-launch additions and are not first-go-live requirements. See the dedicated
[post-launch OmniAI video and social design](superpowers/specs/2026-08-31-omnichat-post-launch-omniai-video-social-design.md).

The current LiveKit/avatar-call architecture supports provider-compatible live
video calls. The 18+ video-call experience is delayed because current providers
specifically block nudity; do not treat the existing call path as support for that
mode. A future self-hosted or purpose-built option requires separate legal,
consent, age-assurance, moderation, abuse-prevention, and operational review.

## Product behavior

- A direct conversation can request the current scene as an image or video from the composer controls, or can start a message with `/photo` or `/video` followed by a description of the character or scene. Slash commands are persisted as user turns, bypass chat completion, and queue the same generation/gallery pipeline used by Create. Contextual generation uses the server-owned recent transcript and persisted scene state, not a client-authored transcript.
- The Create workspace generates character-consistent images and videos outside chat. Successful results are stored privately in the user's gallery automatically.
- A gallery owner can publish a creation to Explore. Conversation owners can publish an immutable snapshot. Other users can like, comment, bookmark, follow, share, report, or continue a shared chat in a private conversation of their own.
- After go-live, OmniAI-authored short videos may be published into a TikTok-style vertical feed using the same profile, media, publication, moderation, and reporting foundations.
- After go-live, the AI Nursery may expose a live or continuously generated video surface. It is a video-streaming experience and does not require OmniRave 3D models or Blender.
- OmniChat groups can contain human members and AI personas. Up to three explicitly selected or mentioned personas answer a turn; model calls run concurrently and messages are persisted in deterministic order.
- Every character receives a stable browser voice profile automatically. A character owner can select one of 12 curated local Voicebox/Kokoro presets; higher-fidelity voice processing runs on demand through the GPU worker.
- Assistant messages support read-aloud. Voice calls use the same persisted conversation, browser speech recognition where available, typed fallback input, and character speech. Video calls open a private, short-lived self-hosted LiveKit room and start an on-demand avatar worker so the character can see, hear, respond, gesture, and lip-sync in real time. Call transcripts are not copied into a separate OmniChat recording. The expanded post-launch call experience remains provider-constrained for 18+ content.

## Runtime architecture

OpenRouter remains the chat model, so ordinary character conversations do not start a GPU worker. Voicebox runs the default read-aloud path on the existing CPU server. GPU capacity is reserved for media generation, higher-fidelity voice processing, and live avatar rendering.

Image and video work is asynchronous:

1. The API authenticates every conversation, message, persona, and source-asset reference.
2. It normalizes the prompt and stores a private generation job.
3. An opaque job ID is queued in Redis; prompts and storage paths are not placed in the queue payload.
4. The worker invokes the configured RunPod image or video endpoint, polls the job status, validates the returned image/MP4 structure, enforces byte and dimension limits, scans the downloaded file, and writes it to application-owned storage.
5. The database transaction enforces storage quota, creates the gallery asset, optionally attaches it to the direct chat, and marks the job complete.

The frontend polls the owner-scoped job endpoint. Leaving the Create page does not cancel a queued job.

RunPod image and video endpoints use scale-to-zero workers. The backend starts a worker through the RunPod API when a job is submitted and the worker shuts down after its idle timeout. Live avatar calls use a short-lived GPU Pod started through the RunPod GraphQL API when the call begins and terminated when the call ends; LiveKit remains on the existing CPU server for room signaling and WebRTC transport.

The RunPod adapter covers asynchronous image/video endpoints and the
`liveavatar` service covers the on-demand avatar Pod lifecycle. The browser
receives only a short-lived LiveKit participant token. The LiveKit signing
secret, RunPod API key, and model credentials never reach the browser or Pod.

### RunPod media-worker contract

The image and video endpoint IDs point to OmniChat-owned RunPod Serverless
worker images. The API sends the same JSON shape to either endpoint; the worker
selects the installed model and writes the finished file to the configured
private object store.

Image input:

```json
{
  "kind": "image",
  "mode": "create|contextual",
  "prompt": "...",
  "negative_prompt": "...",
  "num_images": 1,
  "aspect_ratio": "1:1",
  "output_format": "png",
  "reference_image_urls": ["https://.../persona.png"],
  "scene": {
    "location": "dungeon",
    "activity": "engaged with the user",
    "recent_events": ["the latest physical scene beat"]
  },
  "identity_mode": "reference",
  "identity_adapter": "ip_adapter",
  "identity_adapter_scale": 0.65
}
```

The reference profile is resolved server-side from the persona. The avatar is
the current identity anchor for the reference-only fallback. The SDXL
IP-Adapter integration consumes one image per loaded adapter; sending a gallery
contact sheet would create duplicate subjects, so additional references wait
for a true embedding aggregator or an approved persona LoRA. This is the
permanent baseline for both platform defaults and user-created personas, so a
new default can ship before it has a LoRA. A platform-owned default may later
opt into `identity_mode: "lora"` with an operator-approved model and weight;
user-owned/imported persona metadata can never select model weights. The image
worker uses IP-Adapter for identity while the scene prompt controls environment
and pose. The structured `scene` snapshot is sent separately from the prose
prompt so recent physical events and clothing/pose fields are not lost during
prompt compaction.

Video is rendered in two phases, because identity conditioning exists only in
the image pipeline. The queue first sends the scene to the **image** endpoint
with the same references, identity profile, scene snapshot and prompt a Scene
photo would get; that still is stored as a real gallery asset and recorded on
the job as `source_asset_id`. Its signed URL is then sent to the **video**
endpoint as `source_image_url`. A Create-page `image_to_video` request already
carries a source asset and skips the first phase.

Video input therefore uses `kind: "video"`, `mode: "image_to_video"`,
`duration_seconds`, `source_image_url`, and a motion-only `prompt`. It carries
no references, no identity fields, no `scene` object and no `aspect_ratio`: the
still already fixes appearance and setting, and the frame size is derived from
the still's own dimensions. There is no text-to-video path — a video request
without a source is a contract error rather than a degraded render.

A two-phase job records both worker builds:
`provider_metadata.worker_build` is the clip's and
`provider_metadata.source.worker_build` is the still's.
The worker must return a RunPod `COMPLETED` output in this shape (an
image-only worker may return `image` or a single URL instead):

```json
{
  "images": [{
    "url": "https://configured-output-host/omnichat/job.png",
    "content_type": "image/png",
    "width": 1024,
    "height": 1024
  }],
  "video": {
    "url": "https://configured-output-host/omnichat/job.mp4",
    "content_type": "video/mp4",
    "duration": 5
  }
}
```

The endpoint must return signed, short-lived HTTPS object URLs on a hostname
listed in `RUNPOD_OUTPUT_HOSTS` (or `storage.googleapis.com`). When the API
uses an HTTPS `S3_ENDPOINT` or `CLOUDFRONT_URL`, its hostname is added to the
API-side allow-list automatically; keep `RUNPOD_OUTPUT_HOSTS` explicit when
the worker writes to a separate output origin. OmniChat
downloads and validates the bytes immediately, then stores the private copy;
RunPod workers must not return local filesystem paths or data URLs. The adapter
also accepts the standard worker variants (`image`, `images`, `video`,
`image_url`, `video_url`, and URL arrays) and normalizes them to this contract
before download validation.

## Required deployment configuration

The API and worker must share PostgreSQL, Redis, and the same storage backend. Production should use S3-compatible storage and ClamAV with fail-closed scanning.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Direct and group AI responses and publication checks |
| `OPENROUTER_MODEL` | Chat model |
| `REDIS_ADDR` / `REDIS_PASSWORD` | Generation queue and distributed rate-limit/cache infrastructure |
| `TRUSTED_PROXIES` | Comma-separated IP/CIDR allowlist for reverse proxies allowed to supply client-IP headers; empty trusts none |
| `OMNICHAT_MEDIA_PROVIDER` | Must be `runpod` for the media queue |
| `RUNPOD_API_KEY` | Server/worker-only RunPod credential |
| `RUNPOD_BASE_URL` | RunPod API base URL; production uses `https://api.runpod.ai/v2` |
| `RUNPOD_IMAGE_ENDPOINT_ID` | RunPod scale-to-zero endpoint for image generation and editing, and for the first phase of every video job |
| `RUNPOD_IMAGE_ENDPOINT_ID_NSFW` | Optional image endpoint for accounts entitled to explicit content. Empty falls back to `RUNPOD_IMAGE_ENDPOINT_ID`. One split covers both media kinds because every explicit pixel is produced by the image phase |
| `RUNPOD_VIDEO_ENDPOINT_ID` | RunPod scale-to-zero endpoint for image-to-video jobs |
| `RUNPOD_REQUEST_TIMEOUT_SECONDS` | Bounds a whole generation job, including both phases of a video. Defaults to `1800`; the RunPod endpoint's own execution timeout should be at least as long |
| `RUNPOD_INPUT_HOSTS` | Comma-separated HTTPS hostnames the GPU workers may fetch approved persona/source images from; signed query strings are allowed. HTTPS storage/CDN and `RUNPOD_WORKER_BACKEND_URL` hosts are added automatically to the API-side list |
| `RUNPOD_OUTPUT_HOSTS` | Comma-separated HTTPS hostnames allowed for worker output downloads; HTTPS `S3_ENDPOINT`/`CLOUDFRONT_URL` hosts are added automatically |
| `OMNICHAT_OUTPUT_BUCKET` (worker only) | Private S3-compatible bucket used by the image/video endpoint containers |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (worker only) | Least-privilege object-store credentials; never place these in the API environment |
| `AWS_REGION` / `S3_ENDPOINT` (worker only) | Object-store region and optional S3-compatible endpoint |
| `OMNICHAT_OUTPUT_PUBLIC_BASE_URL` (worker only) | Optional HTTPS CDN/origin that signs worker output URLs |
| `OMNICHAT_OUTPUT_URL_TTL_SECONDS` (worker only) | Presigned output URL lifetime, bounded by the worker to 60–3600 seconds |
| `HF_TOKEN` (worker only) | Optional read-only Hugging Face credential for gated worker models |
| `RUNPOD_POD_API_URL` | RunPod GraphQL URL used for on-demand avatar Pods |
| `RUNPOD_NETWORK_VOLUME_ID` | Reserved for persistent model storage used by GPU call/media workers |
| `RUNPOD_AVATAR_IMAGE` | Immutable container image for the LiveKit avatar worker |
| `RUNPOD_AVATAR_GPU_TYPE_ID` | RunPod GPU type used for avatar calls |
| `RUNPOD_AVATAR_GPU_COUNT` | Number of GPUs assigned to an avatar Pod |
| `RUNPOD_AVATAR_CONTAINER_DISK_GB` / `RUNPOD_AVATAR_VOLUME_GB` | Avatar Pod storage sizes |
| `RUNPOD_AVATAR_VCPU` / `RUNPOD_AVATAR_MEMORY_GB` | Minimum avatar Pod CPU and memory |
| `RUNPOD_AVATAR_VOLUME_MOUNT_PATH` | Network-volume mount path inside the avatar worker |
| `RUNPOD_AVATAR_PORTS` | Optional comma-separated Pod port mappings such as `7880/http,22/tcp` |
| `RUNPOD_WORKER_BACKEND_URL` | Public HTTPS API origin used to resolve `/uploads/...` persona images for RunPod workers |
| `RUNPOD_REQUEST_TIMEOUT_SECONDS` | Upper bound for a GPU job request |
| `RUNPOD_MEDIA_POLL_SECONDS` | Job status polling cadence; bounded by the worker |
| `OMNICHAT_MAX_IMAGE_BYTES` | Maximum accepted generated image size; default 25 MiB |
| `OMNICHAT_MAX_VIDEO_BYTES` | Maximum accepted generated video size; default 200 MiB |
| `VOICEBOX_ENABLED` | Enables free local Voicebox speech; defaults to `true` |
| `VOICEBOX_BASE_URL` | Loopback-only Voicebox API URL; defaults to `http://127.0.0.1:17493` |
| `VOICEBOX_TIMEOUT_SECONDS` | Local generation timeout; defaults to `120` |
| `OMNICHAT_VOICE_CLONING_ENABLED` | Feature gate for user voice uploads; defaults to `false` until voice-profile storage is configured |
| `LIVEKIT_URL` | Self-hosted LiveKit WebSocket origin (`wss://...`) used by API-issued room tokens |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Server-only LiveKit signing credentials |
| `LIVEKIT_ROOM_PREFIX` / `LIVEKIT_TOKEN_TTL_SECONDS` | Room namespace and short participant-token lifetime |
| `VITE_LIVEKIT_HOSTS` (frontend build) | Comma-separated exact WebSocket hostnames accepted by the browser; align it with `LIVEKIT_URL` |

RunPod endpoint containers also require `OMNICHAT_INPUT_HOSTS` plus their
identity variables (`OMNICHAT_IP_ADAPTER_MODEL_ID`,
`OMNICHAT_IP_ADAPTER_SUBFOLDER`, `OMNICHAT_IP_ADAPTER_WEIGHT`, and, when a
LoRA is enabled, `OMNICHAT_LORA_MODEL_ALLOWLIST`) and model-specific worker variables (`OMNICHAT_IMAGE_MODEL_ID`,
`OMNICHAT_VIDEO_TEXT_MODEL_ID`, and `OMNICHAT_VIDEO_IMAGE_MODEL_ID`). Keep
these endpoint-only values in RunPod's environment, not in the API `.env`.
Supply `HF_TOKEN` there only when the selected Hugging Face model is gated.

Voicebox provides the curated local voices while browser voices remain the client fallback. Voicebox must remain on loopback because its local API is not an authenticated multi-tenant boundary. RunPod credentials never reach the browser. If Redis or a GPU endpoint is unavailable, generation fails explicitly and does not create a partial gallery asset. Public captions, comments, and complete shared-chat snapshots are normalized before publication and rechecked inside the publish transaction.

## Principal API surfaces

All routes below are under `/api/v1`. Owner routes require JWT authentication.

| Area | Routes |
| --- | --- |
| Scene and generation | `GET/PUT /omnichat/conversations/:id/scene`, `POST /omnichat/conversations/:id/media-command`, `POST/GET /omnichat/generations`, `GET/DELETE /omnichat/generations/:id` |
| Gallery | `GET /omnichat/gallery`, `GET /omnichat/media/:id`, `GET /omnichat/media/:id/content` |
| Explore reads | `GET /omnichat/explore`, `GET /omnichat/explore/:id`, public asset content and comments |
| Explore writes | media/chat publish, like, bookmark, comment, share, follow, report, remove, and continue routes below `/omnichat/explore` |
| Groups | create/list/detail/messages/invites/join below `/omnichat/groups` |
| Voice | persona voice profile, assistant-message speech, call start/end/token-refresh/turn routes below `/omnichat` |

Group messages are delivered to connected members through the existing authenticated WebSocket hub with event type `omnichat_group_message`.

## Privacy and safety invariants

- Generated assets are private by default. Public content is served through a separate authorization path.
- Generated media references are owner-scoped, and downloads reject loopback/private-network URLs, DNS rebinding, unsafe redirects, invalid MIME signatures, and oversized payloads.
- Queue payloads contain only UUIDs. Provider credentials never reach the browser.
- Cost-bearing OmniChat rate limiters fail closed during counter-backend outages, and anonymous IP limits ignore proxy headers unless the proxy is explicitly trusted.
- Quotas are enforced transactionally using the user's tracked storage total.
- Virus scanning can fail closed and should remain enabled in production.
- Public captions, comments, and complete shared-chat snapshots are normalized before publication. The snapshot digest is checked again inside the publish transaction to prevent a publication race.
- Chat snapshots are immutable. Continuing a chat copies its messages into a new private conversation and records the source publication.
- Group invite tokens contain 256 bits of randomness and only their SHA-256 digest is stored. Tokens expire after seven days and have bounded use counts.
- Character prompts treat group transcripts as untrusted data and explicitly prevent transcript text from overriding the system role.
- Speech is only created for an assistant message in a conversation owned by the requester. Cached speech expires after 30 days; the daily retention worker deletes the object before removing its database row.
- A database deletion outbox preserves speech storage keys across user, persona, conversation, and message cascades; account erasure deletes speech synchronously and fails closed if voice storage is unavailable.
- Only one call is active per user. Starting another call atomically ends the prior session. Sessions record mode, timestamps, and turn count, but `recording_enabled` remains false and no separate audio or transcript recording is created.
- Live-avatar worker credentials never reach the browser. LiveKit rooms use short-lived server-issued credentials, and the avatar worker is stopped when the call closes. Any provider session or job identifier is retained until cleanup succeeds or the retention worker retries it.

## Operations

Before enabling the feature in production:

1. Apply all migrations through `170_omnichat_livekit_avatar_calls`.
2. Run both the API server and background worker with the same environment and storage configuration.
3. Verify Redis connectivity; generation is deliberately unavailable without the durable queue.
4. Verify ClamAV and keep `VIRUS_SCAN_FAIL_CLOSED=true`.
5. Configure the RunPod API key, image/video endpoint IDs, avatar worker image/GPU, and network volume; test image, image-edit, scene-video (two-phase), and Create-page image-video jobs in staging because model availability and input contracts can change.
6. Keep S3/R2/CloudFront CORS and object permissions private; generated files are streamed or signed by authorized application routes.
7. Configure `OPENROUTER_API_KEY` before enabling public creation so chat and publication checks remain available.
8. For free local speech, start Voicebox on the same host as the API, download/load Kokoro, confirm `GET http://127.0.0.1:17493/health`, and verify port `17493` is not reachable from another machine. Voicebox can start after the API; failed previews remain retryable.
9. For real-time avatar video, configure the self-hosted LiveKit credentials and RunPod avatar worker image/GPU. Confirm camera and microphone permissions in staging, verify the avatar publishes audio/video, and verify the Pod terminates when the modal closes.

Useful verification commands:

```bash
cd backend
go test -p 1 -race ./internal/models ./internal/services ./internal/handlers ./internal/queue ./internal/workers
go test ./internal/database -run '^TestOmniChatExpansionMigrationsRollBackAndReapplyCleanly$' -count=1
go vet ./...

cd ../frontend
npm test -- --run
npm run lint
npm run i18n:verify
npm run build
```

Provider failures store a safe public error code on the generation job and retain detailed provider text only in the protected job record/log path. Failed downloads and failed database commits delete any just-uploaded object. Expired speech cleanup is retryable when storage is temporarily unavailable.
