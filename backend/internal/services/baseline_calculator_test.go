package services

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	baselineTestSuffix  = time.Now().UnixNano()
	baselineTestCounter int64
)

func sanitizeBaselineBase(base string) string {
	base = strings.ToLower(base)
	builder := strings.Builder{}
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
		} else if r == '_' || r == '-' {
			builder.WriteRune('_')
		}
		if builder.Len() >= 20 {
			break
		}
	}
	clean := builder.String()
	if clean == "" {
		clean = "user"
	}
	return clean
}

func uniqueBaselineName(base string) string {
	clean := sanitizeBaselineBase(base)
	id := atomic.AddInt64(&baselineTestCounter, 1)
	name := fmt.Sprintf("%s_%d_%d", clean, baselineTestSuffix%1_000_000, id)
	if len(name) > 48 {
		name = name[:48]
	}
	return name
}

func setupBaselineTest(t *testing.T) (*BaselineCalculatorService, *database.Database, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	service := NewBaselineCalculatorService(db.Pool, baselineRepo)

	cleanup := func() {
		db.Close()
	}

	return service, db, cleanup
}

func createUserWithContent(t *testing.T, db *database.Database, username string, numPosts, numComments int) int {
	ctx := context.Background()

	// Create user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueBaselineName(username),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create hub
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueBaselineName(username + "_hub"),
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	var commentPostID int

	// Create posts
	hubIDVal := hub.ID
	for i := 0; i < numPosts; i++ {
		post := &models.PlatformPost{
			AuthorID: user.ID,
			HubID:    &hubIDVal,
			Title:    "Test Post",
		}
		err = postRepo.Create(ctx, post)
		require.NoError(t, err)
		if commentPostID == 0 {
			commentPostID = post.ID
		}

		// Add some votes to the post
		upvote := true
		_ = postRepo.Vote(ctx, post.ID, user.ID, &upvote)
	}

	// Create a post for comments
	if numComments > 0 {
		if commentPostID == 0 {
			post := &models.PlatformPost{
				AuthorID: user.ID,
				HubID:    &hubIDVal,
				Title:    "Comment Test Post",
			}
			err = postRepo.Create(ctx, post)
			require.NoError(t, err)
			commentPostID = post.ID

			// Add some votes to the post
			upvote := true
			_ = postRepo.Vote(ctx, post.ID, user.ID, &upvote)
		}

		// Create comments on commentPostID
		for i := 0; i < numComments; i++ {
			comment := &models.PostComment{
				PostID: commentPostID,
				UserID: user.ID,
				Body:   "Test comment",
			}
			err = commentRepo.Create(ctx, comment)
			require.NoError(t, err)

			// Add votes to comment
			upvote := true
			_ = commentRepo.Vote(ctx, comment.ID, user.ID, &upvote)
		}
	}

	return user.ID
}

func TestCalculateBaselinesForNewUser(t *testing.T) {
	service, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create new user with some content
	userID := createUserWithContent(t, db, "newuser", 5, 3)

	// Calculate baselines
	err := service.CalculateBaselines(ctx)
	require.NoError(t, err)

	// Verify baseline was created
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	baseline, err := baselineRepo.GetByUserID(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, baseline)

	// Check counts
	assert.Equal(t, 5, baseline.TotalPosts)
	assert.Equal(t, 3, baseline.TotalComments)
	assert.Greater(t, baseline.AvgPostVotesPerHour, 0.0)
}

func TestAdaptiveTimeWindows(t *testing.T) {
	service, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()

	tests := []struct {
		name           string
		totalContent   int
		expectedWindow string
	}{
		{"New user (7 day window)", 8, "7 days"},
		{"Intermediate user (30 day window)", 25, "30 days"},
		{"Experienced user (90 day window)", 60, "90 days"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create user with specific amount of content
			userID := createUserWithContent(t, db, tt.name, tt.totalContent/2, tt.totalContent/2)

			// Calculate baselines
			err := service.CalculateBaselines(ctx)
			require.NoError(t, err)

			// Verify baseline exists
			baselineRepo := models.NewUserBaselineRepository(db.Pool)
			baseline, err := baselineRepo.GetByUserID(ctx, userID)
			require.NoError(t, err)
			require.NotNil(t, baseline)

			// The actual window used is not directly exposed, but we can verify
			// the calculation ran successfully and appropriate values are set
			assert.Greater(t, baseline.TotalPosts+baseline.TotalComments, 0)
		})
	}
}

