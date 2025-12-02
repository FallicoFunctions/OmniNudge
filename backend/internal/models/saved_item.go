package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SavedItemsRepository handles saved posts and reddit comments
type SavedItemsRepository struct {
	pool *pgxpool.Pool
}

// SavedPostOverview represents a lightweight saved post entry
type SavedPostOverview struct {
	ID             int       `json:"id"`
	Title          string    `json:"title"`
	HubName        string    `json:"hub_name"`
	AuthorUsername string    `json:"author_username"`
	Score          int       `json:"score"`
	CommentCount   int       `json:"comment_count"`
	CreatedAt      time.Time `json:"created_at"`
}

// SavedPostComment represents a saved comment on a platform post
type SavedPostComment struct {
	CommentID int       `json:"comment_id"`
	PostID    int       `json:"post_id"`
	PostTitle string    `json:"post_title"`
	HubName   string    `json:"hub_name"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	Score     int       `json:"score"`
	CreatedAt time.Time `json:"created_at"`
}

// SavedRedditPost represents a saved Reddit post
type SavedRedditPost struct {
	Subreddit     string    `json:"subreddit"`
	RedditPostID  string    `json:"reddit_post_id"`
	SavedAt       time.Time `json:"saved_at"`
}

// NewSavedItemsRepository creates a repository for saved content
func NewSavedItemsRepository(pool *pgxpool.Pool) *SavedItemsRepository {
	return &SavedItemsRepository{pool: pool}
}

// SavePost stores a post in the user's saved list
func (r *SavedItemsRepository) SavePost(ctx context.Context, userID, postID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO saved_posts (user_id, post_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, post_id) DO NOTHING
	`, userID, postID)
	return err
}

// RemovePost removes a post from the user's saved list
func (r *SavedItemsRepository) RemovePost(ctx context.Context, userID, postID int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM saved_posts WHERE user_id = $1 AND post_id = $2`, userID, postID)
	return err
}

// SaveRedditComment stores a reddit comment in the user's saved list
func (r *SavedItemsRepository) SaveRedditComment(ctx context.Context, userID, commentID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO saved_reddit_comments (user_id, comment_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, comment_id) DO NOTHING
	`, userID, commentID)
	return err
}

// RemoveRedditComment removes a reddit comment from saved list
func (r *SavedItemsRepository) RemoveRedditComment(ctx context.Context, userID, commentID int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM saved_reddit_comments WHERE user_id = $1 AND comment_id = $2`, userID, commentID)
	return err
}

// SavePostComment stores a platform comment in the user's saved list
func (r *SavedItemsRepository) SavePostComment(ctx context.Context, userID, commentID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO saved_post_comments (user_id, comment_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, comment_id) DO NOTHING
	`, userID, commentID)
	return err
}

// RemovePostComment removes a platform comment from saved list
func (r *SavedItemsRepository) RemovePostComment(ctx context.Context, userID, commentID int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM saved_post_comments WHERE user_id = $1 AND comment_id = $2`, userID, commentID)
	return err
}

// IsPostSaved checks if a post is saved by the user
func (r *SavedItemsRepository) IsPostSaved(ctx context.Context, userID, postID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM saved_posts WHERE user_id = $1 AND post_id = $2
		)
	`, userID, postID).Scan(&exists)
	return exists, err
}

