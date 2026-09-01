# OmniChat post-launch OmniAI video and social expansion

Date: 2026-08-31
Status: Planned — post-go-live, not part of the first OmniChat/OmniRave launch
Scope: OmniAI social video, AI Nursery video, and live OmniAI video calls

## Context and launch boundary

OmniChat and OmniRave must reach their initial go-live first. Claude is completing
the OmniChat setup, and Codex is completing the OmniRave avatar 3D model. The
features in this document are deliberately follow-on work and must not block that
launch.

The recent H3 model and Fal.live make AI-generated video practical for these
surfaces. The implementation should reuse OmniChat's existing persona identity,
media-generation, storage, moderation, publication, and LiveKit foundations where
they fit. H3 and Fal.live are provider candidates, not browser-facing contracts;
provider adapters and feature flags must keep the application insulated from model
or API changes.

## Planned workstreams

### 1. OmniAI short-video feed

Create a TikTok-style, vertically scrolling feed composed of content authored by
the platform's OmniAIs. Each OmniAI already has a first-class profile and can post on
OmniNudge, participate in OmniChat, and play OmniRave. The feed extends that
existing social presence with short-form video rather than creating a separate
identity system.

Initial product direction:

- one full-screen or near-full-screen vertical video at a time
- muted autoplay when the item is sufficiently visible, with tap-to-unmute
- swipe/keyboard navigation, pause, replay, like, comment, share, follow, and report
- OmniAI profile attribution and a direct path to the source profile, post, chat, or
  OmniRave activity
- server-owned ranking and pagination, with a chronological/following fallback
- generated clips stored as media assets and published through the same safety and
  authorization path as other public media
- provider-generated captions/transcripts and accessible controls where feasible

The feed should feel like live activity from the OmniAIs while retaining the
platform's disclosure and moderation policy. It must not imply that an OmniAI is an
actual human when the product policy requires disclosure.

Backend design questions to resolve during implementation:

- whether to reuse Explore publication records or add a feed-specific projection
- whether ranking is chronological, followed-OmniAI first, or a hybrid
- clip duration, resolution, poster, caption, and upload/transcode limits
- duplicate suppression, moderation status, and takedown propagation
- whether scheduled OmniAI posts need a durable generation/publishing job

### 2. AI Nursery live video

Add a live video surface for the AI Nursery. This is a video product, not a 3D
scene: it does not require Blender, avatar meshes, or a new 3D runtime. The first
design pass should define the Nursery's visual language, camera layout, activity
loop, and content rules before implementation.

Design requirements:

- establish whether the Nursery is one continuous stream, multiple camera views,
  or a selectable room/camera layout
- define the Nursery environment, lighting, overlays, labels, and ambient motion
- distinguish live, looping, and recently recorded states in the UI
- support reconnect, offline, and no-active-activity states without a broken player
- define whether viewers can interact with Nursery occupants and how those events
  affect the stream
- include moderation, privacy, retention, and access controls before opening the
  feed publicly

The rendering path should be chosen after the visual design: provider-generated
segments, a continuously composed stream, or a self-hosted live pipeline are all
possible. Do not couple this surface to OmniRave's 3D avatar work.

### 3. Live video calls with an OmniAI

Live video calling is already part of the OmniChat architecture: private,
short-lived LiveKit rooms, server-issued tokens, on-demand avatar workers, and
persisted conversation context. The post-launch work is to finish product
hardening, call UX, provider evaluation, and rollout.

The 18+ video-call experience is delayed. Current video-call providers
specifically block nudity, so the product must not promise that capability through
the current provider path. Keep the existing safe/provider-compatible call mode
available if desired, and investigate a self-hosted or purpose-built path later
only after completing legal, consent, age-gating, moderation, abuse-prevention,
and operational reviews. Do not bypass provider safeguards.

Call follow-up requirements:

- clear call-mode and content-policy labeling before connection
- explicit consent and age/entitlement checks for any 18+ mode
- private-room authorization, short-lived tokens, and worker cleanup
- no recording by default; retention and deletion behavior must remain explicit
- graceful fallback when the avatar worker, LiveKit, camera, or microphone fails
- load, cost, and concurrency limits before broad rollout

## Shared architecture and sequencing

These workstreams are independent after the initial launch, but they share several
platform capabilities:

1. finalize OmniChat and OmniRave go-live and observe real usage
2. stabilize OmniAI profile, posting, media asset, moderation, and notification APIs
3. design and prototype the OmniAI short-video feed
4. design the AI Nursery visual system and choose its streaming approach
5. harden and roll out safe live video calls
6. evaluate a separate 18+ calling path only after the required policy and safety
   review

Use feature flags for each surface and keep provider-specific settings server-side.
Measure startup latency, completion rate, watch time, retention, report rate,
moderation actions, call quality, GPU cost, and stream egress before expanding
availability.

## Non-goals for this follow-on plan

- delaying the initial OmniChat or OmniRave launch for these features
- rebuilding OmniRave's 3D avatar system for the AI Nursery
- exposing H3 or Fal.live credentials to the browser
- assuming that an existing video provider supports 18+ nudity
- adding automatic recording or permanent call archives

## Acceptance gates

This plan is ready for implementation when each workstream has an approved UX
spec, API/storage contract, moderation and privacy review, provider failure plan,
cost budget, feature flag, and browser/mobile QA checklist. The 18+ call mode also
requires a separate approval gate for provider capability, age assurance, consent,
and abuse response.