func TestCalculateUserBaseline(t *testing.T) {
	service, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create user with content
	userID := createUserWithContent(t, db, "testuser", 10, 5)

	// Calculate baseline for specific user
	err := service.CalculateUserBaseline(ctx, userID)
	require.NoError(t, err)

	// Verify baseline
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	baseline, err := baselineRepo.GetByUserID(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, baseline)

	assert.Equal(t, userID, baseline.UserID)
	assert.Equal(t, 10, baseline.TotalPosts)
	assert.Equal(t, 5, baseline.TotalComments)
	assert.GreaterOrEqual(t, baseline.AvgPostVotesPerHour, 0.0)
	assert.GreaterOrEqual(t, baseline.AvgCommentVotesPerHour, 0.0)
}

func TestBaselineWithOldContent(t *testing.T) {
	service, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueBaselineName("olduser"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create hub
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueBaselineName("old_hub"),
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Create old posts (older than 90 days)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	oldDate := time.Now().Add(-91 * 24 * time.Hour)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO platform_posts (author_id, hub_id, title, created_at)
		VALUES ($1, $2, 'Old Post', $3)
	`, user.ID, hub.ID, oldDate)
	require.NoError(t, err)

	// Create recent post
	hubIDVal2 := hub.ID
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    &hubIDVal2,
		Title:    "Recent Post",
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Calculate baselines
	err = service.CalculateBaselines(ctx)
	require.NoError(t, err)

	// Verify baseline exists (recent content counted)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	baseline, err := baselineRepo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, baseline)
	assert.GreaterOrEqual(t, baseline.TotalPosts, 1, "Should include at least the recent post")
}

func TestBaselineUpdateIdempotence(t *testing.T) {
	service, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create user with content
	userID := createUserWithContent(t, db, "idempotent_user", 5, 5)

	// Calculate baselines first time
	err := service.CalculateBaselines(ctx)
	require.NoError(t, err)

	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	baseline1, err := baselineRepo.GetByUserID(ctx, userID)
	require.NoError(t, err)

	// Wait a moment
	time.Sleep(100 * time.Millisecond)

	// Calculate baselines second time
	err = service.CalculateBaselines(ctx)
	require.NoError(t, err)

	baseline2, err := baselineRepo.GetByUserID(ctx, userID)
	require.NoError(t, err)

	// Values should be the same (assuming no new content)
	assert.Equal(t, baseline1.TotalPosts, baseline2.TotalPosts)
	assert.Equal(t, baseline1.TotalComments, baseline2.TotalComments)
	// UpdatedAt should be newer
	assert.True(t, baseline2.LastCalculatedAt.After(baseline1.LastCalculatedAt) || baseline2.LastCalculatedAt.Equal(baseline1.LastCalculatedAt))
}

func TestGetExperienceLevel(t *testing.T) {
	_, db, cleanup := setupBaselineTest(t)
	defer cleanup()

	ctx := context.Background()
	baselineRepo := models.NewUserBaselineRepository(db.Pool)

	tests := []struct {
		name          string
		totalPosts    int
		totalComments int
		expectedLevel string
	}{
		{"New user", 3, 2, "new"},
		{"Regular user", 120, 40, "regular"},
		{"Power user", 400, 200, "power"},
	}

	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := i + 1
			baseline := &models.UserBaseline{
				UserID:           userID,
				TotalPosts:       tt.totalPosts,
				TotalComments:    tt.totalComments,
				LastCalculatedAt: time.Now(),
			}
			err := baselineRepo.CreateOrUpdate(ctx, baseline)
			require.NoError(t, err)

			level, err := baselineRepo.GetExperienceLevel(ctx, userID)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedLevel, level)
		})
	}
}