// IsRedditCommentSaved checks if a reddit comment is saved by the user
func (r *SavedItemsRepository) IsRedditCommentSaved(ctx context.Context, userID, commentID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM saved_reddit_comments WHERE user_id = $1 AND comment_id = $2
		)
	`, userID, commentID).Scan(&exists)
	return exists, err
}

// GetSavedPosts returns lightweight platform posts saved by the user
func (r *SavedItemsRepository) GetSavedPosts(ctx context.Context, userID int) ([]*SavedPostOverview, error) {
	query := `
		SELECT p.id, p.title, h.name AS hub_name, u.username AS author_username,
		       p.score, p.num_comments, p.created_at
		FROM saved_posts sp
		JOIN platform_posts p ON p.id = sp.post_id AND p.is_deleted = FALSE
		JOIN hubs h ON h.id = p.hub_id
		JOIN users u ON u.id = p.author_id
		WHERE sp.user_id = $1 AND p.is_deleted = FALSE
		ORDER BY sp.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*SavedPostOverview
	for rows.Next() {
		post := &SavedPostOverview{}
		if err := rows.Scan(
			&post.ID,
			&post.Title,
			&post.HubName,
			&post.AuthorUsername,
			&post.Score,
			&post.CommentCount,
			&post.CreatedAt,
		); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

// GetSavedRedditComments returns saved reddit comments for the user
func (r *SavedItemsRepository) GetSavedRedditComments(ctx context.Context, userID int) ([]*RedditPostComment, error) {
	query := `
		SELECT
			rc.id, rc.subreddit, rc.reddit_post_id, rc.reddit_post_title, rc.user_id, u.username,
			rc.parent_comment_id, rc.content, rc.score, rc.inbox_replies_disabled,
			rc.created_at, rc.updated_at, rc.deleted_at
		FROM saved_reddit_comments src
		JOIN reddit_post_comments rc ON rc.id = src.comment_id
		JOIN users u ON u.id = rc.user_id
		WHERE src.user_id = $1 AND (rc.deleted_at IS NULL OR rc.content = $2)
		ORDER BY src.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID, DeletedCommentPlaceholder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*RedditPostComment
	for rows.Next() {
		var comment RedditPostComment
		if err := rows.Scan(
			&comment.ID,
			&comment.Subreddit,
			&comment.RedditPostID,
			&comment.RedditPostTitle,
			&comment.UserID,
			&comment.Username,
			&comment.ParentCommentID,
			&comment.Content,
			&comment.Score,
			&comment.InboxRepliesDisabled,
			&comment.CreatedAt,
			&comment.UpdatedAt,
			&comment.DeletedAt,
		); err != nil {
			return nil, err
		}
		comment.SanitizeDeletedPlaceholder()
		comments = append(comments, &comment)
	}
	return comments, rows.Err()
}

// GetSavedPostComments returns platform comments saved by the user
func (r *SavedItemsRepository) GetSavedPostComments(ctx context.Context, userID int) ([]*SavedPostComment, error) {
	query := `
		SELECT
			pc.id,
			pc.post_id,
			pp.title AS post_title,
			h.name AS hub_name,
			u.username,
			pc.body,
			pc.score,
			pc.created_at,
			pc.is_deleted
		FROM saved_post_comments spc
		JOIN post_comments pc ON pc.id = spc.comment_id
		JOIN platform_posts pp ON pp.id = pc.post_id
		JOIN hubs h ON h.id = pp.hub_id
		JOIN users u ON u.id = pc.user_id
		WHERE spc.user_id = $1 AND (pc.is_deleted = FALSE OR pc.body = $2)
		ORDER BY spc.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID, DeletedCommentPlaceholder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*SavedPostComment
	for rows.Next() {
		var comment SavedPostComment
		var isDeleted bool
		if err := rows.Scan(
			&comment.CommentID,
			&comment.PostID,
			&comment.PostTitle,
			&comment.HubName,
			&comment.Username,
			&comment.Content,
			&comment.Score,
			&comment.CreatedAt,
			&isDeleted,
		); err != nil {
			return nil, err
		}
		if isDeleted || comment.Content == DeletedCommentPlaceholder {
			comment.Content = DeletedCommentPlaceholder
			comment.Username = DeletedCommentPlaceholder
		}
		comments = append(comments, &comment)
	}

	return comments, rows.Err()
}

// SaveRedditPost stores a Reddit post in the user's saved list
func (r *SavedItemsRepository) SaveRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO saved_reddit_posts (user_id, subreddit, reddit_post_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, subreddit, reddit_post_id) DO NOTHING
	`, userID, subreddit, redditPostID)
	return err
}

// RemoveRedditPost removes a Reddit post from the user's saved list
func (r *SavedItemsRepository) RemoveRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM saved_reddit_posts
		WHERE user_id = $1 AND subreddit = $2 AND reddit_post_id = $3
	`, userID, subreddit, redditPostID)
	return err
}

