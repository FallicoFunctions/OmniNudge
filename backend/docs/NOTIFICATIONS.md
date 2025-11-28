# Notification System Architecture

## Overview

The ChatReddit notification system is designed to keep users informed about important activity on their content while avoiding notification spam. It uses an ML-ready architecture with adaptive baselines, intelligent batching, and real-time delivery for viral content.

## Core Principles

1. **Quality over Quantity**: Only notify for meaningful events
2. **Context-Aware**: Adapt thresholds based on user history
3. **Non-Blocking**: Never slow down HTTP responses
4. **ML-Ready**: Pluggable architecture for future ML models
5. **Real-Time When It Matters**: Immediate delivery for exponential growth

## Architecture Components

### 1. Notification Service
**Location:** `backend/internal/services/notification_service.go`

The central orchestrator that coordinates notification creation, batching, and delivery.

**Key Methods:**
- `CheckAndNotifyVote()` - Checks if a vote triggers milestone or velocity notifications
- `NotifyCommentReply()` - Creates notifications for comment replies
- `ProcessPendingBatches()` - Processes batched notifications every 15 minutes
- `SendNotification()` - Delivers notifications via WebSocket hub

**Responsibilities:**
- Determine if events warrant notifications
- Respect user notification preferences
- Coordinate with velocity detector
- Manage notification batching
- Deliver real-time notifications

### 2. Velocity Detector (Interface)
**Location:** `backend/internal/services/velocity_detector.go`

Pluggable interface for detecting viral content. Current implementation uses rule-based logic, but designed to be replaced with ML models.

**Interface:**
```go
type VelocityDetector interface {
    ShouldNotify(ctx context.Context, userID int, contentType string, votesPerHour float64) (bool, error)
    IsExponentialGrowth(ctx context.Context, contentType string, contentID int, currentVotesPerHour float64) (bool, error)
}
```

**Current Implementation:** `RuleBasedVelocityDetector`
- New users (≤10 posts): 5 votes/hour threshold
- Experienced users: 1.5x their historical baseline
- Exponential growth: 2x velocity increase in 1 hour

**Why This Design:**
Future ML models can be swapped in by implementing the interface without changing the notification service.

### 3. Baseline Calculator
**Location:** `backend/internal/services/baseline_calculator.go`

Calculates historical performance baselines for users to enable adaptive thresholds.

**Adaptive Windows:**
- **7 days**: Users with 1-10 posts (new users)
- **30 days**: Users with 11-50 posts (growing users)
- **90 days**: Users with 50+ posts (experienced users)

**Calculations:**
- Average votes per hour across all content
- Total posts and comments
- Separate baselines for posts vs comments

**Why Adaptive:**
New users have limited history, so we use shorter windows. Experienced users get stable baselines from longer windows.

### 4. Background Workers
**Location:** `backend/internal/workers/worker_manager.go`

Manages background goroutines that handle periodic tasks.

**Workers:**
- **Batch Processor**: Runs every 15 minutes to process batched notifications
- **Baseline Calculator**: Runs every 6 hours to update user baselines
- **Cleanup Worker**: Runs every 24 hours to delete old notifications (30+ days)

**Why Background:**
These operations are time-consuming and should not block HTTP responses or other real-time operations.

### 5. WebSocket Hub
**Location:** `backend/internal/websocket/hub.go`

Real-time delivery system for notifications to connected clients.

**Features:**
- Maintains active WebSocket connections
- Routes notifications to specific users
- Handles connection lifecycle
- Graceful shutdown support

## Notification Flow

### Milestone Notifications

```
1. User upvotes a post
   ↓
2. HTTP handler updates vote count
   ↓
3. Handler triggers CheckAndNotifyVote() in background goroutine
   ↓
4. Service checks user settings (notify_post_milestone enabled?)
   ↓
5. Service determines if post hit milestone (10, 50, 100, 500, 1000+)
   ↓
6. Service creates notification record
   ↓
7. Service sends via WebSocket if user is online
```

**Why Background Goroutine:**
Notification logic should never block the HTTP response. Users care about vote confirmation, not notification processing.

### Velocity Notifications

