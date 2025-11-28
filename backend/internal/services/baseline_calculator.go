package services

import (
	"context"
	"log"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BaselineCalculatorService calculates user activity baselines
type BaselineCalculatorService struct {
	pool         *pgxpool.Pool
	baselineRepo *models.UserBaselineRepository
}

// NewBaselineCalculatorService creates a new baseline calculator service
func NewBaselineCalculatorService(
	pool *pgxpool.Pool,
	baselineRepo *models.UserBaselineRepository,
) *BaselineCalculatorService {
	return &BaselineCalculatorService{
		pool:         pool,
		baselineRepo: baselineRepo,
	}
}

// CalculateBaselines recalculates baselines for all active users
// Uses adaptive time windows based on user experience level
func (s *BaselineCalculatorService) CalculateBaselines(ctx context.Context) error {
	log.Println("Starting baseline calculation for all users...")

	// Get all users who have created content
	query := `
		SELECT DISTINCT author_id
		FROM (
			SELECT author_id FROM platform_posts WHERE created_at >= NOW() - INTERVAL '90 days'
			UNION
			SELECT user_id as author_id FROM post_comments WHERE created_at >= NOW() - INTERVAL '90 days'
		) AS active_users
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		userIDs = append(userIDs, userID)
	}

	log.Printf("Calculating baselines for %d users", len(userIDs))

	// Calculate baseline for each user
	for _, userID := range userIDs {
		if err := s.calculateUserBaseline(ctx, userID); err != nil {
			log.Printf("Failed to calculate baseline for user %d: %v", userID, err)
			continue
		}
	}

	log.Println("Baseline calculation complete")
	return nil
}

// calculateUserBaseline calculates the baseline for a single user
func (s *BaselineCalculatorService) calculateUserBaseline(ctx context.Context, userID int) error {
	// Determine experience level to choose adaptive window
	experienceLevel, err := s.baselineRepo.GetExperienceLevel(ctx, userID)
	if err != nil {
		// User has no baseline yet, treat as new
		experienceLevel = "new"
	}

	// Choose time window based on experience
	var windowDays int
	switch experienceLevel {
	case "new": // 0-50 posts+comments
		windowDays = 7
	case "regular": // 51-500 posts+comments
		windowDays = 30
	case "power": // 500+ posts+comments
		windowDays = 90
	default:
		windowDays = 30
	}

	// Count total posts and comments
	totalPosts, totalComments, err := s.countUserContent(ctx, userID)
	if err != nil {
		return err
	}

	// Calculate average votes/hour for posts
	avgPostVPH, err := s.calculateAvgVotesPerHour(ctx, userID, "post", windowDays)
	if err != nil {
		return err
	}

	// Calculate average votes/hour for comments
	avgCommentVPH, err := s.calculateAvgVotesPerHour(ctx, userID, "comment", windowDays)
	if err != nil {
		return err
	}

	// Create or update baseline
	baseline := &models.UserBaseline{
		UserID:                 userID,
		AvgPostVotesPerHour:    avgPostVPH,
		AvgCommentVotesPerHour: avgCommentVPH,
		TotalPosts:             totalPosts,
		TotalComments:          totalComments,
		LastCalculatedAt:       time.Now(),
	}

	return s.baselineRepo.CreateOrUpdate(ctx, baseline)
}

// countUserContent counts total posts and comments for a user
func (s *BaselineCalculatorService) countUserContent(ctx context.Context, userID int) (int, int, error) {
	query := `
		SELECT
			COALESCE((SELECT COUNT(*) FROM platform_posts WHERE author_id = $1), 0) as post_count,
			COALESCE((SELECT COUNT(*) FROM post_comments WHERE user_id = $1), 0) as comment_count
	`

	var postCount, commentCount int
	err := s.pool.QueryRow(ctx, query, userID).Scan(&postCount, &commentCount)
	return postCount, commentCount, err
}

// calculateAvgVotesPerHour calculates average votes per hour for user's content
func (s *BaselineCalculatorService) calculateAvgVotesPerHour(
	ctx context.Context,
	userID int,
	contentType string,
	windowDays int,
) (float64, error) {
	query := `
		WITH content_votes AS (
			SELECT
				content_id,
				COUNT(*) as total_votes,
				MIN(created_at) as first_vote,
				MAX(created_at) as last_vote
			FROM vote_activity
			WHERE author_id = $1
			AND content_type = $2
			AND created_at >= NOW() - ($3 || ' days')::INTERVAL
			GROUP BY content_id
		),
		hourly_rates AS (
			SELECT
				content_id,
				total_votes,
				GREATEST(
					EXTRACT(EPOCH FROM (last_vote - first_vote)) / 3600,
					1
				) as hours_active,
				total_votes / GREATEST(
					EXTRACT(EPOCH FROM (last_vote - first_vote)) / 3600,
					1
				) as votes_per_hour
			FROM content_votes
			WHERE total_votes > 0
		)
		SELECT COALESCE(AVG(votes_per_hour), 0)
		FROM hourly_rates
	`

	var avgVPH float64
	err := s.pool.QueryRow(ctx, query, userID, contentType, windowDays).Scan(&avgVPH)
	return avgVPH, err
}

// CleanupOldVoteActivity deletes vote activity older than 7 days
func (s *BaselineCalculatorService) CleanupOldVoteActivity(ctx context.Context) error {
	query := `
		DELETE FROM vote_activity
		WHERE created_at < NOW() - INTERVAL '7 days'
	`

	result, err := s.pool.Exec(ctx, query)
	if err != nil {
		return err
	}

	log.Printf("Cleaned up %d old vote activity records", result.RowsAffected())
	return nil
}