// IsRedditPostSaved checks if a Reddit post is saved by the user
func (r *SavedItemsRepository) IsRedditPostSaved(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM saved_reddit_posts
			WHERE user_id = $1 AND subreddit = $2 AND reddit_post_id = $3
		)
	`, userID, subreddit, redditPostID).Scan(&exists)
	return exists, err
}

// GetSavedRedditPosts returns saved Reddit posts for the user
func (r *SavedItemsRepository) GetSavedRedditPosts(ctx context.Context, userID int) ([]*SavedRedditPost, error) {
	query := `
		SELECT subreddit, reddit_post_id, created_at
		FROM saved_reddit_posts
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*SavedRedditPost
	for rows.Next() {
		post := &SavedRedditPost{}
		if err := rows.Scan(&post.Subreddit, &post.RedditPostID, &post.SavedAt); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

// HidePost hides a platform post for the user
func (r *SavedItemsRepository) HidePost(ctx context.Context, userID, postID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hidden_posts (user_id, post_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, post_id) DO NOTHING
	`, userID, postID)
	return err
}

// UnhidePost unhides a platform post for the user
func (r *SavedItemsRepository) UnhidePost(ctx context.Context, userID, postID int) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM hidden_posts
		WHERE user_id = $1 AND post_id = $2
	`, userID, postID)
	return err
}

// IsPostHidden checks if a platform post is hidden by the user
func (r *SavedItemsRepository) IsPostHidden(ctx context.Context, userID, postID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM hidden_posts
			WHERE user_id = $1 AND post_id = $2
		)
	`, userID, postID).Scan(&exists)
	return exists, err
}

// GetHiddenPosts returns hidden platform posts for the user
func (r *SavedItemsRepository) GetHiddenPosts(ctx context.Context, userID int) ([]*SavedPostOverview, error) {
	query := `
		SELECT p.id, p.title, h.name AS hub_name, u.username AS author_username,
		       p.score, p.num_comments, p.created_at
		FROM hidden_posts hp
		JOIN platform_posts p ON p.id = hp.post_id AND p.is_deleted = FALSE
		JOIN hubs h ON h.id = p.hub_id
		JOIN users u ON u.id = p.author_id
		WHERE hp.user_id = $1 AND p.is_deleted = FALSE
		ORDER BY hp.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*SavedPostOverview
	for rows.Next() {
		post := &SavedPostOverview{}
		if err := rows.Scan(
			&post.ID,
			&post.Title,
			&post.HubName,
			&post.AuthorUsername,
			&post.Score,
			&post.CommentCount,
			&post.CreatedAt,
		); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

// HideRedditPost hides a Reddit post for the user
func (r *SavedItemsRepository) HideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hidden_reddit_posts (user_id, subreddit, reddit_post_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, subreddit, reddit_post_id) DO NOTHING
	`, userID, subreddit, redditPostID)
	return err
}

// UnhideRedditPost unhides a Reddit post for the user
func (r *SavedItemsRepository) UnhideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM hidden_reddit_posts
		WHERE user_id = $1 AND subreddit = $2 AND reddit_post_id = $3
	`, userID, subreddit, redditPostID)
	return err
}

// IsRedditPostHidden checks if a Reddit post is hidden by the user
func (r *SavedItemsRepository) IsRedditPostHidden(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM hidden_reddit_posts
			WHERE user_id = $1 AND subreddit = $2 AND reddit_post_id = $3
		)
	`, userID, subreddit, redditPostID).Scan(&exists)
	return exists, err
}

// GetHiddenRedditPosts returns hidden Reddit posts for the user
func (r *SavedItemsRepository) GetHiddenRedditPosts(ctx context.Context, userID int) ([]*SavedRedditPost, error) {
	query := `
		SELECT subreddit, reddit_post_id, created_at
		FROM hidden_reddit_posts
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*SavedRedditPost
	for rows.Next() {
		post := &SavedRedditPost{}
		if err := rows.Scan(&post.Subreddit, &post.RedditPostID, &post.SavedAt); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}
