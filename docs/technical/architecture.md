# Technical Architecture

**Project:** OmniNudge Platform
**Architecture Type:** Client-Server with WebSocket Real-Time Communication
**Deployment:** Monolithic initially, microservices in Phase 3

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
│                                                         │
│  ┌──────────────┐        ┌──────────────┐            │
│  │ Web Browser  │        │ Mobile Web   │            │
│  │  (Desktop)   │        │   (PWA)      │            │
│  └──────┬───────┘        └──────┬───────┘            │
│         │                        │                     │
│         └────────┬───────────────┘                     │
│                  │                                     │
│                  │ HTTP/HTTPS                          │
│                  │ WebSocket                           │
└──────────────────┼─────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React)                      │
│                                                         │
│  - React Components                                    │
│  - State Management (Context API)                      │
│  - WebSocket Client                                    │
│  - Web Crypto API (E2E Encryption)                     │
│  - IndexedDB (Client-side storage)                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ REST API + WebSocket
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (Go + Gin Framework)               │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │           HTTP Server (Gin)                     │  │
│  │  - REST API Endpoints                           │  │
│  │  - Request Routing                              │  │
│  │  - Middleware (Auth, CORS, Logging)             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │         WebSocket Server (Gorilla)              │  │
│  │  - Real-time message delivery                   │  │
│  │  - Connection management                        │  │
│  │  - Broadcasting                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │            Business Logic Layer                 │  │
│  │  - Authentication (Reddit OAuth)                │  │
│  │  - Message handling                             │  │
│  │  - Media processing                             │  │
│  │  - Reddit API integration                       │  │
│  │  - Slideshow coordination                       │  │
│  └─────────────────────────────────────────────────┘  │
└───────┬──────────────┬──────────────┬─────────────────┘
        │              │              │
        ▼              ▼              ▼
┌───────────┐  ┌──────────────┐  ┌──────────────┐
│PostgreSQL │  │    Redis     │  │  S3/R2 CDN  │
│           │  │              │  │             │
│- Users    │  │- Sessions    │  │- Images     │
│- Messages │  │- Online      │  │- Videos     │
│- Convos   │  │  Status      │  │- Audio      │
│- Posts    │  │- Cache       │  │             │
└───────────┘  └──────────────┘  └──────────────┘
```

---

## Component Details

### 1. Frontend (React)

**Technology Stack:**
- React 18+
- TypeScript
- Vite (build tool)
- React Router (routing)
- TanStack Query (data fetching)
- Native WebSocket client
- Web Crypto API

**Key Responsibilities:**
- User interface rendering
- Client-side routing
- State management
- E2E encryption (encrypt before send, decrypt after receive)
- WebSocket connection management
- Media display and slideshows
- Reddit post browsing

**File Structure:**
```
frontend/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── posts/
│   │   ├── slideshow/
│   │   └── ui/
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── InboxPage.tsx
│   │   ├── ChatPage.tsx
│   │   └── ProfilePage.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useEncryption.ts
│   │   └── useAuth.ts
│   ├── services/
│   │   ├── api.ts
│   │   ├── encryption.ts
│   │   └── reddit.ts
│   ├── utils/
│   └── App.tsx
├── public/
└── package.json
```

### 2. Backend (Go)

**Technology Stack:**
- Go 1.21+
- Gin Web Framework
- Gorilla WebSocket
- PostgreSQL driver (pgx)
- Redis client (go-redis)
- Reddit API client

**Key Responsibilities:**
- API endpoint handling
- WebSocket server for real-time messaging
- Reddit OAuth authentication
- Reddit API integration (posts, chat)
- Message storage and retrieval
- User session management
- Media upload handling
- Database operations

**File Structure:**
```
backend/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── api/
│   │   ├── handlers/
│   │   │   ├── auth.go
│   │   │   ├── messages.go
│   │   │   ├── posts.go
│   │   │   ├── media.go
│   │   │   └── websocket.go
│   │   ├── middleware/
│   │   │   ├── auth.go
│   │   │   ├── cors.go
│   │   │   └── logger.go
│   │   └── routes.go
│   ├── models/
│   │   ├── user.go
│   │   ├── message.go
│   │   ├── conversation.go
│   │   └── post.go
│   ├── services/
│   │   ├── auth_service.go
│   │   ├── message_service.go
│   │   ├── reddit_service.go
│   │   ├── media_service.go
│   │   └── websocket_service.go
│   ├── database/
│   │   ├── db.go
│   │   └── migrations/
│   └── config/
│       └── config.go
├── pkg/
│   └── utils/
├── go.mod
└── go.sum
```

### 3. PostgreSQL Database

**Purpose:** Persistent data storage

**Stores:**
- User accounts and profiles
- Messages (encrypted blobs for platform messages, plain text for Reddit messages)
- Conversations
- Reddit posts (cached)
- User settings
- Blocking relationships
- Invitation tracking

**See `database-schema.md` for detailed schema.**

### 4. Redis Cache

**Purpose:** Fast in-memory storage

**Uses:**
- Session tokens (JWT)
- Online/offline user status
- Reddit API response caching (5-15 min TTL)
- WebSocket connection tracking
- Rate limiting counters
- Temporary data

**Example Keys:**
```
session:{token_id} -> user data
user:{user_id}:online -> boolean
reddit:post:{post_id} -> cached post JSON
reddit:subreddit:{name}:hot -> cached posts
ratelimit:{user_id}:{action} -> counter
ws:connection:{user_id} -> connection ID
```

### 5. Media Storage (S3/R2/DO Spaces)

**Purpose:** Store uploaded media files

**Content:**
- User-uploaded images (JPEG, PNG, GIF, WebP)
- User-uploaded videos (MP4, WebM)
- Audio files (MP3, M4A, WAV) - Phase 2
- Thumbnails (auto-generated)

**File Organization:**
```
bucket/
├── images/
│   ├── {user_id}/
│   │   └── {timestamp}_{random}.jpg
│   └── thumbnails/
│       └── {image_id}_thumb.jpg
├── videos/
│   └── {user_id}/
│       └── {timestamp}_{random}.mp4
└── audio/  (Phase 2)
```

**Access:**
- Files served via CDN (CloudFlare, AWS CloudFront)
- Signed URLs for secure access
- Automatic expiration for temporary files

---

## Data Flow Examples

### Example 1: User Sends Encrypted Message

```
1. User types message in React frontend
2. Frontend encrypts message using recipient's public key (Web Crypto API)
3. Frontend sends encrypted blob via REST API:
   POST /api/messages
   {
     "recipient_id": 123,
     "encrypted_content": "base64_encrypted_blob",
     "conversation_id": 456
   }

