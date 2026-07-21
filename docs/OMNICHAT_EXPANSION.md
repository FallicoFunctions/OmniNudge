# OmniChat Media, Social, Groups, and Calls

This document is the production and maintenance guide for OmniChat's generative media, Explore, mixed group chat, character voice, and call systems.

## Product behavior

- A direct conversation can request an image or video explicitly from the composer controls or naturally in text. Contextual generation uses the server-owned recent transcript and persisted scene state, not a client-authored transcript.
- The Create workspace generates character-consistent images and videos outside chat. Successful results are stored privately in the user's gallery automatically.
- A gallery owner can publish an approved creation to Explore. Conversation owners can publish an immutable, moderated snapshot. Other users can like, comment, bookmark, follow, share, report, or continue a shared chat in a private conversation of their own.
- OmniChat groups can contain human members and AI personas. Up to three explicitly selected or mentioned personas answer a turn; model calls run concurrently and messages are persisted in deterministic order.
- Every character receives a stable browser voice profile automatically. A character owner or moderator can configure an ElevenLabs voice profile for server-rendered speech.
- Assistant messages support read-aloud. Voice calls use the same persisted conversation, browser speech recognition where available, typed fallback input, and character speech. Video calls require Tavus CVI and open a private, short-lived WebRTC room where the character avatar can see, hear, respond, gesture, and lip-sync in real time. Call transcripts are not copied into a separate OmniChat recording.

## Runtime architecture

Image and video work is asynchronous:

1. The API authenticates every conversation, message, persona, and source-asset reference.
2. It normalizes the prompt and stores a private generation job.
3. An opaque job ID is queued in Redis; prompts and storage paths are not placed in the queue payload.
4. The worker submits to the configured Fal queue model, polls status, validates the result URL and decodable image/MP4 structure, enforces byte and dimension limits, scans the downloaded file, and writes it to application-owned storage.
5. The database transaction enforces storage quota, creates the gallery asset, optionally attaches it to the direct chat, and marks the job complete.

The frontend polls the owner-scoped job endpoint. Leaving the Create page does not cancel a queued job.

## Required deployment configuration

The API and worker must share PostgreSQL, Redis, and the same storage backend. Production should use S3-compatible storage and ClamAV with fail-closed scanning.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Direct and group AI responses plus fail-closed moderation for public text and shared chats |
| `OPENROUTER_MODEL` | Chat and moderation model |
| `REDIS_ADDR` / `REDIS_PASSWORD` | Generation queue and distributed rate-limit/cache infrastructure |
| `OMNICHAT_MEDIA_PROVIDER` | `fal` |
| `FAL_KEY` | Server/worker-only Fal credential |
| `FAL_IMAGE_MODEL` | Text-to-image model |
| `FAL_IMAGE_EDIT_MODEL` | Character-reference image model |
| `FAL_TEXT_VIDEO_MODEL` | Text-to-video model |
| `FAL_IMAGE_VIDEO_MODEL` | Image-to-video model |
| `OMNICHAT_MAX_IMAGE_BYTES` | Maximum accepted generated image size; default 25 MiB |
| `OMNICHAT_MAX_VIDEO_BYTES` | Maximum accepted generated video size; default 200 MiB |
| `OMNICHAT_MEDIA_POLL_SECONDS` | Provider queue polling cadence; bounded by the worker |
| `ELEVENLABS_API_KEY` | Optional server-rendered speech credential |
| `ELEVENLABS_BASE_URL` | ElevenLabs API base URL |
| `ELEVENLABS_TTS_MODEL` | Default speech model |
| `ELEVENLABS_ENABLE_LOGGING` | Provider request logging choice; defaults to `false` |
| `TAVUS_API_KEY` | Optional server-only credential for real-time avatar video calls |
| `TAVUS_BASE_URL` | Tavus API base URL; defaults to `https://tavusapi.com` |
| `TAVUS_REPLICA_ID` / `TAVUS_PERSONA_ID` | Default live replica/persona pair; a character voice profile can override both IDs |