```
1. User upvotes a post
   ↓
2. HTTP handler updates vote count
   ↓
3. Handler triggers CheckAndNotifyVote() in background goroutine
   ↓
4. Service checks user settings (notify_post_velocity enabled?)
   ↓
5. Service calculates current votes/hour from vote_activity table
   ↓
6. Service calls VelocityDetector.ShouldNotify()
   ↓
7. Detector fetches user baseline
   ↓
8. Detector compares current velocity to threshold
   ↓
9. If threshold exceeded:
   a. Check for exponential growth
   b. If exponential: deliver immediately
   c. If not: add to 15-minute batch
```

**Why Batching:**
Prevents spam during steady growth. If a post gets 20 votes/hour consistently, we batch notifications instead of sending 4-8 individual alerts.

**Why Real-Time for Exponential:**
When velocity doubles in an hour, the content is going viral. Users want to know immediately.

### Reply Notifications

```
1. User creates comment with parent_comment_id
   ↓
2. HTTP handler creates comment record
   ↓
3. Handler triggers NotifyCommentReply() in background goroutine
   ↓
4. Service checks if parent author wants reply notifications
   ↓
5. Service prevents self-notification
   ↓
6. Service creates notification record
   ↓
7. Service delivers immediately (always real-time)
```

**Why Always Real-Time:**
Comment replies are direct interactions. Users expect immediate notification.

## Database Schema

### notifications
Stores all notification records.

