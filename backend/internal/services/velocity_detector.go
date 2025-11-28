package services

import (
	"context"

	"github.com/chatreddit/backend/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RuleBasedVelocityDetector implements simple rule-based velocity detection
// Can be replaced with ML-based detector later without changing the interface
type RuleBasedVelocityDetector struct {
	pool         *pgxpool.Pool
	baselineRepo *models.UserBaselineRepository
}

// NewRuleBasedVelocityDetector creates a new rule-based velocity detector
func NewRuleBasedVelocityDetector(
	pool *pgxpool.Pool,
	baselineRepo *models.UserBaselineRepository,
) *RuleBasedVelocityDetector {
	return &RuleBasedVelocityDetector{
		pool:         pool,
		baselineRepo: baselineRepo,
	}
}

// ShouldNotify determines if velocity notification should be sent
// Logic:
// - New users (<10 posts+comments): Notify at 5+ votes/hour
// - Experienced users: Notify only if votes/hour > baseline × 1.5
func (d *RuleBasedVelocityDetector) ShouldNotify(
	ctx context.Context,
	userID int,
	contentType string,
	votesPerHour float64,
) (bool, error) {
	// Get user baseline
	baseline, err := d.baselineRepo.GetByUserID(ctx, userID)
	if err != nil {
		// User has no baseline yet, treat as new user
		return votesPerHour >= 5.0, nil
	}

	// Determine if user is new
	totalContent := baseline.TotalPosts + baseline.TotalComments
	if totalContent < 10 {
		// New user: notify at 5+ votes/hour
		return votesPerHour >= 5.0, nil
	}

	// Experienced user: compare to baseline
	var userBaseline float64
	if contentType == "post" {
		userBaseline = baseline.AvgPostVotesPerHour
	} else {
		userBaseline = baseline.AvgCommentVotesPerHour
	}

	// Notify if current velocity exceeds baseline by 50%
	threshold := userBaseline * 1.5
	return votesPerHour > threshold, nil
}

// IsExponentialGrowth determines if content is experiencing exponential growth
// Logic: Current hour velocity is 2x previous hour velocity
func (d *RuleBasedVelocityDetector) IsExponentialGrowth(
	ctx context.Context,
	contentType string,
	contentID int,
	currentVPH float64,
) (bool, error) {
	// Get votes from previous hour
	query := `
		SELECT COUNT(*)
		FROM vote_activity
		WHERE content_type = $1
		AND content_id = $2
		AND created_at >= NOW() - INTERVAL '2 hours'
		AND created_at < NOW() - INTERVAL '1 hour'
	`

	var prevHourVotes int
	err := d.pool.QueryRow(ctx, query, contentType, contentID).Scan(&prevHourVotes)
	if err != nil {
		return false, err
	}

	// If previous hour had 0 votes, can't determine exponential growth
	if prevHourVotes == 0 {
		return false, nil
	}

	// Get votes from current hour
	query = `
		SELECT COUNT(*)
		FROM vote_activity
		WHERE content_type = $1
		AND content_id = $2
		AND created_at >= NOW() - INTERVAL '1 hour'
	`

	var currentHourVotes int
	err = d.pool.QueryRow(ctx, query, contentType, contentID).Scan(&currentHourVotes)
	if err != nil {
		return false, err
	}

	// Exponential growth: current hour is 2x previous hour
	return currentHourVotes >= (prevHourVotes * 2), nil
}
