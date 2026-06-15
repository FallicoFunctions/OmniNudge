package models

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WallPostMedia represents a single photo or video attached to a wall post.
type WallPostMedia struct {
	URL          string `json:"url"`
	MediaType    string `json:"media_type,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	Width        int    `json:"width,omitempty"`
	Height       int    `json:"height,omitempty"`
	Duration     int    `json:"duration,omitempty"`
}

// WallPost represents a post made on a user's profile wall (Facebook-wall style),
// distinct from the author's hub/subreddit posts.
type WallPost struct {
	ID               int             `json:"id"`
	ProfileUserID    int             `json:"profile_user_id"`
	AuthorID         int             `json:"author_id"`
	AuthorUsername   string          `json:"author_username"`
	AuthorAvatarURL  *string         `json:"author_avatar_url,omitempty"`
	Body             string          `json:"body"`
	Media            []WallPostMedia `json:"media,omitempty"`
	LikeCount        int             `json:"like_count"`
	DislikeCount     int             `json:"dislike_count"`
	CommentCount     int             `json:"comment_count"`
	LikedByViewer    bool            `json:"liked_by_viewer"`
	DislikedByViewer bool            `json:"disliked_by_viewer"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

// WallPostComment represents a comment on a wall post.
type WallPostComment struct {
	ID               int       `json:"id"`
	WallPostID       int       `json:"wall_post_id"`
	AuthorID         int       `json:"author_id"`
	AuthorUsername   string    `json:"author_username"`
	AuthorAvatarURL  *string   `json:"author_avatar_url,omitempty"`
	Body             string    `json:"body"`
	LikeCount        int       `json:"like_count"`
	DislikeCount     int       `json:"dislike_count"`
	LikedByViewer    bool      `json:"liked_by_viewer"`
	DislikedByViewer bool      `json:"disliked_by_viewer"`
	CreatedAt        time.Time `json:"created_at"`
}

// ReactionType identifies a like/dislike reaction on a wall post or comment.
type ReactionType string

const (
	ReactionLike    ReactionType = "like"
	ReactionDislike ReactionType = "dislike"
)

// WallPostRepository handles database operations for profile wall posts.
type WallPostRepository struct {
	pool *pgxpool.Pool
}

// NewWallPostRepository creates a new wall post repository.
func NewWallPostRepository(pool *pgxpool.Pool) *WallPostRepository {
	return &WallPostRepository{pool: pool}
}

// Create inserts a new wall post.
func (r *WallPostRepository) Create(ctx context.Context, post *WallPost) error {
	mediaJSON, err := json.Marshal(post.Media)
	if err != nil {
		return fmt.Errorf("marshal wall post media: %w", err)
	}

	query := `
		INSERT INTO wall_posts (profile_user_id, author_id, body, media)
		VALUES ($1, $2, $3, $4)
		RETURNING id, like_count, comment_count, created_at, updated_at
	`
	return r.pool.QueryRow(ctx, query, post.ProfileUserID, post.AuthorID, post.Body, mediaJSON).Scan(
		&post.ID,
		&post.LikeCount,
		&post.CommentCount,
		&post.CreatedAt,
		&post.UpdatedAt,
	)
}

// GetByProfileUserID returns wall posts for a profile, newest first, with the
// viewer's like status attached.
func (r *WallPostRepository) GetByProfileUserID(ctx context.Context, profileUserID, viewerID, limit, offset int) ([]*WallPost, error) {
	query := `
		SELECT wp.id, wp.profile_user_id, wp.author_id, u.username, u.avatar_url,
		       wp.body, wp.media, wp.like_count, wp.dislike_count, wp.comment_count, wp.created_at, wp.updated_at,
		       COALESCE(wl.reaction_type = 'like', FALSE) AS liked_by_viewer,
		       COALESCE(wl.reaction_type = 'dislike', FALSE) AS disliked_by_viewer
		FROM wall_posts wp
		JOIN users u ON u.id = wp.author_id
		LEFT JOIN wall_post_likes wl ON wl.wall_post_id = wp.id AND wl.user_id = $4
		WHERE wp.profile_user_id = $1 AND wp.is_deleted = FALSE
		ORDER BY wp.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, profileUserID, limit, offset, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := []*WallPost{}
	for rows.Next() {
		post := &WallPost{}
		var mediaBytes []byte
		if err := rows.Scan(
			&post.ID,
			&post.ProfileUserID,
			&post.AuthorID,
			&post.AuthorUsername,
			&post.AuthorAvatarURL,
			&post.Body,
			&mediaBytes,
			&post.LikeCount,
			&post.DislikeCount,
			&post.CommentCount,
			&post.CreatedAt,
			&post.UpdatedAt,
			&post.LikedByViewer,
			&post.DislikedByViewer,
		); err != nil {
			return nil, err
		}
		if len(mediaBytes) > 0 && string(mediaBytes) != "null" {
			if err := json.Unmarshal(mediaBytes, &post.Media); err != nil {
				return nil, fmt.Errorf("unmarshal wall post media: %w", err)
			}
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

// GetByID returns a single wall post by id, or nil if not found / deleted.
func (r *WallPostRepository) GetByID(ctx context.Context, id int) (*WallPost, error) {
	query := `
		SELECT wp.id, wp.profile_user_id, wp.author_id, u.username, u.avatar_url,
		       wp.body, wp.like_count, wp.dislike_count, wp.comment_count, wp.created_at, wp.updated_at
		FROM wall_posts wp
		JOIN users u ON u.id = wp.author_id
		WHERE wp.id = $1 AND wp.is_deleted = FALSE
	`

	post := &WallPost{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&post.ID,
		&post.ProfileUserID,
		&post.AuthorID,
		&post.AuthorUsername,
		&post.AuthorAvatarURL,
		&post.Body,
		&post.LikeCount,
		&post.DislikeCount,
		&post.CommentCount,
		&post.CreatedAt,
		&post.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return post, nil
}

// SoftDelete marks a wall post as deleted.
func (r *WallPostRepository) SoftDelete(ctx context.Context, id int) error {
	_, err := r.pool.Exec(ctx, `UPDATE wall_posts SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`, id)
	return err
}

// setReaction implements the shared like/dislike toggle: choosing the reaction
// the viewer already has clears it, choosing the other reaction switches to it
// (enforcing like/dislike mutual exclusivity), and the parent row's like/dislike
// counts are adjusted accordingly. reactionTable/entityColumn identify the
// per-user reaction table (e.g. wall_post_likes/wall_post_id), and parentTable
// is the table (wall_posts/wall_post_comments) whose like_count/dislike_count
// and id = entityID get updated. All three are fixed internal identifiers, not
// user input.
func (r *WallPostRepository) setReaction(ctx context.Context, reactionTable, entityColumn, parentTable string, entityID, userID int, reaction ReactionType) (liked, disliked bool, likeCount, dislikeCount int, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, false, 0, 0, err
	}
	defer tx.Rollback(ctx)

	var existing string
	hasExisting := true
	selectQuery := fmt.Sprintf(`SELECT reaction_type FROM %s WHERE %s = $1 AND user_id = $2`, reactionTable, entityColumn)
	err = tx.QueryRow(ctx, selectQuery, entityID, userID).Scan(&existing)
	if err == pgx.ErrNoRows {
		hasExisting = false
		err = nil
	} else if err != nil {
		return false, false, 0, 0, err
	}

	var likeDelta, dislikeDelta int
	switch {
	case !hasExisting:
		insertQuery := fmt.Sprintf(`INSERT INTO %s (%s, user_id, reaction_type) VALUES ($1, $2, $3)`, reactionTable, entityColumn)
		if _, err = tx.Exec(ctx, insertQuery, entityID, userID, reaction); err != nil {
			return false, false, 0, 0, err
		}
		if reaction == ReactionLike {
			likeDelta, liked = 1, true
		} else {
			dislikeDelta, disliked = 1, true
		}
	case existing == string(reaction):
		deleteQuery := fmt.Sprintf(`DELETE FROM %s WHERE %s = $1 AND user_id = $2`, reactionTable, entityColumn)
		if _, err = tx.Exec(ctx, deleteQuery, entityID, userID); err != nil {
			return false, false, 0, 0, err
		}
		if reaction == ReactionLike {
			likeDelta = -1
		} else {
			dislikeDelta = -1
		}
	default:
		updateQuery := fmt.Sprintf(`UPDATE %s SET reaction_type = $3, created_at = NOW() WHERE %s = $1 AND user_id = $2`, reactionTable, entityColumn)
		if _, err = tx.Exec(ctx, updateQuery, entityID, userID, reaction); err != nil {
			return false, false, 0, 0, err
		}
		if reaction == ReactionLike {
			likeDelta, dislikeDelta, liked = 1, -1, true
		} else {
			likeDelta, dislikeDelta, disliked = -1, 1, true
		}
	}

	countQuery := fmt.Sprintf(`
		UPDATE %s
		SET like_count = GREATEST(like_count + $1, 0), dislike_count = GREATEST(dislike_count + $2, 0)
		WHERE id = $3
		RETURNING like_count, dislike_count
	`, parentTable)
	if err = tx.QueryRow(ctx, countQuery, likeDelta, dislikeDelta, entityID).Scan(&likeCount, &dislikeCount); err != nil {
		return false, false, 0, 0, err
	}

	if err = tx.Commit(ctx); err != nil {
		return false, false, 0, 0, err
	}
	return liked, disliked, likeCount, dislikeCount, nil
}

// SetPostReaction sets, switches, or clears the viewer's like/dislike on a wall
// post. See setReaction for the shared toggle semantics.
func (r *WallPostRepository) SetPostReaction(ctx context.Context, wallPostID, userID int, reaction ReactionType) (liked, disliked bool, likeCount, dislikeCount int, err error) {
	return r.setReaction(ctx, "wall_post_likes", "wall_post_id", "wall_posts", wallPostID, userID, reaction)
}

// CreateComment inserts a comment on a wall post and increments its comment count.
func (r *WallPostRepository) CreateComment(ctx context.Context, comment *WallPostComment) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx, `
		INSERT INTO wall_post_comments (wall_post_id, author_id, body)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`, comment.WallPostID, comment.AuthorID, comment.Body).Scan(&comment.ID, &comment.CreatedAt)
	if err != nil {
		return err
	}

	if _, err = tx.Exec(ctx, `UPDATE wall_posts SET comment_count = comment_count + 1 WHERE id = $1`, comment.WallPostID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetComments returns comments for a wall post, oldest first, with the
// viewer's reaction state attached.
func (r *WallPostRepository) GetComments(ctx context.Context, wallPostID, viewerID, limit, offset int) ([]*WallPostComment, error) {
	query := `
		SELECT wpc.id, wpc.wall_post_id, wpc.author_id, u.username, u.avatar_url, wpc.body,
		       wpc.like_count, wpc.dislike_count, wpc.created_at,
		       COALESCE(wcr.reaction_type = 'like', FALSE) AS liked_by_viewer,
		       COALESCE(wcr.reaction_type = 'dislike', FALSE) AS disliked_by_viewer
		FROM wall_post_comments wpc
		JOIN users u ON u.id = wpc.author_id
		LEFT JOIN wall_post_comment_reactions wcr ON wcr.comment_id = wpc.id AND wcr.user_id = $4
		WHERE wpc.wall_post_id = $1 AND wpc.is_deleted = FALSE
		ORDER BY wpc.created_at ASC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, wallPostID, limit, offset, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := []*WallPostComment{}
	for rows.Next() {
		comment := &WallPostComment{}
		if err := rows.Scan(
			&comment.ID,
			&comment.WallPostID,
			&comment.AuthorID,
			&comment.AuthorUsername,
			&comment.AuthorAvatarURL,
			&comment.Body,
			&comment.LikeCount,
			&comment.DislikeCount,
			&comment.CreatedAt,
			&comment.LikedByViewer,
			&comment.DislikedByViewer,
		); err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}
	return comments, rows.Err()
}

// SetCommentReaction sets, switches, or clears the viewer's like/dislike on a
// wall post comment. See setReaction for the shared toggle semantics.
func (r *WallPostRepository) SetCommentReaction(ctx context.Context, commentID, userID int, reaction ReactionType) (liked, disliked bool, likeCount, dislikeCount int, err error) {
	return r.setReaction(ctx, "wall_post_comment_reactions", "comment_id", "wall_post_comments", commentID, userID, reaction)
}

// GetCommentByID returns a single wall post comment, or nil if not found / deleted.
func (r *WallPostRepository) GetCommentByID(ctx context.Context, id int) (*WallPostComment, error) {
	comment := &WallPostComment{}
	err := r.pool.QueryRow(ctx, `
		SELECT id, wall_post_id, author_id, body, created_at
		FROM wall_post_comments
		WHERE id = $1 AND is_deleted = FALSE
	`, id).Scan(&comment.ID, &comment.WallPostID, &comment.AuthorID, &comment.Body, &comment.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return comment, nil
}

// DeleteComment soft-deletes a wall post comment and decrements its post's comment count.
func (r *WallPostRepository) DeleteComment(ctx context.Context, id int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var wallPostID int
	err = tx.QueryRow(ctx, `
		UPDATE wall_post_comments SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE
		RETURNING wall_post_id
	`, id).Scan(&wallPostID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return tx.Commit(ctx)
		}
		return err
	}

	if _, err = tx.Exec(ctx, `UPDATE wall_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1`, wallPostID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
