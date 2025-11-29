# Testing Guide

## Test Coverage

The ChatReddit backend has comprehensive test coverage across all major systems:

**Total Tests: 135** ✅

### Test Distribution

- **Handlers (73 tests)**: HTTP endpoint tests for all REST API handlers
  - Reddit: 12 tests
  - Notifications: 7 tests
  - Search: 6 tests
  - Blocking: 6 tests
  - Slideshow: 9 tests
  - Media Gallery: 11 tests
  - Messages: 11 tests
  - Conversations: 11 tests
  - Profile: Tests in integration suite
  - Rate limiting: Tests in middleware

- **Services (16 tests)**: Business logic and algorithm tests
  - Notification service: 6 tests
  - Velocity detector: 5 tests
  - Baseline calculator: 5 tests

- **Integration (7 tests)**: End-to-end workflow tests
  - Post vote notifications
  - Comment reply notifications
  - Velocity detection with batching
  - Settings integration
  - Reddit API caching
  - WebSocket delivery

- **Middleware (31 tests)**: Authentication and rate limiting

## Running Tests

### Prerequisites

1. **PostgreSQL Database**
   ```bash
   createdb chatreddit_test
   ```

2. **Environment Variable**
   ```bash
   export TEST_DATABASE_URL="postgres://<your-username>@localhost:5432/chatreddit_test?sslmode=disable"
   ```

### Run All Tests

```bash
cd backend
go test ./...
```

### Run Specific Package

```bash
# Handlers
go test ./internal/handlers -v

# Services
go test ./internal/services -v

# Integration
go test ./internal/integration -v

# Middleware
go test ./internal/api/middleware -v
```

### Run Specific Test

```bash
go test ./internal/services -run TestNewUserVelocityThreshold -v
```

### With Coverage

```bash
go test ./... -cover
```

## Test Organization

### Handler Tests

Location: `backend/internal/handlers/*_test.go`

Test HTTP endpoints with mock requests:
- Request validation
- Response formatting
- Error handling
- Authentication integration

**Reddit Handler Tests (12 tests):**

The Reddit handler tests use a mock HTTP server to simulate Reddit's API:

```go
func TestGetSubredditMedia(t *testing.T) {
    handler, ts, handlerCalls := setupRedditHandlerTest(t)
    defer ts.Close()

    router := gin.Default()
    router.GET("/r/:subreddit/media", handler.GetSubredditMedia)

    req := httptest.NewRequest("GET", "/r/golang/media?limit=10", nil)
    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    require.Equal(t, http.StatusOK, w.Code)

    var response map[string]interface{}
    json.Unmarshal(w.Body.Bytes(), &response)

    mediaPosts := response["media_posts"].([]interface{})
    assert.Equal(t, 2, len(mediaPosts)) // Only media posts, not text
}
```

Tests cover:
- Subreddit posts fetching with sorting/filtering
- Front page fetching
- Post comments retrieval
- Reddit post search
- Media filtering for slideshow feature (images/videos only)
- Pagination support
- Input validation
- Error handling for missing parameters

**Other Handler Tests:**

```go
func TestGetNotifications(t *testing.T) {
    handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
    defer cleanup()

    // Create test data
    createTestNotification(t, db, userID, "post_milestone")

    // Make HTTP request
    router := gin.Default()
    router.GET("/notifications", func(c *gin.Context) {
        c.Set("user_id", userID)
        handler.GetNotifications(c)
    })

    req := httptest.NewRequest("GET", "/notifications", nil)
    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    // Assert response
    assert.Equal(t, http.StatusOK, w.Code)
}
```

### Service Tests

Location: `backend/internal/services/*_test.go`

Test business logic and algorithms:
- Velocity detection thresholds
- Baseline calculations
- Notification logic
- Edge cases

**Example:**
```go
func TestNewUserVelocityThreshold(t *testing.T) {
    detector, db, cleanup := setupVelocityTest(t)
    defer cleanup()

    // Create new user (≤10 posts)
    user := createUser(t, db, "newuser")

    // Test threshold: 5 votes/hour for new users
    shouldNotify, err := detector.ShouldNotify(ctx, user.ID, "post", 6.0)
    require.NoError(t, err)
    assert.True(t, shouldNotify)
}
```

### Integration Tests

Location: `backend/internal/integration/*_test.go`

Test complete workflows end-to-end:
- HTTP request → Handler → Service → Database → Response
- Background workers
- WebSocket delivery
- Cross-system interactions

