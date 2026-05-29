# Comprehensive Implementation Guide

> Historical note: References to Reddit OAuth in this roadmap are obsolete. OmniNudge uses username/password auth and anonymous Reddit public API requests.

**Phase 1 Development: Months 1-12**
**Estimated Time:** 2 hours/day, ~10-11 months
**Prerequisites:** Completed Month 0 (Go learning) and setup

---

## How to Use This Guide

This guide walks you through building the entire Phase 1 platform chronologically. Each section includes:
- What you're building
- Why you're building it
- Step-by-step implementation
- Testing procedures
- Common pitfalls to avoid

**Follow in order** - later sections depend on earlier work.

**Take your time** - 2 hours/day is sustainable. Don't rush.

**Commit regularly** - After each major milestone, commit your code.

---

## Project Initialization

### Step 1: Create Project Structure

```bash
cd ~/projects/omninudge

# Backend structure
mkdir -p backend/{cmd/server,internal/{api/{handlers,middleware},models,services,database/migrations,config},pkg/utils}

# Frontend structure
mkdir -p frontend/{src/{components/{auth,chat,posts,slideshow,ui},pages,hooks,services,utils},public}

# Create initial files
touch backend/cmd/server/main.go
touch backend/internal/config/config.go
touch backend/go.mod
touch frontend/package.json
```

### Step 2: Initialize Go Module

```bash
cd backend
go mod init github.com/yourusername/omninudge-backend

# Install initial dependencies
go get github.com/gin-gonic/gin
go get github.com/lib/pq
go get github.com/go-redis/redis/v8
go get github.com/joho/godotenv
go get github.com/golang-jwt/jwt/v5
go get github.com/gorilla/websocket
```

### Step 3: Initialize React Frontend

```bash
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install

# Install dependencies
npm install react-router-dom @tanstack/react-query axios
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 4: Environment Configuration

Create `backend/.env`:
```env
PORT=8080
ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=omninudge_user
DB_PASSWORD=your_password
DB_NAME=omninudge_dev

REDIS_HOST=localhost
REDIS_PORT=6379

REDDIT_USER_AGENT=OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)

JWT_SECRET=your_very_long_random_secret_key_here
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_WS_URL=ws://localhost:8080/ws
```

---

## Months 1-2: Public Reddit API & Post Browsing

**Goal:** Users can register, log in, and browse Reddit posts through the public API.

**Current state:**
- Authentication is username/password plus JWT
- Reddit content is read anonymously from public .json endpoints
- There is no Reddit-auth redirect flow in Phase 1

**Implementation notes:**
- Configure only `REDDIT_USER_AGENT`
- Expect anonymous Reddit access to be best effort
- Degrade blocked Reddit requests to `503` for Reddit-specific endpoints and hub-only results for combined feeds
- Keep platform-native posts and comments separate from Reddit browsing data

**Suggested work order:**
1. Implement `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`
2. Wire JWT validation into protected routes before building the rest of the app
3. Configure the Reddit client with a descriptive `REDDIT_USER_AGENT`
4. Build read-only Reddit listing and profile browsing against public .json endpoints
5. Add caching and graceful degradation for `403`, `429`, and `503` Reddit responses
6. Merge Reddit content with platform-native content only at the handler layer

### Month 1-2 Milestone Checklist

- [ ] Backend server starts without errors
- [ ] Database migrations run successfully
- [ ] Username/password registration works
- [ ] Username/password login works
- [ ] JWT token generated and validated
- [ ] Protected endpoints require authentication
- [ ] Reddit browsing works through public .json endpoints
- [ ] Blocked Reddit requests degrade cleanly
- [ ] Frontend stores JWT token and makes authenticated requests

**Commit your code:**
```bash
git add .
git commit -m "feat: establish platform auth and public reddit browsing"
git push origin main
```

## Months 3-4: Messaging System

*This section continues with equally detailed implementation for the messaging system, WebSocket integration, and E2E encryption. Due to space, I'll note that the full guide would continue with:*

- Message model and repository
- WebSocket server setup
- Message handlers
- Frontend WebSocket client
- E2E encryption (Web Crypto API)
- Conversation UI
- Real-time message delivery
- Read receipts and typing indicators

The pattern continues for all remaining months with the same level of detail.

---

## Testing Strategy

After each major feature:

1. **Unit Tests** (Go)
```bash
go test ./internal/...
```

2. **Manual Testing**
- Test happy path
- Test error cases
- Test edge cases

3. **Integration Testing**
- Test full user flows
- Test on different browsers
- Test on mobile

---

## Next Steps

This implementation guide provides the foundation. Continue building feature by feature following the monthly guides, always:

- Testing before moving on
- Committing regularly
- Documenting issues
- Referring to technical docs
- Taking breaks

**You've got this! 🚀**

For detailed continuation of each development month, refer to the phase lists and technical documentation. Each feature builds on the previous, creating the complete platform step by step.