4. Backend (Go) receives request
5. Validates user is authenticated (JWT middleware)
6. Stores encrypted message in PostgreSQL
7. Checks if recipient is online (Redis lookup)
8. If online:
   - Sends message via WebSocket to recipient
   - Updates message status to "delivered"
9. If offline:
   - Message waits in database
   - Delivered when recipient connects

10. Recipient's frontend receives via WebSocket
11. Decrypts message using their private key
12. Displays plaintext message
13. Sends read receipt back (if enabled)
```

### Example 2: Browse Reddit Posts

```
1. User navigates to /r/Yorkies in frontend
2. Frontend requests: GET /api/reddit/posts?subreddit=Yorkies&sort=hot
3. Backend checks Redis cache for recent results
4. If cached (< 5 min old):
   - Return cached data
5. If not cached:
   - Fetch from Reddit API
   - Store in Redis with 5 min TTL
   - Return to frontend
6. Frontend displays posts
7. Shows indicator if post author is on platform (query backend)
```

### Example 3: Personal Slideshow

```
1. User uploads 10 images via frontend
2. Frontend sends to backend:
   POST /api/media/upload (multipart/form-data)

3. Backend receives files
4. For each file:
   - Validate file type and size
   - Generate unique filename
   - Upload to S3/R2
   - Generate thumbnail
   - Store metadata in PostgreSQL

5. Return URLs to frontend
6. User clicks "Create Slideshow" in chat
7. Frontend sends slideshow command via WebSocket:
   {
     "type": "slideshow_start",
     "conversation_id": 123,
     "media_urls": ["url1", "url2", ...]
   }

8. Backend receives via WebSocket
9. Validates user is in conversation
10. Forwards command to other user's WebSocket connection
11. Both users' frontends start slideshow
12. Navigation commands sync via WebSocket:
    {
      "type": "slideshow_next",
      "current_index": 3
    }