**Example:**
```go
func TestEndToEndPostVoteNotification(t *testing.T) {
    _, db, notifService, cleanup := setupNotificationIntegrationTest(t)
    defer cleanup()

    // Create test data
    authorID, _, _, postID := createIntegrationTestData(t, db)

    // Vote 10 times to trigger milestone
    for i := 0; i < 10; i++ {
        voteOnPost(t, db, postID)
    }

    // Wait for background notification creation
    require.Eventually(t, func() bool {
        notifications := getNotifications(t, db, authorID)
        return hasNotificationType(notifications, "post_milestone")
    }, 2*time.Second, 50*time.Millisecond)
}
```

## Test Patterns

### Unique Test Data

All tests generate unique usernames/hub names to avoid conflicts:

```go
var testCounter int64
var testSuffix = time.Now().UnixNano()

func uniqueName(base string) string {
    id := atomic.AddInt64(&testCounter, 1)
    return fmt.Sprintf("%s_%d_%d", base, testSuffix, id)
}
```

This allows running `go test ./...` multiple times on the same database without cleanup.

### Database Cleanup

Tests use a dedicated `chatreddit_test` database:
- Separate from development data
- Can be reset with `dropdb chatreddit_test && createdb chatreddit_test`
- Migrations run automatically in each test

### Background Goroutines

Tests that verify background operations use `require.Eventually`:

```go
require.Eventually(t, func() bool {
    // Check if background operation completed
    return checkCondition()
}, 2*time.Second, 50*time.Millisecond, "condition not met")
```

## Test Utilities

### Helper Functions

Each test file has setup helpers:

```go
func setupNotificationsHandlerTest(t *testing.T) (*Handler, *database.Database, int, func()) {
    db, err := database.NewTest()
    require.NoError(t, err)

    // Setup test data
    userID := createTestUser(t, db)
    handler := NewNotificationsHandler(...)

    cleanup := func() {
        db.Close()
    }

    return handler, db, userID, cleanup
}
```

### Test Database Connection

`database.NewTest()` uses environment-based configuration:

1. Checks `TEST_DATABASE_URL`
2. Falls back to `DATABASE_URL`
3. Uses default: `postgres://postgres:postgres@localhost:5432/chatreddit_test?sslmode=disable`

## Continuous Integration

For CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  env:
    TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/chatreddit_test?sslmode=disable
  run: |
    createdb chatreddit_test
    cd backend
    go test ./... -v
```

## Coverage Goals

Current coverage:
- Handlers: 100% of endpoints tested
- Services: 100% of algorithms tested
- Integration: All major workflows tested
- Middleware: Authentication and rate limiting covered

## Writing New Tests

When adding new features:

1. **Handler tests**: Test HTTP layer
   ```go
   func TestNewEndpoint(t *testing.T) {
       handler, db, cleanup := setupHandlerTest(t)
       defer cleanup()
       // Test request/response
   }
   ```

2. **Service tests**: Test business logic
   ```go
   func TestNewAlgorithm(t *testing.T) {
       service, db, cleanup := setupServiceTest(t)
       defer cleanup()
       // Test edge cases
   }
   ```

3. **Integration tests**: Test complete flow
   ```go
   func TestNewWorkflow(t *testing.T) {
       _, db, service, cleanup := setupIntegrationTest(t)
       defer cleanup()
       // Test end-to-end
   }
   ```

## Test Quality Guidelines

- ✅ Use table-driven tests for multiple cases
- ✅ Generate unique test data to avoid conflicts
- ✅ Use `require` for fatal errors, `assert` for conditions
- ✅ Clean up resources with `defer cleanup()`
- ✅ Test both success and error paths
- ✅ Use descriptive test names
- ✅ Test background goroutines with `require.Eventually`

## Debugging Failed Tests

1. **Run with verbose output:**
   ```bash
   go test ./internal/services -v -run TestFailingTest
   ```

2. **Check database state:**
   ```bash
   psql chatreddit_test
   \dt  # List tables
   SELECT * FROM notifications LIMIT 10;
   ```

3. **Reset test database:**
   ```bash
   dropdb chatreddit_test
   createdb chatreddit_test
   ```

4. **Check environment:**
   ```bash
   echo $TEST_DATABASE_URL
   ```

## Performance

Test suite runs in ~15 seconds:
- Handlers: 0.7s
- Services: 1.8s
- Integration: 13.5s
- Middleware: <0.1s

Integration tests are slower due to:
- Real database operations
- Background goroutine waits
- WebSocket setup/teardown
- Full request/response cycles

This is acceptable for comprehensive end-to-end validation.