```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    content_type VARCHAR(20),
    content_id INT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indices:**
- `user_id, created_at DESC` - Fast retrieval of user notifications
- `user_id, is_read, created_at DESC` - Fast unread count queries

### user_baselines
Stores historical performance metrics for adaptive thresholds.

```sql
CREATE TABLE user_baselines (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_posts INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    avg_post_votes_per_hour FLOAT DEFAULT 0,
    avg_comment_votes_per_hour FLOAT DEFAULT 0,
    last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why Cached:**
Calculating baselines requires scanning vote_activity. Caching results allows fast threshold comparisons without repeated aggregations.

### notification_batches
Tracks pending batched notifications to prevent duplicates.

```sql
CREATE TABLE notification_batches (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL,
    content_id INT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    scheduled_for TIMESTAMP NOT NULL,
    processed BOOLEAN DEFAULT FALSE
);
```

**Why Needed:**
Without batching table, rapid votes could create duplicate velocity notifications. This tracks "notification pending for post 123" to prevent duplicates.

### vote_activity
Automatically populated by database triggers to track voting velocity.

```sql
CREATE TABLE vote_activity (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL,
    content_id INT NOT NULL,
    author_id INT NOT NULL,
    voter_id INT NOT NULL,
    is_upvote BOOLEAN NOT NULL,
    hour_bucket TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why Triggers:**
The application code for voting is already complex. Database triggers ensure vote_activity stays in sync without application-level hooks.

**Why hour_bucket:**
Pre-computed hour buckets enable fast "votes in last hour" queries without date math at query time.

## Configuration

### User Settings
**Location:** `user_settings` table

Users can enable/disable each notification type:
- `notify_comment_replies` - Someone replied to your comment
- `notify_post_milestone` - Post reached milestone (10, 50, 100, etc.)
- `notify_post_velocity` - Post gaining votes faster than usual
- `notify_comment_milestone` - Comment reached milestone
- `notify_comment_velocity` - Comment gaining votes faster than usual
- `daily_digest` - Daily summary (future feature)

**Defaults:**
- Comment replies: ON (direct interaction)
- Post milestone: ON (meaningful events)
- Post velocity: ON (viral content)
- Comment milestone: ON (meaningful events)
- Comment velocity: OFF (less important than posts)
- Daily digest: OFF (not yet implemented)

## Performance Considerations

### 1. Non-Blocking Design
All notification logic runs in background goroutines. HTTP handlers return immediately after updating vote counts.

**Trade-off:**
Slight delay in notification delivery (~milliseconds) for guaranteed fast API responses.

### 2. Batch Processing
Velocity notifications use 15-minute batching to reduce spam during steady growth.

**Trade-off:**
Up to 15-minute delay for steady growth, but prevents notification fatigue.

### 3. Exponential Growth Detection
Posts with 2x velocity increase in 1 hour bypass batching for immediate delivery.

**Benefits:**
Users know when content is going viral without waiting for batch processing.

### 4. Adaptive Baselines
Cached baselines updated every 6 hours instead of real-time calculation.

**Trade-off:**
Baselines may be slightly stale, but query performance is dramatically improved.

### 5. Database Triggers
Vote activity tracking uses triggers instead of application-level inserts.

**Benefits:**
- Guaranteed consistency
- No application code overhead
- Works even if notification service is down

## Testing Strategy

### Unit Tests
**Location:** `backend/internal/services/*_test.go`

Each component has isolated unit tests:
- `notification_service_test.go` - Service logic
- `velocity_detector_test.go` - Threshold calculations
- `baseline_calculator_test.go` - Baseline windows and aggregations

**Total:** 16 unit tests

### Handler Tests
**Location:** `backend/internal/handlers/notifications_test.go`

HTTP handler tests for REST API endpoints:
- Get notifications with pagination
- Get unread count
- Mark as read
- Mark all as read
- Delete notification

**Total:** 7 handler tests

### Integration Tests
**Location:** `backend/internal/integration/notifications_integration_test.go`

End-to-end tests with real database:
- Milestone detection
- Velocity detection
- Batch processing
- Settings integration

**Total:** 4 integration tests

### Test Database
Tests use separate `chatreddit_test` database to avoid polluting development data.

```bash
export TEST_DATABASE_URL="postgres://user@localhost:5432/chatreddit_test?sslmode=disable"
go test ./...
```

## Future ML Integration

### Current Implementation
`RuleBasedVelocityDetector` uses hard-coded thresholds:
- New users: 5 votes/hour
- Experienced users: 1.5x baseline
- Exponential: 2x velocity in 1 hour

### ML Model Path
To replace with ML model:

1. **Create New Detector:**
```go
type MLVelocityDetector struct {
    model *YourMLModel
    pool  *pgxpool.Pool
}

func (d *MLVelocityDetector) ShouldNotify(ctx context.Context, userID int, contentType string, votesPerHour float64) (bool, error) {
    // Load features
    features := d.extractFeatures(ctx, userID, contentType, votesPerHour)

    // Run prediction
    prediction := d.model.Predict(features)

    return prediction > 0.5, nil
}
```

2. **Swap in Main.go:**
```go
// Old
velocityDetector := services.NewRuleBasedVelocityDetector(db.Pool, baselineRepo)

// New
velocityDetector := services.NewMLVelocityDetector(mlModel, db.Pool)
```

3. **No Other Changes Required:**
The interface abstraction means notification service, workers, and handlers remain unchanged.

### Potential ML Features
- Historical baseline (current)
- Time of day
- Day of week
- User's typical posting pattern
- Content category (text vs image vs link)
- Early vote patterns (first hour votes)
- User engagement history
- Platform-wide trending topics

### Training Data
`vote_activity` table contains all historical voting patterns with timestamps, perfect for training velocity prediction models.

## Monitoring and Observability

### Key Metrics to Track
1. **Notification Volume**: Notifications created per hour
2. **Batch Size**: Average notifications per batch
3. **Delivery Rate**: % of notifications delivered via WebSocket
4. **Processing Time**: Batch processing duration
5. **Baseline Staleness**: Time since last baseline update
6. **False Positives**: Users disabling velocity notifications

### Future Instrumentation
Add Prometheus metrics:
- `notifications_created_total{type="milestone|velocity|reply"}`
- `notifications_batched_total`
- `notifications_delivered_total{channel="websocket|poll"}`
- `batch_processing_duration_seconds`
- `baseline_calculation_duration_seconds`

## Summary

The notification system balances real-time delivery with spam prevention through:
- **Adaptive baselines** that grow with user experience
- **Intelligent batching** for steady growth
- **Real-time delivery** for viral content and direct interactions
- **ML-ready architecture** for future sophistication
- **Non-blocking design** that never impacts API performance

All 27 tests pass, proving the system handles edge cases like new users, experienced users, exponential growth, and batching correctly.
