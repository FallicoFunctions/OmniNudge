# Public Reddit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every remaining Reddit OAuth-era runtime/config/doc reference, keep Reddit on the anonymous public JSON API, and harden Reddit failures so blocks degrade cleanly instead of masquerading as missing resources.

**Architecture:** Collapse `RedditClient` to a public-API-only client with one shared request-shaping path, remove dead moderator/token code, and classify Reddit HTTP statuses from typed service errors instead of brittle string matching. Clean env templates, maintained docs, historical roadmap notes, Postman examples, and local schema drift in the same pass so the repo no longer implies OAuth support anywhere active.

**Tech Stack:** Go, Gin, PostgreSQL, SQL migrations, Postman JSON, ripgrep, jq, psql, go test

---

### Task 1: Collapse Reddit Config and Client Construction to Public API Only

**Files:**
- Modify: `backend/internal/config/config.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/internal/services/reddit.go`
- Modify: `backend/internal/integration/test_utils.go`
- Modify: `backend/internal/integration/reddit_handler_integration_test.go`
- Modify: `backend/internal/services/reddit_test.go`
- Modify: `backend/internal/handlers/reddit_test.go`
- Modify: `backend/internal/handlers/feed_test.go`

- [ ] **Step 1: Update tests and test wiring to the public-only constructor first**

Change every constructor call to the three-argument shape before touching implementation so the targeted test run fails on compile.

```go
client := services.NewRedditClient("test-agent", cache, time.Minute)
```

and keep the integration config trimmed to:

```go
cfg := &config.Config{
    Reddit: config.RedditConfig{
        UserAgent: "OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)",
    },
}
```

- [ ] **Step 2: Run targeted tests to capture the expected compile break**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services ./internal/handlers ./internal/integration -run 'TestReddit|TestGetHomeFeed' -count=1
```

Expected:
- build fails with `not enough arguments in call to NewRedditClient`
- build may also fail on unknown `ClientID` / `ClientSecret` fields in `config.RedditConfig`

- [ ] **Step 3: Simplify the config struct and loader**

Reduce `RedditConfig` to one field and replace the weak default user-agent with a descriptive public-API value:

```go
type RedditConfig struct {
    UserAgent string
}
```

```go
Reddit: RedditConfig{
    UserAgent: getEnv("REDDIT_USER_AGENT", "OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)"),
},
```

This is the only Reddit runtime config that should remain in active code.

- [ ] **Step 4: Simplify server and integration construction**

Update `main.go`, integration wiring, and the `NewRedditClient` signature in `backend/internal/services/reddit.go` to pass only the public fields.

The constructor should become:

```go
func NewRedditClient(userAgent string, cache Cache, cacheTTL time.Duration) *RedditClient
```

and its returned struct should stop assigning `clientID` / `clientSecret`, but the dead struct fields and dead token/moderator code may remain untouched until Task 2.

Then update the call sites to match:

```go
redditClient := services.NewRedditClient(
    cfg.Reddit.UserAgent,
    cache,
    time.Duration(cfg.Redis.TTLSeconds)*time.Second,
)
```

```go
services.NewRedditClient(cfg.Reddit.UserAgent, services.NoopCache{}, 0)
```

- [ ] **Step 5: Re-run the targeted tests**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services ./internal/handlers ./internal/integration -run 'TestReddit|TestGetHomeFeed' -count=1
```

Expected:
- package compiles again
- existing targeted tests pass or move on to the next intended failures from later tasks

- [ ] **Step 6: Commit**

```bash
git add backend/internal/config/config.go backend/cmd/server/main.go backend/internal/integration/test_utils.go backend/internal/integration/reddit_handler_integration_test.go backend/internal/services/reddit_test.go backend/internal/handlers/reddit_test.go backend/internal/handlers/feed_test.go
git commit -m "refactor: remove reddit oauth config plumbing"
```

### Task 2: Remove Dead OAuth/Moderator Code and Unify Public Reddit Request Shaping

**Files:**
- Modify: `backend/internal/services/reddit.go`
- Modify: `backend/internal/services/reddit_test.go`
- Reference: `backend/internal/handlers/hub_ai_designer.go`

- [ ] **Step 1: Add failing service tests for the public request contract and typed HTTP errors**

Extend `backend/internal/services/reddit_test.go` with two tests:

