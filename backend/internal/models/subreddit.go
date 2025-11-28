package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Subreddit represents a site-local community
type Subreddit struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedBy   *int      `json:"created_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// SubredditRepository manages subreddits
type SubredditRepository struct {
	pool *pgxpool.Pool
}

// NewSubredditRepository creates a new repository
func NewSubredditRepository(pool *pgxpool.Pool) *SubredditRepository {
	return &SubredditRepository{pool: pool}
}

// Create creates a subreddit
func (r *SubredditRepository) Create(ctx context.Context, sr *Subreddit) error {
	query := `
		INSERT INTO subreddits (name, description, created_by)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	return r.pool.QueryRow(ctx, query, sr.Name, sr.Description, sr.CreatedBy).Scan(&sr.ID, &sr.CreatedAt)
}

// GetByName fetches subreddit by name
func (r *SubredditRepository) GetByName(ctx context.Context, name string) (*Subreddit, error) {
	sr := &Subreddit{}
	query := `
		SELECT id, name, description, created_by, created_at
		FROM subreddits
		WHERE name = $1
	`
	err := r.pool.QueryRow(ctx, query, name).Scan(&sr.ID, &sr.Name, &sr.Description, &sr.CreatedBy, &sr.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return sr, nil
}

// GetByID fetches subreddit by id
func (r *SubredditRepository) GetByID(ctx context.Context, id int) (*Subreddit, error) {
	sr := &Subreddit{}
	query := `
		SELECT id, name, description, created_by, created_at
		FROM subreddits
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(&sr.ID, &sr.Name, &sr.Description, &sr.CreatedBy, &sr.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return sr, nil
}

// List returns paginated subreddits
func (r *SubredditRepository) List(ctx context.Context, limit, offset int) ([]*Subreddit, error) {
	query := `
		SELECT id, name, description, created_by, created_at
		FROM subreddits
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []*Subreddit
	for rows.Next() {
		s := &Subreddit{}
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.CreatedBy, &s.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}