```

### Example 4: Reddit Chat to Platform Migration

```
1. User A (on platform) messages User B (Reddit-only)
2. Backend detects User B not on platform
3. Sends message via Reddit Chat API
4. Message appears in User B's Reddit inbox
5. User B clicks invitation link in message
6. Redirected to platform OAuth flow
7. Authenticates with Reddit
8. Platform creates account for User B
9. Backend migration service:
   - Fetches Reddit Chat history between A and B (last 100 msgs)
   - Imports to PostgreSQL
   - Marks conversation as "upgraded"
10. Frontend shows merged history:
    - Old messages: "Sent via Reddit" indicator
    - New messages: Encrypted, full features
```

---

## Security Architecture

### Authentication Flow

**Reddit OAuth 2.0:**
```
1. User clicks "Login with Reddit"
2. Frontend redirects to Reddit OAuth URL
3. User authorizes on Reddit
4. Reddit redirects back with code
5. Backend exchanges code for access token
6. Backend fetches Reddit user info
7. Backend creates/updates user in database
8. Backend generates JWT token
9. Returns JWT to frontend
10. Frontend stores JWT in localStorage
11. All subsequent requests include JWT in Authorization header
```

**JWT Token Structure:**
```json
{
  "user_id": 123,
  "reddit_id": "abc123",
  "username": "yorkielover42",
  "exp": 1234567890,
  "iat": 1234560000
}
```

### E2E Encryption

**Key Generation (Per User):**
```
1. User signs up
2. Frontend generates RSA key pair (Web Crypto API)
   - Public key: Sent to backend, stored in database
   - Private key: Stored in browser IndexedDB, NEVER sent to server
