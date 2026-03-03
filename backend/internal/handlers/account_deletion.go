package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/utils"
)

type AccountDeletionHandler struct {
	db    *pgxpool.Pool
	queue *queue.QueueClient
}

func NewAccountDeletionHandler(db *pgxpool.Pool, queueClient *queue.QueueClient) *AccountDeletionHandler {
	return &AccountDeletionHandler{
		db:    db,
		queue: queueClient,
	}
}

// RequestAccountDeletion schedules account deletion with a 30-day grace period.
// @Summary      Request account deletion
// @Tags         Account
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/delete [post]
func (h *AccountDeletionHandler) RequestAccountDeletion(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Password string `json:"password" binding:"required"`
		Confirm  string `json:"confirm" binding:"required"` // Must type "DELETE MY ACCOUNT"
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Verify confirmation text
	if req.Confirm != "DELETE MY ACCOUNT" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Please type 'DELETE MY ACCOUNT' to confirm",
		})
		return
	}

	// Verify password and get user details
	var storedPasswordHash string
	var email *string
	var username string
	err := h.db.QueryRow(context.Background(), `
		SELECT password_hash, email, username FROM users WHERE id = $1
	`, userID).Scan(&storedPasswordHash, &email, &username)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify user")
		return
	}

	// Verify password using bcrypt
	if err := utils.CheckPassword(storedPasswordHash, req.Password); err != nil {
		RespondError(c, http.StatusUnauthorized, "Invalid password")
		return
	}

	// Soft delete: set deleted_at timestamp (30-day grace period)
	deletionDate := time.Now().Add(30 * 24 * time.Hour) // 30 days from now
	_, err = h.db.Exec(context.Background(), `
		UPDATE users
		SET 
			deleted_at = NOW(),
			permanent_deletion_at = $1,
			email = 'deleted_' || id || '@deleted.omninudge.com',
			username = 'deleted_user_' || id
		WHERE id = $2 AND deleted_at IS NULL
	`, deletionDate, userID)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete account")
		return
	}

	// Log deletion request for audit
	_, _ = h.db.Exec(context.Background(), `
		INSERT INTO account_deletion_log (user_id, requested_at, deletion_date, reason)
		VALUES ($1, NOW(), $2, 'user_requested')
	`, userID, deletionDate)

	// Send confirmation email if user has email (P0-017: Account deletion email confirmation)
	if email != nil && *email != "" && h.queue != nil {
		subject := "OmniNudge Account Deletion Confirmation"
		body := fmt.Sprintf(`Hi %s,

Your OmniNudge account deletion has been scheduled.

Deletion Details:
- Username: %s
- Scheduled deletion date: %s
- Grace period: 30 days

What happens next:
1. Your account is now hidden and inaccessible to other users
2. You have 30 days to cancel this deletion by logging back in
3. After 30 days, all your data will be permanently deleted

To cancel deletion:
Simply log in to your account before %s and navigate to Settings > Account.

If you did not request this deletion, please log in immediately to cancel it.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.`,
			username,
			username,
			deletionDate.Format("January 2, 2006 at 3:04 PM MST"),
			deletionDate.Format("January 2, 2006"),
		)

		// Enqueue email job
		_ = h.queue.EnqueueEmail(context.Background(), []string{*email}, subject, body)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":               "Account scheduled for deletion",
		"deletion_date":         deletionDate.Format(time.RFC3339),
		"grace_period_days":     30,
		"recovery_instructions": "To cancel deletion, log in before " + deletionDate.Format("2006-01-02"),
		"email_sent":            email != nil && *email != "",
	})
}

// CancelAccountDeletion cancels a pending account deletion during the grace period.
// @Summary      Cancel account deletion
// @Tags         Account
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/cancel-deletion [post]
func (h *AccountDeletionHandler) CancelAccountDeletion(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Check if account is pending deletion and get user details
	var deletedAt *time.Time
	var permanentDeletionAt *time.Time
	var email *string
	var username string
	err := h.db.QueryRow(context.Background(), `
		SELECT deleted_at, permanent_deletion_at, email, username
		FROM users
		WHERE id = $1
	`, userID).Scan(&deletedAt, &permanentDeletionAt, &email, &username)

	if err != nil || deletedAt == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Account is not scheduled for deletion",
		})
		return
	}

	// Check if grace period has expired
	if permanentDeletionAt != nil && time.Now().After(*permanentDeletionAt) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Grace period has expired, account cannot be recovered",
		})
		return
	}

	// Restore account
	_, err = h.db.Exec(context.Background(), `
		UPDATE users
		SET 
			deleted_at = NULL,
			permanent_deletion_at = NULL
		WHERE id = $1
	`, userID)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to cancel deletion")
		return
	}

	// Log cancellation for audit
	_, _ = h.db.Exec(context.Background(), `
		INSERT INTO account_deletion_log (user_id, requested_at, reason)
		VALUES ($1, NOW(), 'deletion_cancelled')
	`, userID)

	// Send confirmation email (P0-017: Account deletion email confirmation)
	if email != nil && *email != "" && h.queue != nil {
		subject := "OmniNudge Account Deletion Cancelled"
		body := fmt.Sprintf(`Hi %s,

Your account deletion has been successfully cancelled.

Your account is now fully restored and active:
- Username: %s
- Restored at: %s

Your account and all associated data have been preserved. You can continue using OmniNudge as normal.

If you did not cancel this deletion, please contact support immediately.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.`,
			username,
			username,
			time.Now().Format("January 2, 2006 at 3:04 PM MST"),
		)

		// Enqueue email job
		_ = h.queue.EnqueueEmail(context.Background(), []string{*email}, subject, body)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Account deletion cancelled successfully",
		"email_sent": email != nil && *email != "",
	})
}

// GetAccountDeletionStatus returns whether the account is pending deletion.
// @Summary      Get account deletion status
// @Tags         Account
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/deletion-status [get]
func (h *AccountDeletionHandler) GetAccountDeletionStatus(c *gin.Context) {
	userID := c.GetInt("user_id")

	var deletedAt *time.Time
	var permanentDeletionAt *time.Time
	err := h.db.QueryRow(context.Background(), `
		SELECT deleted_at, permanent_deletion_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&deletedAt, &permanentDeletionAt)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check deletion status")
		return
	}

	if deletedAt == nil {
		c.JSON(http.StatusOK, gin.H{
			"pending_deletion": false,
		})
		return
	}

	daysUntilDeletion := 0
	if permanentDeletionAt != nil {
		daysUntilDeletion = int(time.Until(*permanentDeletionAt).Hours() / 24)
	}

	c.JSON(http.StatusOK, gin.H{
		"pending_deletion":    true,
		"deletion_requested":  deletedAt.Format(time.RFC3339),
		"permanent_deletion":  permanentDeletionAt.Format(time.RFC3339),
		"days_until_deletion": daysUntilDeletion,
		"can_cancel":          daysUntilDeletion > 0,
	})
}