If `ELEVENLABS_API_KEY` is absent, all characters still have distinct, stable on-device voice profiles. Character owners and moderators can store a Tavus `live_video_replica_id` and `live_video_persona_id` alongside the character voice profile; both values are required as a pair. If Tavus is absent, voice calls remain available but video-call creation fails explicitly. If Redis or Fal is unavailable, generation fails explicitly and does not create a partial gallery asset. If public-text moderation is unavailable, publication and comment text fail closed.

## Principal API surfaces

All routes below are under `/api/v1`. Owner routes require JWT authentication.

| Area | Routes |
| --- | --- |
| Scene and generation | `GET/PUT /omnichat/conversations/:id/scene`, `POST/GET /omnichat/generations`, `GET/DELETE /omnichat/generations/:id` |
| Gallery | `GET /omnichat/gallery`, `GET /omnichat/media/:id`, `GET /omnichat/media/:id/content` |
| Explore reads | `GET /omnichat/explore`, `GET /omnichat/explore/:id`, public asset content and comments |
| Explore writes | media/chat publish, like, bookmark, comment, share, follow, report, remove, and continue routes below `/omnichat/explore` |
| Groups | create/list/detail/messages/invites/join below `/omnichat/groups` |
| Voice | persona voice profile, assistant-message speech, call start/end/turn routes below `/omnichat` |

Group messages are delivered to connected members through the existing authenticated WebSocket hub with event type `omnichat_group_message`.

## Privacy and safety invariants

- Generated assets are private by default. Public content is served through a separate authorization path.
- Generated media references are owner-scoped, and downloads reject loopback/private-network URLs, DNS rebinding, unsafe redirects, invalid MIME signatures, and oversized payloads.
- Queue payloads contain only UUIDs. Provider credentials never reach the browser.
- Quotas are enforced transactionally using the user's tracked storage total.
- Virus scanning can fail closed and should remain enabled in production.
- Public captions, comments, and complete shared-chat snapshots are normalized and moderated before publication. The snapshot digest is checked again inside the publish transaction to prevent a moderation race.
- Chat snapshots are immutable. Continuing a chat copies its messages into a new private conversation and records the source publication.
- NSFW publications are excluded unless an authenticated viewer has opted in. Blocks are enforced in both directions on Explore reads.
- Group invite tokens contain 256 bits of randomness and only their SHA-256 digest is stored. Tokens expire after seven days and have bounded use counts.
- Character prompts treat group transcripts as untrusted data and explicitly prevent transcript text from overriding the system role.
- Speech is only created for an assistant message in a conversation owned by the requester. Cached speech expires after 30 days; the daily retention worker deletes the object before removing its database row.
- Only one call is active per user. Starting another call atomically ends the prior session. Sessions record mode, timestamps, and turn count, but `recording_enabled` remains false and no separate audio or transcript recording is created.
- Live-avatar provider keys never reach the browser. Tavus rooms require a short-lived meeting token, only trusted `*.daily.co` room URLs pass validation/CSP, and the provider session ID is retained after the local call closes until provider cleanup succeeds or the retention worker retries it.

## Operations

Before enabling the feature in production:

1. Apply all migrations through `144_omnichat_live_avatar_calls`.
2. Run both the API server and background worker with the same environment and storage configuration.
3. Verify Redis connectivity; generation is deliberately unavailable without the durable queue.
4. Verify ClamAV and keep `VIRUS_SCAN_FAIL_CLOSED=true`.
5. Configure `FAL_KEY`, then test image, image-edit, text-video, and image-video model IDs in staging because provider model availability and input contracts can change.
6. Keep S3/R2/CloudFront CORS and object permissions private; generated files are streamed or signed by authorized application routes.
7. Configure `OPENROUTER_API_KEY` before enabling public creation so moderation remains available.
8. If using ElevenLabs, configure a voice ID on a character through the owner-authorized voice endpoint and confirm the account supports the selected logging mode.
9. For real-time avatar video, configure `TAVUS_API_KEY` plus a default replica/persona pair or set character-specific live-video IDs through the same owner-authorized voice endpoint. Confirm camera and microphone permissions in staging and verify provider calls end when the modal closes.

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