```go
func TestGetSubredditPostsSetsPublicRequestMetadata(t *testing.T) {
    cache := &mapCache{store: make(map[string]string)}
    client := NewRedditClient("OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)", cache, time.Minute)

    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        require.Equal(t, "/r/golang/top.json", r.URL.Path)
        require.Equal(t, "1", r.URL.Query().Get("raw_json"))
        require.Equal(t, "day", r.URL.Query().Get("t"))
        require.Equal(t, "25", r.URL.Query().Get("limit"))
        require.Equal(t, "application/json", r.Header.Get("Accept"))
        require.Contains(t, r.Header.Get("User-Agent"), "OmniNudge/")
        _ = json.NewEncoder(w).Encode(RedditListing{Kind: "Listing"})
    }))
    defer ts.Close()

    client.httpClient.Transport = &hostRewriteTransport{target: ts}
    _, err := client.GetSubredditPosts(context.Background(), "golang", "top", "day", 25, "")
    require.NoError(t, err)
}
```

```go
func TestRedditStatusCodeExtractsTypedHTTPError(t *testing.T) {
    err := &redditHTTPError{statusCode: http.StatusForbidden, body: "blocked"}
    code, ok := RedditStatusCode(err)
    require.True(t, ok)
    require.Equal(t, http.StatusForbidden, code)
}
```

- [ ] **Step 2: Run the service package and confirm the new tests fail**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services -count=1
```

Expected:
- `Accept` / `raw_json` assertions fail
- `RedditStatusCode` is undefined until implemented

- [ ] **Step 3: Delete OAuth-era fields and dead moderator/token code from `reddit.go`**

Remove these from `RedditClient`:

```go
clientID     string
clientSecret string
tokenMu      sync.Mutex
appToken     *redditAppToken
```

Delete these dead types/functions/constants entirely:

```go
type redditAppToken struct { ... }
var ErrRedditModeratorsUnavailable = ...
func (r *RedditClient) GetSubredditModerators(...)
func (r *RedditClient) fetchSubredditModeratorsAPI(...)
func (r *RedditClient) fetchSubredditModeratorsFromHTML(...)
func (r *RedditClient) getAppAccessToken(...)
```

Also remove the `goquery` import from `reddit.go` only.

Do **not** run `go mod tidy` here: `github.com/PuerkitoBio/goquery` is still used by `backend/internal/handlers/hub_ai_designer.go`.

- [ ] **Step 4: Introduce shared public-request helpers and typed status extraction**

Add a single request helper and status helper to `reddit.go`:

```go
func RedditStatusCode(err error) (int, bool) {
    var httpErr *redditHTTPError
    if errors.As(err, &httpErr) {
        return httpErr.statusCode, true
    }
    return 0, false
}
```

```go
func (r *RedditClient) newPublicJSONRequest(ctx context.Context, method, rawURL string) (*http.Request, error) {
    req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("User-Agent", r.userAgent)
    req.Header.Set("Accept", "application/json")
    q := req.URL.Query()
    q.Set("raw_json", "1")
    req.URL.RawQuery = q.Encode()
    return req, nil
}
```

and a response helper:

```go
func redditHTTPErrorFromResponse(resp *http.Response) error {
    body, _ := io.ReadAll(resp.Body)
    return &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
}
```

- [ ] **Step 5: Rewire every public Reddit GET path through the shared helper**

At minimum, update:

- `GetSubredditPosts`
- `GetFrontPage`
- `GetPostInfo`
- `GetPostComments`
- `SearchPosts`
- `SearchUsers`
- `AutocompleteSubreddits`
- `SearchSubreddits`
- `GetUserListing`
- `GetUserAbout`
- `GetUserTrophies`
- `GetUserModeratedSubreddits`
- `GetSubredditAbout`
- `GetSubredditWikiPage`
- `GetWikiPage`
- `GetSubredditWikiRevisions`
- `GetSubredditWikiDiscussions`

The pattern inside each method should become:

```go
req, err := r.newPublicJSONRequest(ctx, http.MethodGet, url)
if err != nil {
    return nil, fmt.Errorf("failed to create request: %w", err)
}
```

and every non-200 branch should return the typed helper:

```go
if resp.StatusCode != http.StatusOK {
    return nil, redditHTTPErrorFromResponse(resp)
}
```

- [ ] **Step 6: Re-run the service package**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services -count=1
```

Expected:
- PASS
- no references remain to moderator scraping or token fetching

- [ ] **Step 7: Commit**

