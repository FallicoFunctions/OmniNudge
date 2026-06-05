package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	zlog "github.com/rs/zerolog/log"
)

// redactBlockedComments replaces the body and author of comments whose
// authors have a block relationship with the viewer. The comment node itself
// is kept so reply children remain reachable in the thread.
// viewerID == 0 (unauthenticated) is a no-op.
//
// Uses a single batch query (one DB round-trip) to resolve all block pairs
// for the comment set, avoiding the N+1 pattern of per-comment lookups.
func redactBlockedComments(ctx context.Context, pool *pgxpool.Pool, viewerID int, comments []*models.PostComment) {
	if viewerID == 0 || len(comments) == 0 || pool == nil {
		return
	}

	// Collect unique author IDs (excluding the viewer — never redact own comments).
	seen := make(map[int]struct{})
	var authorIDs []int
	for _, c := range comments {
		if c == nil || c.IsDeleted || c.UserID == viewerID {
			continue
		}
		if _, ok := seen[c.UserID]; !ok {
			seen[c.UserID] = struct{}{}
			authorIDs = append(authorIDs, c.UserID)
		}
	}
	if len(authorIDs) == 0 {
		return
	}

	// One query: fetch the subset of authorIDs that have a block relationship with
	// the viewer. This is intentionally more targeted than models.GetAllBlockedIDs
	// (which returns ALL of viewerID's blocks) — by filtering against the specific
	// authorIDs present in the comment set we avoid scanning the full block list
	// for posts with many blocked users who did not comment on this thread.
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT
			CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END
		FROM blocked_users
		WHERE (blocker_id = $1 AND blocked_id = ANY($2))
		   OR (blocker_id = ANY($2) AND blocked_id = $1)
	`, viewerID, authorIDs)
	if err != nil {
		return // fail open: don't redact if we can't determine block status
	}
	defer rows.Close()

	blockedAuthors := make(map[int]struct{})
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return
		}
		blockedAuthors[id] = struct{}{}
	}
	if rows.Err() != nil {
		// A mid-stream DB error means the block set may be incomplete. We fail
		// open here (same as the query-error path above): an incomplete redaction
		// is preferable to suppressing an entire comment thread, and comment
		// display is not a security boundary where fail-closed is required.
		return
	}
	if len(blockedAuthors) == 0 {
		return
	}

	for _, c := range comments {
		if c == nil || c.IsDeleted || c.UserID == viewerID {
			continue
		}
		if _, blocked := blockedAuthors[c.UserID]; blocked {
			c.Body = models.BlockedCommentPlaceholder
			c.Username = models.BlockedCommentPlaceholder
			c.UserID = 0
			c.User = nil
		}
	}
}

// BlockingHandler handles user blocking/unblocking
type BlockingHandler struct {
	pool     *pgxpool.Pool
	userRepo ports.UserRepository
}

// NewBlockingHandler creates a new blocking handler
func NewBlockingHandler(pool *pgxpool.Pool, userRepo ports.UserRepository) *BlockingHandler {
	return &BlockingHandler{
		pool:     pool,
		userRepo: userRepo,
	}
}

type blockUserRequest struct {
	Username string `json:"username" binding:"required"`
}

// BlockUser blocks another user.
// @Summary      Block user
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/block [post]
func (h *BlockingHandler) BlockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")

	var req blockUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Get user to block
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	if blockedUser == nil || isPendingDeletionHiddenFromViewer(blockedUser, blockerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Can't block yourself
	if blockedUser.ID == blockerID {
		RespondError(c, http.StatusBadRequest, "Cannot block yourself")
		return
	}

	ctx := c.Request.Context()

	// Both the INSERT and the friendship DELETE must succeed atomically.
	// Using a transaction ensures that a blocked user never remains visible
	// as a "friend" after the block is confirmed: either both writes land or
	// neither does, preserving a consistent state.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to block user")
		return
	}
	defer func() {
		// Rollback is a no-op after Commit; safe to call unconditionally.
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			zlog.Error().Err(rbErr).Msg("blocking: rollback after block error")
		}
	}()

	// Insert block row (idempotent).
	if _, err = tx.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
		ON CONFLICT (blocker_id, blocked_id) DO NOTHING
	`, blockerID, blockedUser.ID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to block user")
		return
	}

	// Cancel any pending friend request and remove any accepted friendship
	// between the two users. A block supersedes a friendship.
	// Use models.CanonicalUserPair so the ordering is always consistent with
	// how user_friendship.go addresses its rows.
	lo, hi := models.CanonicalUserPair(blockerID, blockedUser.ID)
	if _, err = tx.Exec(ctx, `
		DELETE FROM user_friendships
		WHERE user_id = $1 AND friend_user_id = $2
	`, lo, hi); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to block user")
		return
	}

	if err = tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to block user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User blocked successfully"})
}

// UnblockUser removes a block on another user.
// @Summary      Unblock user
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username to unblock"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/block/{username} [delete]
func (h *BlockingHandler) UnblockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")
	username := c.Param("username")

	// Get user to unblock
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	if blockedUser == nil || isPendingDeletionHiddenFromViewer(blockedUser, blockerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Unblock the user
	query := `
		DELETE FROM blocked_users
		WHERE blocker_id = $1 AND blocked_id = $2
	`

	result, err := h.pool.Exec(c.Request.Context(), query, blockerID, blockedUser.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unblock user")
		return
	}

	if result.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "User was not blocked")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User unblocked successfully"})
}

// GetBlockedUsers returns the list of blocked users.
// @Summary      Get blocked users
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/blocked [get]
func (h *BlockingHandler) GetBlockedUsers(c *gin.Context) {
	blockerID := c.GetInt("user_id")

	query := `
		SELECT u.id, u.username, u.avatar_url, bu.blocked_at
		FROM blocked_users bu
		JOIN users u ON bu.blocked_id = u.id
		WHERE bu.blocker_id = $1
		ORDER BY bu.blocked_at DESC
	`

	rows, err := h.pool.Query(c.Request.Context(), query, blockerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch blocked users")
		return
	}
	defer rows.Close()

	type blockedUser struct {
		ID        int       `json:"id"`
		Username  string    `json:"username"`
		AvatarURL *string   `json:"avatar_url"`
		BlockedAt time.Time `json:"blocked_at"`
	}

	var blockedUsers []blockedUser
	for rows.Next() {
		var bu blockedUser
		if err := rows.Scan(&bu.ID, &bu.Username, &bu.AvatarURL, &bu.BlockedAt); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
			return
		}
		blockedUsers = append(blockedUsers, bu)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch blocked users")
		return
	}

	c.JSON(http.StatusOK, gin.H{"blocked_users": blockedUsers})
}
