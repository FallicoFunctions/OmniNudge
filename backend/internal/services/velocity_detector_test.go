package services

import (
	"context"
	"testing"
	"time"

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupVelocityTest(t *testing.T) (*RuleBasedVelocityDetector, *database.Database, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	detector := NewRuleBasedVelocityDetector(db.Pool, baselineRepo)

	cleanup := func() {
		db.Close()
	}

	return detector, db, cleanup
}

func TestNewUserVelocityThreshold(t *testing.T) {
	detector, db, cleanup := setupVelocityTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create new user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     "newuser",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	tests := []struct {
		name         string
		votesPerHour float64
		shouldNotify bool
	}{
		{"Below threshold", 4.0, false},
		{"At threshold", 5.0, true},
		{"Above threshold", 10.0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldNotify, err := detector.ShouldNotify(ctx, user.ID, "post", tt.votesPerHour)
			require.NoError(t, err)
			assert.Equal(t, tt.shouldNotify, shouldNotify)
		})
	}
}

func TestExperiencedUserVelocityThreshold(t *testing.T) {
	detector, db, cleanup := setupVelocityTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create experienced user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     "experienced_user",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create baseline for experienced user (>10 posts)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	baseline := &models.UserBaseline{
		UserID:              user.ID,
		TotalPosts:          15,
		TotalComments:       20,
		AvgPostVotesPerHour: 3.0,
		LastCalculatedAt:    time.Now(),
	}
	err = baselineRepo.CreateOrUpdate(ctx, baseline)
	require.NoError(t, err)

	tests := []struct {
		name         string
		votesPerHour float64
		shouldNotify bool
		description  string
	}{
		{
			"Below baseline",
			2.0,
			false,
			"2.0 < 3.0 baseline, should not notify",
		},
		{
			"At baseline",
			3.0,
			false,
			"3.0 = baseline, not 1.5x, should not notify",
		},
		{
			"Below 1.5x baseline",
			4.0,
			false,
			"4.0 < 4.5 (1.5x baseline), should not notify",
		},
		{
			"At 1.5x baseline",
			4.5,
			true,
			"4.5 = 1.5x baseline, should notify",
		},
		{
			"Above 1.5x baseline",
			10.0,
			true,
			"10.0 > 1.5x baseline, should notify",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldNotify, err := detector.ShouldNotify(ctx, user.ID, "post", tt.votesPerHour)
			require.NoError(t, err)
			assert.Equal(t, tt.shouldNotify, shouldNotify, tt.description)
		})
	}
}

func TestExponentialGrowthDetection(t *testing.T) {
	detector, db, cleanup := setupVelocityTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     "testuser",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create hub and post
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      "test_hub",
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    hub.ID,
		Title:    "Test Post",
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Insert vote activity to simulate velocity doubling
	now := time.Now()
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO vote_activity (content_type, content_id, hour_timestamp, vote_count)
		VALUES
			('post', $1, $2, 5),
			('post', $1, $3, 10)
	`, post.ID, now.Add(-1*time.Hour), now)
	require.NoError(t, err)

	// Test exponential growth detection
	isExponential, err := detector.IsExponentialGrowth(ctx, "post", post.ID, 10.0)
	require.NoError(t, err)
	assert.True(t, isExponential, "Should detect exponential growth when velocity doubles")

	// Test non-exponential growth
	_, err = db.Pool.Exec(ctx, `
		DELETE FROM vote_activity WHERE content_type = 'post' AND content_id = $1
	`, post.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO vote_activity (content_type, content_id, hour_timestamp, vote_count)
		VALUES
			('post', $1, $2, 5),
			('post', $1, $3, 6)
	`, post.ID, now.Add(-1*time.Hour), now)
	require.NoError(t, err)

	isExponential, err = detector.IsExponentialGrowth(ctx, "post", post.ID, 6.0)
	require.NoError(t, err)
	assert.False(t, isExponential, "Should not detect exponential growth when velocity increases slowly")
}

func TestVelocityDetectorWithNoBaseline(t *testing.T) {
	detector, db, cleanup := setupVelocityTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create user with no baseline
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     "no_baseline_user",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Should treat as new user (5 votes/hour threshold)
	shouldNotify, err := detector.ShouldNotify(ctx, user.ID, "post", 6.0)
	require.NoError(t, err)
	assert.True(t, shouldNotify, "User with no baseline should be treated as new user")
}

func TestExponentialGrowthWithInsufficientData(t *testing.T) {
	detector, db, cleanup := setupVelocityTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     "testuser",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create hub and post
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      "test_hub",
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    hub.ID,
		Title:    "Test Post",
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Test with no vote activity data
	isExponential, err := detector.IsExponentialGrowth(ctx, "post", post.ID, 10.0)
	require.NoError(t, err)
	assert.False(t, isExponential, "Should not detect exponential growth with no data")

	// Insert only one data point
	now := time.Now()
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO vote_activity (content_type, content_id, hour_timestamp, vote_count)
		VALUES ('post', $1, $2, 5)
	`, post.ID, now)
	require.NoError(t, err)

	isExponential, err = detector.IsExponentialGrowth(ctx, "post", post.ID, 10.0)
	require.NoError(t, err)
	assert.False(t, isExponential, "Should not detect exponential growth with only one data point")
}