```bash
git add backend/internal/services/reddit.go backend/internal/services/reddit_test.go
git commit -m "refactor: make reddit client public-api only"
```

### Task 3: Fix Reddit Failure Semantics and Remove Startup Prewarm Burst

**Files:**
- Modify: `backend/internal/handlers/reddit.go`
- Modify: `backend/internal/handlers/reddit_test.go`
- Modify: `backend/internal/handlers/feed.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add failing handler coverage for blocked Reddit responses**

Add a dedicated 403 test to `backend/internal/handlers/reddit_test.go`:

```go
func TestGetSubredditPostsReturns503WhenRedditBlocksAnonymousTraffic(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusForbidden)
        _, _ = w.Write([]byte("You've been blocked by network security."))
    }))
    defer ts.Close()

    client := services.NewRedditClient("test-agent", nil, time.Minute)
    client.SetHTTPClient(&http.Client{Transport: &hostRewriteTransport{target: ts}})
    handler := NewRedditHandlerForTest(client)

    router := gin.Default()
    router.GET("/r/:subreddit", handler.GetSubredditPosts)

    req := httptest.NewRequest("GET", "/r/golang", nil)
    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    require.Equal(t, http.StatusServiceUnavailable, w.Code)
    require.Equal(t, "60", w.Header().Get("Retry-After"))
}
```

Keep or add a 404 test separately so not-found behavior remains covered.

- [ ] **Step 2: Run the Reddit handler tests and confirm 403 currently fails**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/handlers -run 'TestGetSubredditPosts|TestGetFrontPage' -count=1
```

Expected:
- the new 403 test fails because current code maps status `403` to `404`

- [ ] **Step 3: Replace string parsing in `handleRedditError` with typed status handling**

Delete the current `isRedditNotFound` / `isRedditRateLimited` string matching and use `services.RedditStatusCode(err)` directly:

```go
func handleRedditError(c *gin.Context, err error, notFoundMsg, internalMsg string) {
    if code, ok := services.RedditStatusCode(err); ok {
        switch code {
        case http.StatusNotFound, http.StatusGone:
            RespondError(c, http.StatusNotFound, notFoundMsg)
            return
        case http.StatusForbidden, http.StatusTooManyRequests, http.StatusServiceUnavailable:
            c.Header("Retry-After", "60")
            RespondError(c, http.StatusServiceUnavailable, "Reddit is temporarily unavailable, please try again shortly")
            return
        }
    }
    RespondError(c, http.StatusInternalServerError, internalMsg)
}
```

This keeps `404`/`410` as missing resources and treats `403` as temporary unavailability for anonymous public access.

- [ ] **Step 4: Remove the startup cache prewarm burst**

Delete the goroutine in `backend/cmd/server/main.go` that does:

```go
for _, sort := range []string{"hot", "new", "top"} {
    if _, err := redditClient.GetSubredditPosts(ctx, "popular", sort, "", 100, ""); err != nil {
        ...
    }
}
```

Do not replace it with another anonymous burst. The public Reddit path should be demand-driven only.

- [ ] **Step 5: Make feed degradation explicit in logs without changing feed API shape**

Keep popular and subscription feeds best-effort, but change the logging to distinguish Reddit outages from missing content:

```go
if code, ok := services.RedditStatusCode(err); ok {
    log.Printf("Reddit unavailable for r/%s: status=%d err=%v", subreddit, code, err)
} else {
    log.Printf("Error fetching r/%s: %v", subreddit, err)
}
```

Do this in both:

- `fetchPopularFeeds`
- `fetchSubredditWithCache`

Return empty Reddit slices exactly as today so the feed still degrades to hub-only results.

- [ ] **Step 6: Re-run handler tests and a package build**

Run:

```bash
cd backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/handlers -count=1
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go build ./cmd/server
```

