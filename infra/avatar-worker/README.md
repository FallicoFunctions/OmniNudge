# OmniChat LiveKit avatar worker

RunPod starts one short-lived container per video call. The API gives it a
short-lived LiveKit participant token and a mounted avatar image. It joins the
private room, publishes an avatar video/audio track, and consumes assistant
turns published by the browser on the `omnichat.assistant` data topic.

The worker does not receive the LiveKit signing secret, RunPod API key,
OpenRouter key, or a user JWT. Kokoro runs locally in the container and its
model cache should live on the configured RunPod network volume.

Build from `infra/avatar-worker`:

```bash
docker build -t omnichat-avatar-worker .
```

Required runtime variables are `LIVEKIT_URL` and `LIVEKIT_TOKEN`. The API sets
the first two for every call. The worker can use `OMNICHAT_AVATAR_IMAGE_URL`
when the character image is stored on an approved HTTPS host. Application
`/uploads/...` paths are resolved against `OMNICHAT_BACKEND_URL`; alternatively,
the worker can use `AVATAR_IMAGE_PATH` from the mounted model volume. Configure
`OMNICHAT_INPUT_HOSTS` when using a storage host other than
`storage.googleapis.com`; an empty image falls back to a neutral frame.
