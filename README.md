# OmniNudge

A social platform combining Reddit browsing with encrypted multimedia chat, designed to be the foundation of a universal social media platform.

## Overview

OmniNudge allows users to browse Reddit content, discuss it with a growing community, and connect through end-to-end encrypted chat with multimedia features. Users can create their own posts and comments visible to the platform community while exploring Reddit's vast content library.

## Core Features (Phase 1 MVP)

### Reddit Integration
- Browse posts from any subreddit using Reddit's public API
- View posts with custom UI and sorting (hot, new, top, rising)
- Filter by subreddit topics
- View Reddit media in slideshows while chatting

### Platform Social Layer
- Create posts and comments in custom hubs
- Upvote/downvote posts and comments
- Unified feed showing both Reddit posts and platform posts
- Full-text search across posts, comments, users, and hubs
- Real-time notifications for milestones, velocity, and replies
- User blocking to filter unwanted content
- Profile management (bio, avatar)
- Username/password authentication (optional email)

### Encrypted Messaging
- End-to-end encrypted direct messages
- Real-time delivery via WebSocket
- Read receipts and typing indicators
- Online/offline status

### Multimedia Chat
- Share images, videos, GIFs, and audio
- Personal slideshows (upload and share your media)
- Reddit slideshow (browse subreddit media together)
- Synchronized slideshow with shared control
- Media gallery navigation through conversation history
- Filter media by sender (all/mine/theirs)

## Tech Stack

### Backend
- **Language:** Go 1.21+
- **Framework:** Gin
- **Database:** PostgreSQL
- **Real-time:** WebSocket (Gorilla)
- **Authentication:** JWT

### Frontend (Planned)
- **Framework:** React + TypeScript
- **Build Tool:** Vite
- **State:** TanStack Query
- **Encryption:** Web Crypto API

## Project Structure

```
omninudge/
├── backend/
│   ├── cmd/server/          # Application entry point
│   ├── internal/
│   │   ├── api/
│   │   │   ├── handlers/    # HTTP handlers
│   │   │   └── middleware/  # Auth, CORS, etc.
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic
│   │   ├── database/        # DB connection & migrations
│   │   └── config/          # Configuration
│   └── go.mod
├── frontend/                # (To be built)
└── docs/                    # Full documentation
```

## Current Status

✅ **Backend Phase 1 COMPLETE:**
- PostgreSQL database with migrations
- User authentication (JWT)
- User settings endpoints
- Database schema for messaging, posts, and comments
- Platform posts and comments with voting
- Real-time notifications with WebSocket support
- Full-text search across posts, comments, users, and hubs
- User blocking system
- Profile management
- Rate limiting
- Reddit public API integration with caching
- Synchronized slideshow coordination (personal & Reddit media)
- Media gallery navigation with filtering
- **End-to-end encrypted messaging system**
- **Media upload with thumbnail generation (images & videos)**
- **Real-time WebSocket events (messages, read receipts, online/offline status)**
- **Conversation management with read receipts**

🚧 In Development:
- Frontend application (React + TypeScript)

## Getting Started

### Prerequisites
- Go 1.21+
- PostgreSQL 14+
- Git

### Setup

1. Clone the repository
```bash
git clone <repository-url>
cd omninudge
```

2. Set up PostgreSQL
```bash
createdb omninudge_dev
```

3. Run the backend
```bash
cd backend
go run ./cmd/server/
```

The server will start on `http://localhost:8080`

### Running Tests

Several packages spin up their own PostgreSQL connection during tests, so make sure a **separate** database exists for them (recommended name: `omninudge_test`).

```bash
createdb omninudge_test
```

Then point the tests at that database using `TEST_DATABASE_URL` before running `go test`:

```bash
cd backend
export TEST_DATABASE_URL="postgres://<db-user>@localhost:5432/omninudge_test?sslmode=disable"
go test ./...
```

This ensures unit, service, and integration tests all connect cleanly without interfering with your dev data.

### Configuration

Environment variables (optional - defaults provided):
```env
# Server
SERVER_PORT=8080
SERVER_HOST=localhost

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=omninudge_dev

# JWT
JWT_SECRET=your-secret-key-here
```

### Frontend Environment Files

The React app reads configuration from `import.meta.env.*`. Copy the example file to get started:

```bash
cd frontend
cp .env.example .env.development
```

Update the values to match your backend host. For production builds, create `.env.production` (already included) and set:

```env
VITE_API_URL=https://api.omninudge.com/api/v1
VITE_WS_URL=wss://api.omninudge.com/ws
```

Vite automatically picks the correct file based on the `mode` you build with (`npm run dev`, `vite build --mode production`, etc.).

## API Features

### Notifications
- Real-time notifications via WebSocket
- Post milestone notifications (10, 50, 100, 500, 1000+ upvotes)
- Comment milestone notifications
- Velocity-based notifications for viral content
- Comment reply notifications
- Adaptive baselines for experienced users
- 15-minute batching to reduce spam
- Configurable notification preferences

### Search
- Full-text search using PostgreSQL tsvector
- Search posts by title and body
- Search comments by content
- Search users by username and bio
- Search hubs by name and description
- Pagination support with limit/offset
- Relevance ranking with ts_rank

### User Blocking
- Block users to hide their content
- Unblock users to restore visibility
- List all blocked users with timestamps
- Prevent self-blocking
- Idempotent blocking operations

### Profile Management
- Update bio (max 500 characters)
- Update avatar URL (HTTPS required)
- Change password with current password verification
- Secure password hashing with bcrypt

### Rate Limiting
- Token bucket algorithm
- 100 requests/minute for authenticated users
- 20 requests/minute for anonymous users
- Per-user and per-IP tracking

### Synchronized Slideshows
- Create slideshow sessions for personal or Reddit media
- Real-time navigation synchronized between users
- Controller transfer for shared control
- Auto-advance with configurable intervals
- WebSocket-based state synchronization

### Media Gallery
- Navigate through all conversation media chronologically
- Filter by sender (all media, mine only, theirs only)
- Full-screen viewer with arrow key navigation
- Find media position in filtered lists
- Persistent user preference for filter setting

## Documentation

Comprehensive documentation available in `/docs`:
- [API Documentation](backend/docs/API.md) - Complete REST API reference
- [Testing Guide](backend/docs/TESTING.md) - Test suite and coverage
- [Notifications](backend/docs/NOTIFICATIONS.md) - Notification system details
- [Slideshows](backend/docs/SLIDESHOWS.md) - Synchronized slideshow coordination
- [Media Gallery](backend/docs/MEDIA_GALLERY.md) - Media navigation feature
- [Overview & Roadmap](docs/roadmap/00-overview.md) - Complete project vision
- [Phase 1 Features](docs/phase-lists/phase-1-features.md) - MVP feature list
- [Architecture](docs/technical/architecture.md) - System design
- [Database Schema](docs/technical/database-schema.md) - Database structure
- [Implementation Guide](docs/roadmap/03-implementation-guide.md) - Development guide

## Long-Term Vision

OmniNudge is designed to evolve into a comprehensive social platform:

**Phase 1 (Year 1):** Reddit browser + encrypted chat + multimedia
**Phase 2 (Year 2):** Content creation (videos, images, stories)
**Phase 3 (Year 3):** Creator monetization (subscriptions, tipping, ads)
**Phase 4 (Year 4):** Communities (groups, live streaming, forums)
**Phase 5 (Year 5):** Professional network (portfolios, jobs, B2B)

Core principle: **Anonymity-first** with optional professional identity

## Contributing

This is currently a personal project. Contributions guidelines will be added as the project matures.

## License

TBD