Expected:
- handler suite PASS
- server build PASS

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handlers/reddit.go backend/internal/handlers/reddit_test.go backend/internal/handlers/feed.go backend/cmd/server/main.go
git commit -m "fix: harden public reddit failure handling"
```

### Task 4: Remove OAuth-Era Env, Doc, Roadmap, and Postman Debt

**Files:**
- Modify: `.env.example`
- Modify: `backend/.env.example`
- Modify: `docs/technical/architecture.md`
- Modify: `docs/technical/api-design.md`
- Modify: `docs/technical/database-schema.md`
- Modify: `docs/roadmap/00-overview.md`
- Modify: `docs/roadmap/01-setup-and-tools.md`
- Modify: `docs/roadmap/03-implementation-guide.md`
- Modify: `docs/postman/omninudge.postman_collection.json`

- [ ] **Step 1: Rewrite active env templates to describe the public Reddit path only**

Replace the Reddit sections in both env templates with:

```dotenv
# Reddit public API (anonymous, best effort)
REDDIT_USER_AGENT=OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)
# Optional proxy for local development or troubleshooting
REDDIT_PROXY_URL=
```

Delete these keys from active examples:

```text
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_REDIRECT_URI
```

- [ ] **Step 2: Rewrite maintained technical docs to match the real auth model**

Update `docs/technical/api-design.md` so the auth section says:

```md
Authentication uses username/password plus JWT tokens.
There is no Reddit OAuth flow.
Reddit browsing is fetched server-side from Reddit's public JSON API.
```

Update user payload examples to remove:

```json
"reddit_id": "t2_abc123",
"reddit_username": "example_user"
```

Update `docs/technical/database-schema.md` so the `users` table no longer contains:

```sql
reddit_id VARCHAR(50) UNIQUE,
reddit_username VARCHAR(50),
access_token TEXT,
refresh_token TEXT,
```

and remove the corresponding index and field descriptions.

Update `docs/technical/architecture.md` so any auth flow diagram or prose reflects:

```md
1. Frontend submits username/password to `/api/v1/auth/login`
2. Backend returns JWT + user profile
3. Reddit content is fetched anonymously by the backend from public `.json` endpoints
```

- [ ] **Step 3: Mark roadmap OAuth material as obsolete instead of leaving stale instructions**

At the top of each roadmap doc with OAuth content, add a historical banner:

```md
> Historical note: References to Reddit OAuth in this roadmap are obsolete. OmniNudge uses username/password auth and anonymous Reddit public API requests.
```

Also rewrite any top-level bullets that still present Reddit OAuth as planned/current behavior. For example, `docs/roadmap/00-overview.md` should say:

```md
- Reddit public API browsing (anonymous, best effort)
```

not:

```md
- Reddit OAuth login
```

In `docs/roadmap/01-setup-and-tools.md`, replace the Reddit env block with:

```dotenv
REDDIT_USER_AGENT=OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)
```

and delete the ngrok/callback guidance that exists only for Reddit OAuth redirects.

In `docs/roadmap/03-implementation-guide.md`, replace the obsolete section wholesale:

```md
## Months 1-2: Public Reddit API & Post Browsing

Current state:
- authentication is username/password plus JWT
- Reddit content is read anonymously from public `.json` endpoints
- there is no `/api/v1/auth/reddit` flow

