# ChatReddit

A social platform combining Reddit browsing with encrypted multimedia chat, designed to be the foundation of a universal social media platform.

## Overview

ChatReddit allows users to browse Reddit content, discuss it with a growing community, and connect through end-to-end encrypted chat with multimedia features. Users can create their own posts and comments visible to the platform community while exploring Reddit's vast content library.

## Core Features (Phase 1 MVP)

### Reddit Integration
- Browse posts from any subreddit using Reddit's public API
- View posts with custom UI and sorting (hot, new, top, rising)
- Filter by subreddit topics
- View Reddit media in slideshows while chatting

### Platform Social Layer
- Create posts and comments on the platform
- Unified feed showing both Reddit posts and platform posts
- Find other users through posts and comments
- Username/password authentication (optional email)

### Encrypted Messaging
- End-to-end encrypted direct messages
- Real-time delivery via WebSocket
- Read receipts and typing indicators
- Online/offline status

### Multimedia Chat
- Share images and videos
- Personal slideshows (upload and share your media)
- Reddit slideshow (browse subreddit media together)
- Synchronized video playback

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
chatreddit/
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

✅ Backend foundation complete:
- PostgreSQL database with migrations
- User authentication (JWT)
- User settings endpoints
- Database schema for messaging, posts, and comments

🚧 In Development:
- Reddit public API integration
- Platform posts and comments
- Messaging system
- Frontend application

## Getting Started

### Prerequisites
- Go 1.21+
- PostgreSQL 14+
- Git

### Setup

1. Clone the repository
```bash
git clone <repository-url>
cd chatreddit
```

2. Set up PostgreSQL
```bash
createdb chatreddit_dev
```

3. Run the backend
```bash
cd backend
go run ./cmd/server/
```

The server will start on `http://localhost:8080`

### Running Tests

Several packages spin up their own PostgreSQL connection during tests, so make sure a **separate** database exists for them (recommended name: `chatreddit_test`).

```bash
createdb chatreddit_test
```

Then point the tests at that database using `TEST_DATABASE_URL` before running `go test`:

```bash
cd backend
export TEST_DATABASE_URL="postgres://<db-user>@localhost:5432/chatreddit_test?sslmode=disable"
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
DB_NAME=chatreddit_dev

# JWT
JWT_SECRET=your-secret-key-here
```

## Documentation

Comprehensive documentation available in `/docs`:
- [Overview & Roadmap](docs/roadmap/00-overview.md) - Complete project vision
- [Phase 1 Features](docs/phase-lists/phase-1-features.md) - MVP feature list
- [Architecture](docs/technical/architecture.md) - System design
- [Database Schema](docs/technical/database-schema.md) - Database structure
- [Implementation Guide](docs/roadmap/03-implementation-guide.md) - Development guide

## Long-Term Vision

ChatReddit is designed to evolve into a comprehensive social platform:

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
