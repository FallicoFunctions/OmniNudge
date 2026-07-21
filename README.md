# OmniNudge

OmniNudge is a social platform with native posts and comments, real-time messaging, media sharing, Reddit browsing, and theme customization.

The repository includes a Go backend, a React frontend, background jobs, media processing, and operational tooling.

## Product Scope

- Platform-native posts, comments, hubs, subscriptions, voting, and search
- Reddit browsing through Reddit's public JSON endpoints
- Direct messaging with read receipts, typing indicators, and presence
- Image, video, audio, and file uploads
- Voice messages, WebRTC calls, and screen sharing
- Shared slideshow sessions and conversation media galleries
- OmniChat contextual image/video generation, private creator galleries, and an Explore feed
- Shareable AI conversations with continuation/remix, engagement, follows, and mixed human/AI groups
- Character read-aloud voices plus live voice and video conversation modes
- Custom themes with installable themes, user overrides, and a visual editor
- Moderation, feature flags, analytics, retention, data export, and account deletion flows

## Implemented Systems

### Social and Content

- Native post and comment system with hub-specific access controls
- Mixed content model for platform posts and Reddit content
- Full-text search across posts, comments, users, and hubs
- Saved items, hidden items, subscriptions, and blocking
- Notification pipeline for replies, milestones, and activity thresholds

### Messaging and Realtime

- WebSocket-based realtime event delivery
- Direct conversations, folders, reactions, and message editing
- Presence tracking and online status
- WebRTC call signaling with TURN-backed ICE server configuration
- Screen sharing and synchronized slideshow coordination

### Media Pipeline

- Upload handling for images, video, audio, and file attachments
- Quota-aware media storage
- S3-compatible object storage support with CDN URL handling
- Background virus scanning and thumbnail generation
- Voice-message processing and waveform generation
- FFmpeg-based audio handling for iOS recording compatibility

### Safety and Operations

- Rate limiting across auth, upload, and general API paths
- Moderation workflows, mod mail, removal reasons, and audit logs
- Feature flag service with rollout monitoring
- Retention worker and account deletion flows
- Data export jobs
- Structured logging, metrics, tracing, and error reporting hooks

## Architecture

### Backend

- Go 1.26
- Gin HTTP server
- PostgreSQL with `pgx`
- Redis for cache and queue coordination
- Asynq for background jobs
- Gorilla WebSocket
- JWT authentication
- S3-compatible storage integration
- ClamAV for upload scanning
- FFmpeg for audio processing
- Firebase Cloud Messaging for push notifications
- Fal queue-backed image and video generation
- Optional ElevenLabs speech synthesis with per-character browser voice fallback
- Optional Tavus CVI private WebRTC rooms for real-time, lip-synced character video calls
- Prometheus, OpenTelemetry, Sentry, and Pyroscope integration points
- Gemini-backed hub AI designer endpoint

### Frontend

- React 19
- TypeScript 5.9
- Vite 7
- React Router 7
- TanStack Query 5
- React Hook Form with Zod validation
- Tailwind CSS 3
- i18next localization
- Storybook
- Vitest, Testing Library, and Playwright

## Repository Layout

- `backend/` contains the Go API, workers, migrations, and services
- `frontend/` contains the React application, tests, and Storybook
- `docs/` contains technical references and supporting documentation

## Technical References

- [Architecture](docs/technical/architecture.md)
- [Database Schema](docs/technical/database-schema.md)
- [Docs Index](docs/README.md)
- [Runbook](RUNBOOK.md)
- [OmniChat Media, Social, Groups, and Calls](docs/OMNICHAT_EXPANSION.md)