Implementation notes:
- configure only `REDDIT_USER_AGENT`
- expect anonymous Reddit access to be best effort
- degrade blocked Reddit requests to `503` for Reddit-specific endpoints and hub-only results for combined feeds
```

Delete the old OAuth env block, redirect URI notes, token exchange code, `reddit_id` schema examples, and frontend redirect snippets from that roadmap file so `reddit_id`, `access_token`, `refresh_token`, and `/auth/reddit` no longer appear in active roadmap content.

- [ ] **Step 4: Clean the Postman collection so it no longer advertises dead OAuth routes or removed user fields**

Remove the request items named:

```text
Initiate Reddit OAuth
Reddit OAuth callback
```

and strip `reddit_id` / `reddit_username` from representative user example bodies so a user object looks like:

```json
{
  "avatar_url": "<string>",
  "bio": "<string>",
  "email": "<string>",
  "id": "<integer>",
  "karma": "<integer>",
  "public_key": "<string>",
  "role": "<string>",
  "username": "<string>"
}
```

Do not touch archived migration snapshots under `backend/internal/database/migrations_archive/**`; those are immutable history, not active docs.

- [ ] **Step 5: Verify the textual cleanup and JSON validity**

Run:

```bash
rg -n "REDDIT_CLIENT_ID|REDDIT_CLIENT_SECRET|REDDIT_REDIRECT_URI|Reddit OAuth|auth/reddit|reddit_id|reddit_username|access_token|refresh_token" .env.example backend/.env.example docs/technical docs/roadmap docs/postman/omninudge.postman_collection.json
jq empty docs/postman/omninudge.postman_collection.json
```

Expected:
- no active env/doc/Postman references remain, except acceptable historical notes in roadmap docs and immutable migration archive files outside the search scope
- `jq empty` exits `0`

- [ ] **Step 6: Commit**

```bash
git add .env.example backend/.env.example docs/technical/architecture.md docs/technical/api-design.md docs/technical/database-schema.md docs/roadmap/00-overview.md docs/roadmap/01-setup-and-tools.md docs/roadmap/03-implementation-guide.md docs/postman/omninudge.postman_collection.json
git commit -m "docs: remove reddit oauth references"
```

### Task 5: Apply Existing Migration 098 and Finish Verification

**Files:**
- Reference: `backend/internal/database/migrations/098_remove_legacy_reddit_oauth.up.sql`
- Reference: `backend/cmd/migrate/main.go`

- [ ] **Step 1: Confirm the migration is still pending before applying it**

Run:

```bash
cd backend
go run ./cmd/migrate -action=dry-run
```

Expected:
- pending list includes `098_remove_legacy_reddit_oauth`

- [ ] **Step 2: Apply the existing migration instead of inventing a new one**

Run:

```bash
cd backend
go run ./cmd/migrate -action=up
```

Expected:
- migration command exits `0`
- output includes `All migrations applied successfully`

- [ ] **Step 3: Verify the legacy columns are gone from the live local schema**

Run:

```bash
cd backend
set -a
source .env
set +a
psql "postgres://$DB_USER:${DB_PASSWORD:-}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}" -c "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('reddit_id','reddit_username','access_token','refresh_token','token_expires_at') ORDER BY column_name;"
```

Expected:
- zero rows returned

- [ ] **Step 4: Run full backend verification**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services ./internal/handlers ./internal/integration -count=1
GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go build ./cmd/server ./cmd/migrate
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge
rg -n "GetSubredditModerators|ErrRedditModeratorsUnavailable|getAppAccessToken|REDDIT_CLIENT_ID|REDDIT_CLIENT_SECRET|REDDIT_REDIRECT_URI" backend .env.example docs --glob '!backend/internal/database/migrations_archive/**'
```

Expected:
- targeted backend suites PASS
- both binaries build
- final `rg` returns no matches

- [ ] **Step 5: Do not create a repo commit for this task**

This task changes local database state, not tracked files. Move directly to Task 6 after verification.

### Task 6: Final Regression Pass Against the Original Failure Mode

**Files:**
- Reference: `backend/cmd/server/main.go`
- Reference: `backend/internal/services/reddit.go`
- Reference: `backend/internal/handlers/reddit.go`
- Reference: `backend/internal/handlers/feed.go`

- [ ] **Step 1: Start the backend with the existing local env**

Run:

```bash
cd backend
SERVER_PORT=8081 go run ./cmd/server
```

Expected:
- server starts
- there is no startup Reddit cache prewarm goroutine logging `Reddit cache pre-warm failed`

- [ ] **Step 2: Probe one Reddit endpoint and one home feed endpoint locally**

Run in another shell:

```bash
curl -i http://127.0.0.1:8081/api/v1/reddit/r/popular
curl -i http://127.0.0.1:8081/api/v1/feed/home
```

Expected:
- if Reddit allows the request, `/reddit/r/popular` returns `200`
- if Reddit blocks the request, `/reddit/r/popular` returns `503` with `Retry-After: 60`, not `404`
- `/feed/home` still returns `200`, degrading to hub-only content if Reddit is unavailable

- [ ] **Step 3: Capture the final cleanup proof**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge
rg -n "REDDIT_CLIENT_ID|REDDIT_CLIENT_SECRET|REDDIT_REDIRECT_URI|auth/reddit|GetSubredditModerators|ErrRedditModeratorsUnavailable|getAppAccessToken" backend .env.example docs --glob '!backend/internal/database/migrations_archive/**'
```

Expected:
- no matches in active runtime, tests, docs, or env templates

- [ ] **Step 4: Commit**

```bash
git add backend/internal/services/reddit.go backend/internal/handlers/reddit.go backend/internal/handlers/feed.go backend/cmd/server/main.go .env.example backend/.env.example docs/technical/architecture.md docs/technical/api-design.md docs/technical/database-schema.md docs/roadmap/00-overview.md docs/roadmap/01-setup-and-tools.md docs/roadmap/03-implementation-guide.md docs/postman/omninudge.postman_collection.json
git commit -m "refactor: remove reddit oauth debt and harden public reddit access"
```