```

**Message Encryption:**
```
1. User A wants to message User B
2. Frontend fetches User B's public key from backend
3. Frontend encrypts message:
   plaintext -> encrypt(B's public key) -> encrypted blob
4. Sends encrypted blob to backend
5. Backend stores blob (can't read it!)
6. User B receives encrypted blob
7. Frontend decrypts:
   encrypted blob -> decrypt(B's private key) -> plaintext
```

**Note:** Reddit Chat messages are NOT encrypted (go through Reddit's servers).

### Data Security

**Stored Data:**
- Platform messages: Encrypted blobs in PostgreSQL
- Reddit messages: Plain text (came through Reddit)
- Passwords: N/A (OAuth only)
- JWT secrets: Environment variables, never in code
- API keys: Environment variables, never in code

**Transmission:**
- All HTTP traffic over HTTPS (TLS 1.3)
- WebSocket over WSS (secure WebSocket)
- S3/R2 access via signed URLs

**Input Validation:**
- All user input sanitized
- SQL injection prevention (parameterized queries)
- XSS prevention (React escapes by default)
- CSRF protection (JWT tokens, SameSite cookies)
- Rate limiting (prevent abuse)

---

## Scalability Strategy

### Phase 1 (0-500 users)

**Single VPS Architecture:**
```
┌─────────────────────────────────┐
│      Single Server (VPS)        │
│                                 │
│  - Go Backend                   │
│  - PostgreSQL                   │
│  - Redis                        │
│  - Nginx (reverse proxy)        │
│  - React build (static files)   │
└─────────────────────────────────┘
```

**Cost:** ~$15-25/month

### Phase 2 (1,000-10,000 users)

**Separated Services:**
```
┌──────────────┐    ┌──────────────┐
│ App Server 1 │    │ App Server 2 │
│ (Go Backend) │    │ (Go Backend) │
└──────┬───────┘    └──────┬───────┘
       │                   │
       └────────┬──────────┘
                │
       ┌────────▼───────────┐
       │   Load Balancer    │
       │     (Nginx)        │
       └────────┬───────────┘
                │
       ┌────────┴───────────┬──────────┬─────────────┐
       │                    │          │             │
  ┌────▼─────┐      ┌──────▼───┐  ┌───▼────┐  ┌────▼────┐
  │PostgreSQL│      │  Redis   │  │  CDN   │  │ Static  │
  │(Managed) │      │(Managed) │  │(Media) │  │  Files  │
  └──────────┘      └──────────┘  └────────┘  └─────────┘
```

**Cost:** ~$200-500/month

### Phase 3 (10,000+ users)

**Microservices:**
- Auth Service
- Message Service
- Reddit Integration Service
- Media Service
- WebSocket Service (separate)
- Multiple regions
- Database sharding
- Caching layers

**Cost:** ~$1,000-5,000/month

---

## Performance Optimization

### Database Optimization

**Indexing Strategy:**
```sql
-- Users
CREATE INDEX idx_users_reddit_id ON users(reddit_id);
CREATE INDEX idx_users_username ON users(username);

-- Messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_recipient_delivered ON messages(recipient_id, delivered_at);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);

-- Conversations
CREATE INDEX idx_conversations_users ON conversations(user1_id, user2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

**Query Optimization:**
- Use LIMIT for pagination
- Use prepared statements
- Connection pooling
- Read replicas (Phase 3)

### Caching Strategy

**Redis Cache Layers:**
1. Reddit API responses (5-15 min)
2. User profiles (5 min)
3. Conversation metadata (1 min)
4. Online status (real-time)

**Client-Side Caching:**
- React Query cache (stale-while-revalidate)
- Browser cache for static assets
- IndexedDB for encryption keys
- localStorage for preferences

### WebSocket Optimization

**Connection Management:**
- Heartbeat/ping every 30 seconds
- Automatic reconnection with exponential backoff
- Connection pooling on server
- Graceful degradation to polling if WebSocket fails

**Message Optimization:**
- Binary frames for media metadata
- JSON for text messages
- Compression (deflate) for large payloads
- Batch small messages (debounce typing indicators)

---

## Monitoring & Observability

### Logging

**Backend Logging:**
```go
log.Info("User authenticated", "user_id", userID)
log.Error("Database error", "error", err, "query", query)
log.Debug("WebSocket message", "type", msgType, "size", len(data))
```

**Log Levels:**
- DEBUG: Development only
- INFO: Important events
- WARN: Recoverable errors
- ERROR: Critical errors

**Log Destinations:**
- Development: stdout
- Production: File rotation + Centralized logging (Phase 2)

### Metrics

**Key Metrics to Track:**
- Active users (current)
- Messages sent (per minute)
- API response times
- Database query times
- WebSocket connections
- Error rates
- Reddit API quota usage

**Tools:**
- Prometheus (Phase 2)
- Grafana dashboards (Phase 2)
- Custom /metrics endpoint

### Health Checks

**Endpoint:** `GET /health`

```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "reddit_api": "operational",
  "uptime": "48h32m15s"
}
```

---

## Deployment Architecture

### Development

```
Local Machine:
- Backend: localhost:8080
- Frontend: localhost:5173 (Vite dev server)
- PostgreSQL: localhost:5432
- Redis: localhost:6379
```

### Staging (Pre-Production)

```
Staging Server:
- Similar to production
- Uses staging.yoursite.com
- Test with real data before production deploy
```

### Production

```
Production Server:
- yoursite.com
- SSL/TLS enabled
- Environment variables for secrets
- Automated backups
- Monitoring enabled
```

**Deployment Process:**
1. Code pushed to GitHub
2. Run tests locally
3. Build frontend: `npm run build`
4. Build backend: `go build`
5. SSH to server
6. Stop service: `systemctl stop omninudge`
7. Upload new binary and static files
8. Run migrations if needed
9. Start service: `systemctl start omninudge`
10. Verify health check
11. Monitor logs for errors

---

## Technology Decisions Rationale

**Why Go for Backend?**
- Excellent concurrency (goroutines)
- Low memory footprint (cost-effective)
- Fast compilation
- Single binary deployment
- Great for WebSockets and real-time

**Why React for Frontend?**
- Largest ecosystem
- Great for complex UIs
- Component reusability
- Easy to find help
- Works well with TypeScript

**Why PostgreSQL?**
- Reliable and battle-tested
- Excellent for relational data
- JSON support for flexible fields
- ACID guarantees
- Free and open-source

**Why Redis?**
- Extremely fast (in-memory)
- Perfect for sessions and caching
- Pub/sub for real-time features (Phase 2)
- Easy to use

**Why Not MongoDB?**
- Data is highly relational (users, messages, conversations)
- Need ACID transactions
- PostgreSQL's JSON support covers flexible schema needs

**Why Not Firebase?**
- Want full control
- Lower long-term costs
- Learning opportunity
- No vendor lock-in

---

## Next Steps

This architecture supports:
- ✅ Phase 1: All MVP features
- ✅ Phase 2: Can scale to 10K users with minor changes
- ✅ Phase 3: Clear path to microservices

**Reference this document when:**
- Making technology decisions
- Designing new features
- Debugging system issues
- Planning scaling strategies

**See also:**
- `database-schema.md` - Detailed database design
- `api-design.md` - API endpoint specifications
- Monthly roadmap guides - Implementation details
